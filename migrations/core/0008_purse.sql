CREATE TABLE p_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO p_meta VALUES(1,0);
CREATE TABLE p_records (business TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(business,kind,id));
CREATE TRIGGER p_records_insert AFTER INSERT ON p_records BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_records_update AFTER UPDATE ON p_records BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER p_records_delete AFTER DELETE ON p_records BEGIN UPDATE p_meta SET revision=revision+1 WHERE id=1; END;
CREATE TABLE p_guard (ok INTEGER NOT NULL CHECK(ok=1));
