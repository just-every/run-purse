-- Execution consent is installation-local; archives retain policy history only.
CREATE TABLE p_intake_agent_authority (
 policy TEXT PRIMARY KEY,
 version INTEGER NOT NULL,
 actor TEXT NOT NULL,
 operator_version INTEGER NOT NULL
);
