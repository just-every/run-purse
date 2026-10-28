-- Current review authority belongs to this installation and is never portable.
CREATE TABLE p_supplier_tax_authority (
    review TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    operator_version INTEGER NOT NULL
);
