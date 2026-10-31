-- Installation-local SAML correlation and immutable configuration pins.
CREATE TABLE p_saml_pins (
 provider_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, linked_at INTEGER NOT NULL
);
CREATE TABLE p_saml_transactions (
 relay_hash TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, provider_id TEXT NOT NULL,
 binding_hash TEXT NOT NULL, generation INTEGER NOT NULL, fingerprint TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE INDEX p_saml_transaction_expiry ON p_saml_transactions(expires_at);
CREATE TABLE p_saml_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
