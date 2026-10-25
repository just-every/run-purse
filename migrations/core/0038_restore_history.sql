-- Installation-local report of how erasure history was established for a restore;
-- excluded from portable archives, so it never travels to another installation.
CREATE TABLE p_restore_history (
 id TEXT PRIMARY KEY CHECK(id = 'main'),
 acknowledged_by TEXT,
 acknowledged_at TEXT,
 acknowledgment TEXT,
 journal_supplied INTEGER CHECK(journal_supplied IN (0, 1)),
 archive_at TEXT,
 source_identity TEXT,
 restored_at TEXT
);
