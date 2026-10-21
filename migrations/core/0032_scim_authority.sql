-- Native-owner-approved SCIM service authority is installation-local. Domain
-- export excludes this table; restore never recreates a credential or consent.
CREATE TABLE p_scim_authority (
 kind TEXT PRIMARY KEY CHECK(kind IN ('scimConfig','scimCredential')),
 revision TEXT NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TRIGGER p_scim_authority_insert AFTER INSERT ON p_scim_authority
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_scim_authority_update AFTER UPDATE ON p_scim_authority
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_scim_authority_delete AFTER DELETE ON p_scim_authority
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
