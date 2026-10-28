-- Current installation proof is intentionally excluded from portable history.
CREATE TABLE p_cross_review_authority (
 review TEXT PRIMARY KEY,
 version INTEGER NOT NULL,
 actor TEXT NOT NULL,
 operator_version INTEGER NOT NULL
);
