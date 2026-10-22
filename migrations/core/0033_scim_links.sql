-- Owner consent is installation authority, excluded from portable domain data.
CREATE TABLE p_scim_links (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 issuer TEXT NOT NULL,
 external_id TEXT NOT NULL,
 email TEXT NOT NULL,
 operator_version INTEGER NOT NULL,
 approved_at TEXT NOT NULL,
 revoked_at TEXT,
 UNIQUE(issuer,external_id)
);
CREATE TRIGGER p_scim_links_insert AFTER INSERT ON p_scim_links
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_scim_links_update AFTER UPDATE ON p_scim_links
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_scim_links_delete AFTER DELETE ON p_scim_links
 BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
