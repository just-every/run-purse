-- Capabilities are installation-local authority, excluded from portable archives.
CREATE TABLE p_rfq_links (
    hash TEXT PRIMARY KEY,
    rfq TEXT NOT NULL,
    supplier TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    generation INTEGER NOT NULL CHECK(generation > 0)
);
CREATE UNIQUE INDEX p_rfq_live_supplier ON p_rfq_links(rfq,supplier) WHERE revoked_at IS NULL;
