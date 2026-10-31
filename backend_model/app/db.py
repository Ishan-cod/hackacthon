import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.core.config import get_settings


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    path = get_settings().database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            issue_type TEXT NOT NULL, department TEXT NOT NULL, severity INTEGER NOT NULL,
            status TEXT NOT NULL, description TEXT, transcript TEXT, transcript_language TEXT,
            image_path TEXT, audio_path TEXT, video_path TEXT, latitude REAL, longitude REAL,
            visual_evidence TEXT NOT NULL DEFAULT '[]', suggested_severity INTEGER,
            justification TEXT, hazards TEXT NOT NULL DEFAULT '[]', image_quality TEXT,
            consistency TEXT, model_confidence_uncalibrated REAL,
            rules_applied TEXT NOT NULL DEFAULT '[]', needs_human_review INTEGER NOT NULL,
            review_requested INTEGER NOT NULL DEFAULT 0,
            review_reasons TEXT NOT NULL DEFAULT '[]', is_simulated INTEGER NOT NULL DEFAULT 0,
            vision_provider TEXT, vision_model TEXT, asr_provider TEXT, asr_model TEXT,
            ast_tags TEXT NOT NULL DEFAULT '[]', audio_events TEXT NOT NULL DEFAULT 'null',
            audio_timeline TEXT NOT NULL DEFAULT 'null', severity_score INTEGER NOT NULL DEFAULT 0,
            severity_factors TEXT NOT NULL DEFAULT '{}', text_issue_type TEXT, detected_language TEXT,
            location_context TEXT NOT NULL DEFAULT '[]', duplicate_cluster_id TEXT,
            duplicate_count INTEGER NOT NULL DEFAULT 1, visual_risk_factors TEXT NOT NULL DEFAULT '[]',
            text_analysis TEXT NOT NULL DEFAULT '{}', ward_id TEXT, ward_name TEXT,
            assigned_officer TEXT, assigned_queue TEXT, sla_hours REAL,
            escalation_path TEXT NOT NULL DEFAULT '[]', routing_rule_id INTEGER,
            reporter_label TEXT NOT NULL DEFAULT 'Anonymous',
            reporter_email TEXT, reporter_phone TEXT, notification_channels TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tickets_review ON tickets(needs_human_review, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
        CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
            status TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
            field TEXT NOT NULL, old_value TEXT, new_value TEXT, actor TEXT NOT NULL,
            reason TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS provider_traces (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
            provider TEXT NOT NULL, model TEXT NOT NULL, task TEXT NOT NULL,
            outcome TEXT NOT NULL, latency_ms INTEGER, error_code TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS routing_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT, issue_type TEXT, ward_id TEXT,
            department TEXT NOT NULL, officer TEXT, queue TEXT, sla_hours REAL NOT NULL,
            escalation_path TEXT NOT NULL DEFAULT '[]', priority INTEGER NOT NULL DEFAULT 100,
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ticket_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
            author_label TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ticket_votes (
            ticket_id TEXT NOT NULL REFERENCES tickets(id), voter_id TEXT NOT NULL,
            created_at TEXT NOT NULL, PRIMARY KEY(ticket_id,voter_id)
        );
        CREATE TABLE IF NOT EXISTS ticket_ratings (
            ticket_id TEXT NOT NULL REFERENCES tickets(id), voter_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT,
            created_at TEXT NOT NULL, PRIMARY KEY(ticket_id,voter_id)
        );
        CREATE TABLE IF NOT EXISTS notification_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
            channel TEXT NOT NULL, destination TEXT NOT NULL, message TEXT NOT NULL,
            outcome TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL
        );
        """)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(tickets)")}
        if "review_requested" not in columns:
            conn.execute("ALTER TABLE tickets ADD COLUMN review_requested INTEGER NOT NULL DEFAULT 0")
        for name, declaration in (("video_path", "TEXT"),
                                  ("audio_events", "TEXT NOT NULL DEFAULT 'null'"),
                                  ("audio_timeline", "TEXT NOT NULL DEFAULT 'null'"),
                                  ("severity_score", "INTEGER NOT NULL DEFAULT 0"),
                                  ("severity_factors", "TEXT NOT NULL DEFAULT '{}'"),
                                  ("text_issue_type", "TEXT"),
                                  ("detected_language", "TEXT"),
                                  ("location_context", "TEXT NOT NULL DEFAULT '[]'"),
                                  ("duplicate_cluster_id", "TEXT"),
                                  ("duplicate_count", "INTEGER NOT NULL DEFAULT 1"),
                                  ("visual_risk_factors", "TEXT NOT NULL DEFAULT '[]'"),
                                  ("text_analysis", "TEXT NOT NULL DEFAULT '{}'"),
                                  ("ward_id", "TEXT"), ("ward_name", "TEXT"),
                                  ("assigned_officer", "TEXT"), ("assigned_queue", "TEXT"),
                                  ("sla_hours", "REAL"),
                                  ("escalation_path", "TEXT NOT NULL DEFAULT '[]'"),
                                  ("routing_rule_id", "INTEGER"),
                                  ("reporter_label", "TEXT NOT NULL DEFAULT 'Anonymous'"),
                                  ("reporter_email", "TEXT"), ("reporter_phone", "TEXT"),
                                  ("notification_channels", "TEXT NOT NULL DEFAULT '[]'")):
            if name not in columns:
                conn.execute(f"ALTER TABLE tickets ADD COLUMN {name} {declaration}")
        if conn.execute("SELECT COUNT(*) FROM routing_rules").fetchone()[0] == 0:
            try:
                sla_by_department = json.loads(get_settings().sla_hours_json)
            except json.JSONDecodeError:
                sla_by_department = {}
            defaults = [("pothole", "Roads"), ("water_leak", "Water"),
                        ("garbage", "Sanitation"), ("streetlight", "Electrical"),
                        ("bridge_crack", "Roads & Bridges"), ("other", "Triage desk"),
                        ("not_civic", "Triage desk")]
            for issue, department in defaults:
                fallback_sla = {"Roads":48,"Roads & Bridges":24,"Water":24,"Sanitation":48,"Electrical":24,"Triage desk":72}
                sla = float(sla_by_department.get(department, fallback_sla[department])) if isinstance(sla_by_department, dict) else fallback_sla[department]
                conn.execute("""INSERT INTO routing_rules
                    (issue_type,department,queue,sla_hours,escalation_path,priority,created_at)
                    VALUES(?,?,?,?,?,?,?)""",
                    (issue, department, department, sla, dumps(["JE", "AE", "EE", "Commissioner"]), 100, utc_now()))


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None
