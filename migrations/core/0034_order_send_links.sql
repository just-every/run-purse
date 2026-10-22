-- Installation-local bearer authority: never included in a portable archive.
CREATE TABLE p_order_send_links (
    hash TEXT PRIMARY KEY,
    send TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
