-- Standing matching consent is local authority, excluded from archives.
CREATE TABLE p_matching_authority (
    rule TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    actor TEXT NOT NULL,
    operator_version INTEGER NOT NULL
);
