"""Small SQLite persistence layer for the A-share watchlist."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

WATCHLIST_KINDS = {"stock"}


def _db_path() -> Path:
    configured = os.getenv("APP_DB_PATH", "").strip()
    return Path(configured) if configured else Path(__file__).resolve().parents[2] / "data" / "app.db"


def _connection() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                code TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                UNIQUE(kind, code)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_watchlist_kind_order "
            "ON watchlist_items(kind, sort_order, id)"
        )


def get_watchlist(kind: str) -> list[str]:
    if kind not in WATCHLIST_KINDS:
        raise ValueError(f"kind 必须是 {sorted(WATCHLIST_KINDS)} 之一")
    with _connection() as conn:
        rows = conn.execute(
            "SELECT code FROM watchlist_items WHERE kind = ? ORDER BY sort_order, id",
            (kind,),
        ).fetchall()
    return [str(row["code"]) for row in rows]


def set_watchlist(kind: str, codes: list[str]) -> list[str]:
    if kind not in WATCHLIST_KINDS:
        raise ValueError(f"kind 必须是 {sorted(WATCHLIST_KINDS)} 之一")
    normalized: list[str] = []
    for code in codes:
        value = str(code).strip().upper()
        if value and value not in normalized:
            normalized.append(value)
    now = datetime.now(timezone.utc).isoformat()
    with _connection() as conn:
        conn.execute("DELETE FROM watchlist_items WHERE kind = ?", (kind,))
        conn.executemany(
            "INSERT INTO watchlist_items(kind, code, sort_order, updated_at) VALUES (?, ?, ?, ?)",
            [(kind, code, index, now) for index, code in enumerate(normalized)],
        )
    return normalized


def db_info() -> dict:
    with _connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM watchlist_items").fetchone()[0]
    return {"path": str(_db_path()), "watchlist_items": count}
