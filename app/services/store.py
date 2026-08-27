"""SQLite persistence and a hash-chained audit log for the console.

Two invariants this module exists to guarantee:

1. A hold transition and its audit entry commit in one SQLite transaction. They
   cannot diverge: if the audit write fails the state change is rolled back.
2. The audit chain is genuinely verified. `verify_chain` recomputes every entry
   hash from the stored payload and the previous hash. It is never a constant.

Decisions survive a page refresh and a process restart because they live in the
database, not in a module-level dict.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(
    os.environ.get(
        "MULESHIELD_CONSOLE_DB",
        Path(__file__).resolve().parent.parent.parent / "data" / "console.db",
    )
)

GENESIS = "0" * 64

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS holds (
    hold_id           TEXT PRIMARY KEY,
    status            TEXT NOT NULL,
    account_id        TEXT NOT NULL,
    action            TEXT NOT NULL,
    rationale         TEXT NOT NULL,
    maker             TEXT,
    checker           TEXT,
    decision_note     TEXT,
    transaction_id    TEXT,
    counterparty      TEXT,
    amount            INTEGER,
    channel           TEXT,
    ring_id           TEXT,
    affected_accounts TEXT,
    created_at        TEXT NOT NULL,
    proposed_at       TEXT,
    decided_at        TEXT,
    expires_at        TEXT NOT NULL,
    audit_reference   TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor      TEXT,
    resource   TEXT,
    payload    TEXT NOT NULL,
    prev_hash  TEXT NOT NULL,
    entry_hash TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _lock:
        conn = connect()
        try:
            conn.executescript(SCHEMA)
        finally:
            conn.close()


def reset_db() -> None:
    """Explicit demo reset. Never called automatically at startup."""
    with _lock:
        conn = connect()
        try:
            conn.execute("DELETE FROM holds")
            conn.execute("DELETE FROM audit_events")
            conn.execute("DELETE FROM sqlite_sequence WHERE name='audit_events'")
        finally:
            conn.close()


def compute_entry_hash(
    seq: int, ts: str, event_type: str, actor: str | None,
    resource: str | None, payload: str, prev_hash: str,
) -> str:
    """Canonical hash over every field that is stored. Order is fixed."""
    material = "|".join([
        str(seq), ts, event_type, actor or "", resource or "", payload, prev_hash,
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _head_hash(conn: sqlite3.Connection) -> str:
    row = conn.execute(
        "SELECT entry_hash FROM audit_events ORDER BY seq DESC LIMIT 1"
    ).fetchone()
    return row["entry_hash"] if row else GENESIS


def _append_audit(
    conn: sqlite3.Connection, event_type: str, actor: str | None,
    resource: str | None, payload: dict[str, Any],
) -> str:
    """Append one entry. Must be called inside an open transaction."""
    prev = _head_hash(conn)
    ts = _now()
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    cur = conn.execute(
        "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM audit_events"
    ).fetchone()
    seq = cur["next"]
    entry_hash = compute_entry_hash(seq, ts, event_type, actor, resource, body, prev)
    conn.execute(
        "INSERT INTO audit_events (seq, ts, event_type, actor, resource, payload,"
        " prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (seq, ts, event_type, actor, resource, body, prev, entry_hash),
    )
    return entry_hash


def verify_chain() -> dict[str, Any]:
    """Recompute the whole chain. This is a real verification, not a constant."""
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_events ORDER BY seq ASC"
        ).fetchall()
    finally:
        conn.close()

    prev = GENESIS
    for row in rows:
        if row["prev_hash"] != prev:
            return {
                "status": "broken",
                "entry_count": len(rows),
                "chain_head": prev,
                "failure": {
                    "seq": row["seq"],
                    "reason": "prev_hash does not match the previous entry hash",
                    "expected": prev,
                    "found": row["prev_hash"],
                },
            }
        recomputed = compute_entry_hash(
            row["seq"], row["ts"], row["event_type"], row["actor"],
            row["resource"], row["payload"], row["prev_hash"],
        )
        if recomputed != row["entry_hash"]:
            return {
                "status": "broken",
                "entry_count": len(rows),
                "chain_head": prev,
                "failure": {
                    "seq": row["seq"],
                    "reason": "entry hash does not match the stored payload",
                    "expected": recomputed,
                    "found": row["entry_hash"],
                },
            }
        prev = row["entry_hash"]

    return {
        "status": "valid",
        "entry_count": len(rows),
        "chain_head": prev,
        "failure": None,
    }


def recent_events(limit: int = 10) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?", (limit,)
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "seq": r["seq"],
            "ts": r["ts"],
            "event_type": r["event_type"],
            "actor": r["actor"],
            "resource": r["resource"],
            "payload": json.loads(r["payload"]),
            "entry_hash": r["entry_hash"],
        }
        for r in rows
    ]


def _row_to_hold(row: sqlite3.Row) -> dict[str, Any]:
    hold = dict(row)
    hold["affected_accounts"] = json.loads(hold["affected_accounts"] or "[]")
    return hold


def get_hold(hold_id: str) -> dict[str, Any] | None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM holds WHERE hold_id = ?", (hold_id,)
        ).fetchone()
    finally:
        conn.close()
    return _row_to_hold(row) if row else None


def list_holds() -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM holds ORDER BY created_at DESC"
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_hold(r) for r in rows]


def insert_hold(record: dict[str, Any], actor: str | None) -> dict[str, Any]:
    """Persist a recommendation and audit its creation atomically."""
    with _lock:
        conn = connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "INSERT INTO holds (hold_id, status, account_id, action, rationale,"
                " maker, checker, decision_note, transaction_id, counterparty,"
                " amount, channel, ring_id, affected_accounts, created_at,"
                " proposed_at, decided_at, expires_at, audit_reference)"
                " VALUES (:hold_id, :status, :account_id, :action, :rationale,"
                " :maker, :checker, :decision_note, :transaction_id, :counterparty,"
                " :amount, :channel, :ring_id, :affected_accounts, :created_at,"
                " :proposed_at, :decided_at, :expires_at, :audit_reference)",
                {**record,
                 "affected_accounts": json.dumps(record.get("affected_accounts", []))},
            )
            ref = _append_audit(
                conn, "HOLD_PROPOSED", actor, record["hold_id"],
                {
                    "hold_id": record["hold_id"],
                    "account_id": record["account_id"],
                    "action": record["action"],
                    "maker": record["maker"],
                    "status": record["status"],
                    "expires_at": record["expires_at"],
                },
            )
            conn.execute(
                "UPDATE holds SET audit_reference = ? WHERE hold_id = ?",
                (ref, record["hold_id"]),
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return get_hold(record["hold_id"])


def decide_hold(
    hold_id: str, status: str, checker: str, note: str | None,
) -> dict[str, Any]:
    """Apply a terminal decision and its audit entry in one transaction."""
    with _lock:
        conn = connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            decided_at = _now()
            conn.execute(
                "UPDATE holds SET status = ?, checker = ?, decision_note = ?,"
                " decided_at = ? WHERE hold_id = ?",
                (status, checker, note, decided_at, hold_id),
            )
            ref = _append_audit(
                conn, "HOLD_" + status.upper(), checker, hold_id,
                {
                    "hold_id": hold_id,
                    "status": status,
                    "checker": checker,
                    "decision_note": note,
                    "decided_at": decided_at,
                },
            )
            conn.execute(
                "UPDATE holds SET audit_reference = ? WHERE hold_id = ?",
                (ref, hold_id),
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return get_hold(hold_id)


def record_analyst_decision(
    account_id: str, decision: str, rationale: str, actor: str,
) -> str:
    with _lock:
        conn = connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            ref = _append_audit(
                conn, "ANALYST_DECISION", actor, account_id,
                {
                    "account_id": account_id,
                    "decision": decision,
                    "rationale": rationale,
                },
            )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return ref
