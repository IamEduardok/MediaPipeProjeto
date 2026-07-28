"""
Camada de persistência com SQLite.

Guarda dois tipos de dado:

- config: parâmetros ajustáveis do sistema (ex: threshold de pinça, janela
  de suavização de gestos) — dá pra mudar sem editar o código Python.
- gesture_mappings: qual "ação" cada gesto dispara. Desacopla o nome do
  gesto detectado (Fase 2) da funcionalidade que ele deve acionar (Fase 6+).

O banco (config.db) é criado automaticamente na primeira execução, na
mesma pasta deste arquivo, com valores padrão.
"""

import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "config.db"

DEFAULT_CONFIG = {
    "pinch_threshold": "0.35",
    "gesture_window": "5",
}

DEFAULT_MAPPINGS = {
    "Pinca": "select",
    "Mao aberta": "open_launcher",
    "Punho fechado": "close_launcher",
    "Apontando": "cursor_move",
    "Indefinido": "none",
}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Cria as tabelas (se não existirem) e popula valores padrão apenas
    na primeira vez — execuções seguintes não sobrescrevem o que você
    já tiver ajustado."""
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gesture_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gesture TEXT NOT NULL UNIQUE,
                action TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            )
            """
        )

        for key, value in DEFAULT_CONFIG.items():
            conn.execute(
                "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)",
                (key, value),
            )
        for gesture, action in DEFAULT_MAPPINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO gesture_mappings (gesture, action) VALUES (?, ?)",
                (gesture, action),
            )

        conn.commit()
    finally:
        conn.close()


def get_config(key: str, default: Optional[str] = None) -> Optional[str]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_config(key: str, value: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


def get_action_for_gesture(gesture: str) -> Optional[str]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT action FROM gesture_mappings WHERE gesture = ? AND enabled = 1",
            (gesture,),
        ).fetchone()
        return row["action"] if row else None
    finally:
        conn.close()


def set_mapping(gesture: str, action: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO gesture_mappings (gesture, action) VALUES (?, ?) "
            "ON CONFLICT(gesture) DO UPDATE SET action = excluded.action",
            (gesture, action),
        )
        conn.commit()
    finally:
        conn.close()


def get_all_mappings() -> dict:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT gesture, action, enabled FROM gesture_mappings"
        ).fetchall()
        return {
            row["gesture"]: {"action": row["action"], "enabled": bool(row["enabled"])}
            for row in rows
        }
    finally:
        conn.close()