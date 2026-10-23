-- Installation-local outbound credentials; excluded from portable archives.
CREATE TABLE p_pantry_credentials (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL,
 generation INTEGER NOT NULL CHECK(generation > 0),
 created_at TEXT NOT NULL,
 revoked_at TEXT,
 key_id TEXT NOT NULL,
 nonce TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 tag TEXT NOT NULL
);
