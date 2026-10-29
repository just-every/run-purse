-- Installation-local owner consent never travels with purchasing archives.
CREATE TABLE IF NOT EXISTS p_deposit_rule_authority (
    order_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    actor TEXT NOT NULL,
    operator_version INTEGER NOT NULL
);
