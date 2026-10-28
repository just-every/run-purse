-- Installation authority and delivery credentials never enter portable domain history.
CREATE TABLE p_api_keys (
 id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 principal TEXT NOT NULL, operator_version INTEGER NOT NULL, native_owner INTEGER NOT NULL,
 scopes TEXT NOT NULL, record_scope TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
 rate_window INTEGER NOT NULL DEFAULT 0, rate_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE p_api_receipts (
 credential TEXT NOT NULL REFERENCES p_api_keys(id) ON DELETE CASCADE,
 idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, kind TEXT NOT NULL, record TEXT NOT NULL,
 PRIMARY KEY(credential,idempotency_key)
);
CREATE TABLE p_webhooks (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL, events TEXT NOT NULL,
 principal TEXT NOT NULL, operator_version INTEGER NOT NULL, generation INTEGER NOT NULL,
 key_id TEXT NOT NULL, nonce TEXT NOT NULL, ciphertext TEXT NOT NULL, tag TEXT NOT NULL,
 created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE p_webhook_events (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, kind TEXT NOT NULL, record TEXT NOT NULL,
 revision INTEGER NOT NULL, at TEXT NOT NULL
);
CREATE TABLE p_webhook_attempts (
 id TEXT PRIMARY KEY, subscription TEXT NOT NULL REFERENCES p_webhooks(id) ON DELETE CASCADE,
 event TEXT NOT NULL REFERENCES p_webhook_events(id) ON DELETE CASCADE,
 generation INTEGER NOT NULL, status TEXT NOT NULL, http_status INTEGER, at TEXT NOT NULL
);
CREATE INDEX p_webhook_delivery ON p_webhook_attempts(subscription,event);
