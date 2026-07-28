"""
Fase 8 — Streaming MJPEG da câmera.

Além do WebSocket de gestos (porta 8765), agora também sobe um servidor
HTTP simples (porta 8766) que publica o frame da câmera em MJPEG, pra
Electron mostrar como fundo em vez de uma tela preta.

Rodar:
    python main.py

Pressione 'q' na janela de vídeo local para sair.
"""

import json
import os
import threading
import time
from collections import deque, Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from websockets.sync.server import serve
from websockets.exceptions import ConnectionClosed

import db

MODEL_PATH = "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
WS_HOST, WS_PORT = "localhost", 8765
MJPEG_HOST, MJPEG_PORT = "localhost", 8766

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]

WRIST = 0
THUMB_MCP, THUMB_TIP = 2, 4
INDEX_TIP = 8
MIDDLE_MCP = 9
FINGER_TIP_PIP = {
    "index": (8, 6),
    "middle": (12, 10),
    "ring": (16, 14),
    "pinky": (20, 18),
}



# Servidor WebSocket (eventos de gesto/posição)
_clients = set()
_clients_lock = threading.Lock()


def _handle_client(websocket):
    with _clients_lock:
        _clients.add(websocket)
    print(f"[ws] cliente conectado ({len(_clients)} no total)")
    try:
        for _ in websocket:
            pass
    except ConnectionClosed:
        pass
    finally:
        with _clients_lock:
            _clients.discard(websocket)
        print(f"[ws] cliente desconectado ({len(_clients)} no total)")


def broadcast(event: dict) -> None:
    message = json.dumps(event)
    with _clients_lock:
        dead = []
        for client in _clients:
            try:
                client.send(message)
            except ConnectionClosed:
                dead.append(client)
        for client in dead:
            _clients.discard(client)


def start_ws_server() -> None:
    with serve(_handle_client, WS_HOST, WS_PORT) as server:
        print(f"[ws] servidor rodando em ws://{WS_HOST}:{WS_PORT}")
        server.serve_forever()



# Servidor MJPEG 

_frame_lock = threading.Lock()
_latest_jpeg: Optional[bytes] = None


def update_latest_frame(frame) -> None:
    global _latest_jpeg
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if ok:
        with _frame_lock:
            _latest_jpeg = buffer.tobytes()


class MjpegHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/stream":
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Cache-Control", "no-cache, private")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        try:
            while True:
                with _frame_lock:
                    frame_bytes = _latest_jpeg
                if frame_bytes is not None:
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(frame_bytes)}\r\n\r\n".encode())
                    self.wfile.write(frame_bytes)
                    self.wfile.write(b"\r\n")
                time.sleep(0.033)  # ~30 fps
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass  # silencia um log por frame no console


def start_mjpeg_server() -> None:
    server = ThreadingHTTPServer((MJPEG_HOST, MJPEG_PORT), MjpegHandler)
    print(f"[mjpeg] servidor rodando em http://{MJPEG_HOST}:{MJPEG_PORT}/stream")
    server.serve_forever()



# Visão computacional + classificação de gestos (igual à Fase 5)

def ensure_model() -> None:
    if not os.path.exists(MODEL_PATH):
        print("Modelo não encontrado. Baixando hand_landmarker.task (~12 MB)...")
        import urllib.request
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Modelo baixado com sucesso.")


def _dist(a, b) -> float:
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def _hand_size(landmarks) -> float:
    return _dist(landmarks[WRIST], landmarks[MIDDLE_MCP]) or 1e-6


def _finger_extended(landmarks, tip_idx: int, pip_idx: int) -> bool:
    return landmarks[tip_idx].y < landmarks[pip_idx].y


def _thumb_extended(landmarks, handedness_label: str) -> bool:
    tip, mcp = landmarks[THUMB_TIP], landmarks[THUMB_MCP]
    if handedness_label == "Right":
        return tip.x < mcp.x
    return tip.x > mcp.x


