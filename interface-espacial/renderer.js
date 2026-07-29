import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";

const statusDot = document.getElementById("status-dot");
const cursorEl = document.getElementById("cursor");
const radialHub = document.getElementById("radial-hub");
const ringMain = document.getElementById("ring-main");
const ringTools = document.getElementById("ring-tools");
const colorRow = document.getElementById("color-row");
const launcherPanel = document.getElementById("launcher-panel");
const launcherGridEl = document.getElementById("launcher-grid");
const browserCardEl = document.getElementById("browser-card");
const browserUrl = document.getElementById("browser-url");
const browserGo = document.getElementById("browser-go");
const browserBack = document.getElementById("browser-back");
const webview = document.getElementById("webview");

const drawCanvas = document.getElementById("draw-canvas");
const drawCtx = drawCanvas.getContext("2d");
const threeCanvasContainer = document.getElementById("three-canvas");
const css3dContainer = document.getElementById("css3d-container");

// --------------------------------------------------------------------
// Layout dos anéis (posiciona os botões em arco ao redor do hub)
// --------------------------------------------------------------------
function layoutRing(ringEl, radius, startDeg, endDeg) {
  const items = ringEl.querySelectorAll(".circle-btn");
  const n = items.length;
  items.forEach((el, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius;
    el.style.left = `${x - 28}px`;
    el.style.top = `${y - 28}px`;
  });
}
layoutRing(ringMain, 100, 190, 350);
layoutRing(ringTools, 110, 200, 340);

// --------------------------------------------------------------------
// Estado
// --------------------------------------------------------------------
let mode = "launcher";   // "launcher" | "create" | "browser"
let tool = "draw";       // "draw" | "box" | "sphere" | "cylinder"
let currentColor = "#2563eb";
let radialOpen = false;
let isPinching = false;
let isDrawing = false;
let lastPoint = null;
let dragLastNorm = null;
const handPositions = { Left: null, Right: null };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// "Objeto flutuante ativo": pode ser uma forma 3D (Mesh) ou o card do
// navegador (CSS3DObject) — os dois têm position/rotation/scale, então a
// mesma lógica de arrastar/girar/redimensionar serve pra qualquer um.
function getActiveObject() {
  if (mode === "create" && tool !== "draw") return currentShape;
  if (mode === "browser") return browserObject;
  return null;
}

function getActiveBaseScale() {
  return mode === "browser" ? BROWSER_BASE_SCALE : 1;
}

function updateThreeVisibility() {
  threeCanvasContainer.classList.toggle("visible", mode === "create" && tool !== "draw" && currentShape !== null);
  css3dContainer.classList.toggle("visible", mode === "browser");
}

function setMode(newMode) {
  mode = newMode;
  radialOpen = false;
  ringMain.classList.add("hidden");
  launcherPanel.classList.toggle("visible", mode === "launcher");
  ringTools.classList.toggle("hidden", mode !== "create");
  colorRow.classList.toggle("hidden", mode !== "create");
  updateThreeVisibility();
  stopDrawing();
}

function setTool(newTool) {
  tool = newTool;
  ringTools.querySelectorAll(".circle-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tool === tool));
  if (tool !== "draw" && currentShapeType !== tool) rebuildShape(tool);
  updateThreeVisibility();
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function navigateBrowser() {
  webview.src = normalizeUrl(browserUrl.value);
}

browserGo.addEventListener("click", navigateBrowser);
browserUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") navigateBrowser(); });
browserBack.addEventListener("click", () => { if (webview.canGoBack()) webview.goBack(); });
webview.addEventListener("did-navigate", () => { browserUrl.value = webview.src; });

radialHub.addEventListener("click", () => {
  radialOpen = !radialOpen;
  ringMain.classList.toggle("hidden", !radialOpen);
});

ringMain.querySelectorAll(".circle-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

ringTools.querySelectorAll(".circle-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

colorRow.querySelectorAll(".color-swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentColor = btn.dataset.color;
    colorRow.querySelectorAll(".color-swatch").forEach((b) => b.classList.toggle("active", b === btn));
    drawCtx.strokeStyle = currentColor;
    if (currentShape) currentShape.material.color.set(currentColor);
  });
});

// --------------------------------------------------------------------
// Canvas de desenho
// --------------------------------------------------------------------
function resizeCanvas() {
  drawCanvas.width = window.innerWidth;
  drawCanvas.height = window.innerHeight;
  drawCtx.lineJoin = "round";
  drawCtx.lineCap = "round";
  drawCtx.lineWidth = 4;
  drawCtx.strokeStyle = currentColor;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function startDrawing() { isDrawing = true; lastPoint = null; }
function stopDrawing() { isDrawing = false; lastPoint = null; }

function drawTo(x, y) {
  if (lastPoint) {
    drawCtx.beginPath();
    drawCtx.moveTo(lastPoint.x, lastPoint.y);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  }
  lastPoint = { x, y };
}

// --------------------------------------------------------------------
// Cena 3D (WebGL) — formas geométricas
// --------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
threeCanvasContainer.appendChild(renderer.domElement);

const SHAPE_GEOMETRIES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.6, 32, 32),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1.1, 32),
};

let currentShape = null;
let currentShapeType = null;

