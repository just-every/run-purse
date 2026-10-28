-- Installation-local capabilities never travel with portable saved definitions.
CREATE TABLE p_report_keys (
 id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 actor TEXT NOT NULL, actor_version INTEGER NOT NULL, view TEXT NOT NULL,
 view_version INTEGER NOT NULL, department TEXT NOT NULL, expires_at TEXT NOT NULL,
 revoked_at TEXT, generation INTEGER NOT NULL DEFAULT 1,
 read_window INTEGER NOT NULL DEFAULT 0, read_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE p_report_schedules (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, actor_version INTEGER NOT NULL,
 recipient TEXT NOT NULL, recipient_version INTEGER NOT NULL,
 view TEXT NOT NULL, view_version INTEGER NOT NULL, cadence TEXT NOT NULL,
 anchor TEXT NOT NULL, next_at TEXT NOT NULL, format TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE p_report_deliveries (
 id TEXT PRIMARY KEY, schedule TEXT NOT NULL, due_at TEXT NOT NULL,
 status TEXT NOT NULL, at TEXT NOT NULL
);
