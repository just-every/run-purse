-- Edition-owned review fence for retained agent artifacts. The copied door
-- remains unchanged; every write invalidates an outstanding erasure inventory.
CREATE TABLE p_agent_artifact_revision (
  id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL
);
INSERT INTO p_agent_artifact_revision(id,revision) VALUES(1,0);
CREATE TRIGGER p_erasure_agent_door_calls_insert AFTER INSERT ON agent_door_calls
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_calls_update AFTER UPDATE ON agent_door_calls
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_calls_delete AFTER DELETE ON agent_door_calls
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_approvals_insert AFTER INSERT ON agent_door_approvals
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_approvals_update AFTER UPDATE ON agent_door_approvals
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_approvals_delete AFTER DELETE ON agent_door_approvals
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_reviews_insert AFTER INSERT ON agent_door_reviews
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_reviews_update AFTER UPDATE ON agent_door_reviews
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_reviews_delete AFTER DELETE ON agent_door_reviews
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_audit_insert AFTER INSERT ON agent_door_audit
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_audit_update AFTER UPDATE ON agent_door_audit
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_audit_delete AFTER DELETE ON agent_door_audit
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_events_insert AFTER INSERT ON agent_door_events
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_events_update AFTER UPDATE ON agent_door_events
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_events_delete AFTER DELETE ON agent_door_events
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_usage_insert AFTER INSERT ON agent_door_usage
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_usage_update AFTER UPDATE ON agent_door_usage
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_usage_delete AFTER DELETE ON agent_door_usage
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_agents_insert AFTER INSERT ON agent_door_agents
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_agents_update AFTER UPDATE ON agent_door_agents
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER p_erasure_agent_door_agents_delete AFTER DELETE ON agent_door_agents
BEGIN
  UPDATE p_agent_artifact_revision SET revision=revision+1 WHERE id=1;
END;
