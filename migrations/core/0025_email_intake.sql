-- Provider message identity is the durable replay boundary, including uncertain claims.
CREATE TABLE p_email_intake_receipts (
 provider TEXT NOT NULL,
 email_id TEXT NOT NULL,
 intake_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('claimed','stored','uncertain')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(provider,email_id)
);