function rebuildShape(shapeType) {
  const previousScale = currentShape ? currentShape.scale.x : 1;
  if (currentShape) scene.remove(currentShape);

  const geometry = SHAPE_GEOMETRIES[shapeType]();
  const material = new THREE.MeshBasicMaterial({ color: currentColor });
  currentShape = new THREE.Mesh(geometry, material);
  currentShape.scale.setScalar(previousScale);
  scene.add(currentShape);
  currentShapeType = shapeType;
}

// --------------------------------------------------------------------
// Cena CSS3D — o card do navegador como objeto 3D "de verdade" (o DOM
// real do webview é transformado em 3D via CSS, continua clicável)
// --------------------------------------------------------------------
const cssScene = new THREE.Scene();
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
css3dContainer.appendChild(cssRenderer.domElement);

// O card tem 800x520px reais; essa escala converte pixels de CSS em
// unidades da nossa cena (pequena, câmera a 4 unidades de distância).
const BROWSER_BASE_SCALE = 0.0032;

browserCardEl.style.display = "flex"; // volta a ficar visível (controlado pelo container, não por ele mesmo)
const browserObject = new CSS3DObject(browserCardEl);
browserObject.scale.setScalar(BROWSER_BASE_SCALE);
cssScene.add(browserObject);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
}
animate();

// --------------------------------------------------------------------
// Launcher — cards com ícone (imagem) e fallback pro nome em texto
// --------------------------------------------------------------------
let launcherItems = [];

async function loadLauncherItems() {
  launcherItems = await window.launcherAPI.getItems();
  launcherGridEl.innerHTML = "";
  for (const item of launcherItems) {
    const el = document.createElement("div");
    el.className = "item-card hand-clickable";
    el.dataset.name = item.name;

    if (item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = item.name;
      img.onerror = () => { img.remove(); el.appendChild(makeLabel(item.name)); };
      el.appendChild(img);
    } else {
      el.appendChild(makeLabel(item.name));
    }

    el.addEventListener("click", () => window.launcherAPI.openItem(item));
    launcherGridEl.appendChild(el);
  }
}

function makeLabel(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}
loadLauncherItems();

// --------------------------------------------------------------------
// Interação por gesto: hover + Pinca (uma mão) "clica" em QUALQUER
// elemento .hand-clickable visível na tela.
// --------------------------------------------------------------------
function updateHoveredClickable(clientX, clientY) {
  const elements = document.querySelectorAll(".hand-clickable");
  let found = null;
  elements.forEach((el) => {
    if (el.offsetParent === null) {
      el.classList.remove("hovered");
      return;
    }
    const rect = el.getBoundingClientRect();
    const inside =
      clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
    el.classList.toggle("hovered", inside);
    if (inside) found = el;
  });
  return found;
}

// --------------------------------------------------------------------
// Bridge WebSocket
// --------------------------------------------------------------------
function connect() {
  const ws = new WebSocket("ws://localhost:8765");

  ws.onopen = () => statusDot.classList.add("online");
  ws.onclose = () => {
    statusDot.classList.remove("online");
    setTimeout(connect, 1500);
  };
  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "position") {
      handPositions[data.hand] = { x: data.x, y: data.y };

      // Redimensionar com as duas mãos: distância entre elas vira a escala
      // do objeto flutuante ativo (forma 3D ou card do navegador).
      const active = getActiveObject();
      if (active && handPositions.Left && handPositions.Right) {
        const dx = handPositions.Left.x - handPositions.Right.x;
        const dy = handPositions.Left.y - handPositions.Right.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const factor = clamp(dist * 3.2, 0.3, 3.2);
        active.scale.setScalar(getActiveBaseScale() * factor);
      }

      if (data.hand === "Right") {
        const x = data.x * window.innerWidth;
        const y = data.y * window.innerHeight;
        cursorEl.style.left = `${x}px`;
        cursorEl.style.top = `${y}px`;

        updateHoveredClickable(x, y);

        if (mode === "create" && tool === "draw" && isDrawing) {
          drawTo(x, y);
        } else if (active && isPinching) {
          const hoveredUi = document.querySelector(".hand-clickable.hovered");
          if (hoveredUi) {
            dragLastNorm = null;
          } else {
            if (dragLastNorm) {
              active.rotation.y += (data.x - dragLastNorm.x) * 6;
              active.rotation.x += (data.y - dragLastNorm.y) * 6;
            }
            dragLastNorm = { x: data.x, y: data.y };
            active.position.x = (data.x - 0.5) * 4.5;
            active.position.y = (0.5 - data.y) * 3.2;
          }
        }
      }
    }

    if (data.type === "gesture" && data.hand === "Right") {
      isPinching = data.gesture === "Pinca";
      cursorEl.classList.toggle("selecting", isPinching);

      if (!isPinching) dragLastNorm = null;

      if (isPinching) {
        const hovered = document.querySelector(".hand-clickable.hovered");
        if (hovered) {
          hovered.click();
        } else if (mode === "create" && tool === "draw") {
          startDrawing();
        }
      } else if (mode === "create" && tool === "draw") {
        stopDrawing();
      }
    }

    if (data.type === "gesture" && data.hand === "Left" && data.gesture === "Mao aberta"
        && mode === "create" && tool === "draw") {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
  };
}
connect();

setMode("launcher");