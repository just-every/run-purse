-- Bearer links are installation authority, never portable supplier evidence.
CREATE TABLE p_supplier_document_links (
    hash TEXT PRIMARY KEY NOT NULL CHECK(length(hash)=64 AND hash NOT GLOB '*[^0-9a-f]*'),
    document TEXT NOT NULL,
    supplier TEXT NOT NULL,
    document_version INTEGER NOT NULL CHECK(document_version>0),
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);