def classify_gesture(landmarks, handedness_label: str, pinch_threshold: float) -> str:
    size = _hand_size(landmarks)
    pinch_dist = _dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / size

    if pinch_dist < pinch_threshold:
        return "Pinca"

    extended = {
        name: _finger_extended(landmarks, tip, pip)
        for name, (tip, pip) in FINGER_TIP_PIP.items()
    }
    extended["thumb"] = _thumb_extended(landmarks, handedness_label)
    count = sum(extended.values())

    if count == 0:
        return "Punho fechado"
    if count >= 4:
        return "Mao aberta"
    if extended["index"] and not extended["middle"] and not extended["ring"] and not extended["pinky"]:
        return "Apontando"
    return "Indefinido"


class GestureSmoother:
    def __init__(self, window: int):
        self.window = window
        self.history: dict[str, deque] = {}

    def update(self, hand_key: str, gesture: str) -> str:
        if hand_key not in self.history:
            self.history[hand_key] = deque(maxlen=self.window)
        self.history[hand_key].append(gesture)
        most_common, _ = Counter(self.history[hand_key]).most_common(1)[0]
        return most_common


def draw_landmarks(frame, hand_landmarks, color=(0, 255, 0)):
    h, w, _ = frame.shape
    points = []
    for lm in hand_landmarks:
        x, y = int(lm.x * w), int(lm.y * h)
        points.append((x, y))
        cv2.circle(frame, (x, y), 4, color, -1)
    for start_idx, end_idx in HAND_CONNECTIONS:
        cv2.line(frame, points[start_idx], points[end_idx], (255, 255, 255), 2)
    return points


def main() -> None:
    ensure_model()
    db.init_db()

    pinch_threshold = float(db.get_config("pinch_threshold", "0.35"))
    gesture_window = int(db.get_config("gesture_window", "5"))
    print(f"[config] pinch_threshold={pinch_threshold} gesture_window={gesture_window}")

    threading.Thread(target=start_ws_server, daemon=True).start()
    threading.Thread(target=start_mjpeg_server, daemon=True).start()
    time.sleep(0.3)

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.6,
        min_tracking_confidence=0.6,
    )
    detector = vision.HandLandmarker.create_from_options(options)
    smoother = GestureSmoother(window=gesture_window)

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError(
            "Não foi possível abrir a webcam. Verifique se outro programa "
            "(Zoom, Teams, etc.) não está usando-a."
        )

    start_time = time.time()
    last_gestures: dict[str, str] = {}
    print("Webcam aberta. Pressione 'q' na janela de vídeo para sair.")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Falha ao ler frame da webcam.")
                break

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            timestamp_ms = int((time.time() - start_time) * 1000)
            result = detector.detect_for_video(mp_image, timestamp_ms)

            for landmarks, handedness in zip(result.hand_landmarks, result.handedness):
                label = handedness[0].category_name
                points = draw_landmarks(frame, landmarks)

                raw_gesture = classify_gesture(landmarks, label, pinch_threshold)
                gesture = smoother.update(label, raw_gesture)
                index_tip = landmarks[INDEX_TIP]

                if last_gestures.get(label) != gesture:
                    action = db.get_action_for_gesture(gesture)
                    print(f"[{label}] gesto: {gesture} -> ação: {action}")
                    last_gestures[label] = gesture
                    broadcast({
                        "type": "gesture",
                        "hand": label,
                        "gesture": gesture,
                        "action": action,
                        "timestamp_ms": timestamp_ms,
                    })

                broadcast({
                    "type": "position",
                    "hand": label,
                    "x": index_tip.x,
                    "y": index_tip.y,
                    "z": index_tip.z,
                    "timestamp_ms": timestamp_ms,
                })

                cv2.putText(
                    frame,
                    f"{label}: {gesture}",
                    (points[0][0] - 30, points[0][1] + 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 200, 255),
                    2,
                )

            update_latest_frame(frame)  # publica o frame anotado pro MJPEG

            cv2.imshow("Hand Tracking - Fase 8 (debug local)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        detector.close()


if __name__ == "__main__":
    main()