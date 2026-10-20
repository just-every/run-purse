-- Bearer authority and replay responses stay in this installation, outside archives.
CREATE TABLE p_integration_tokens (
 id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 requester TEXT NOT NULL, requester_email TEXT NOT NULL,
 generation INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 rotated_at TEXT, revoked_at TEXT
);
CREATE TABLE p_integration_requests (
 integration TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 body_hash TEXT NOT NULL, response TEXT NOT NULL,
 PRIMARY KEY(integration,idempotency_key)
);
