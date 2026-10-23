-- Separate read-only capability; existing integration tokens remain create-only.
ALTER TABLE p_integration_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'create-purchase-requests';
ALTER TABLE p_integration_tokens ADD COLUMN suppliers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE p_integration_tokens ADD COLUMN expires_at TEXT;
ALTER TABLE p_integration_tokens ADD COLUMN read_window INTEGER NOT NULL DEFAULT 0;
ALTER TABLE p_integration_tokens ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0;
