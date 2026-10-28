-- Internal comment search is derived and excluded from archives. Current
-- source history rebuilds it before a query; neither the index nor a restore
-- grants access to its parent.
CREATE TABLE p_comment_search (
    business TEXT NOT NULL,
    comment TEXT NOT NULL,
    parent_kind TEXT NOT NULL,
    parent_record TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (business, comment)
);
CREATE INDEX p_comment_search_parent ON p_comment_search(business, parent_kind, parent_record);
CREATE TRIGGER p_comment_search_update AFTER UPDATE ON p_records WHEN old.kind='comment' BEGIN
    DELETE FROM p_comment_search WHERE business=old.business AND comment=old.id;
END;
CREATE TRIGGER p_comment_search_delete AFTER DELETE ON p_records WHEN old.kind='comment' BEGIN
    DELETE FROM p_comment_search WHERE business=old.business AND comment=old.id;
END;
