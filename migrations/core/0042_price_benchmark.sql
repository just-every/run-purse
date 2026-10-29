-- Benchmark enablement is installation authority, excluded from portable history.
CREATE TABLE p_benchmark_policy_authority (
    policy TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    actor TEXT NOT NULL,
    operator_version INTEGER NOT NULL
);
