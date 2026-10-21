-- Installation-local ciphertext. Deliberately excluded from default portability.
CREATE TABLE p_supplier_protected (
 business TEXT NOT NULL CHECK(business='main'), supplier TEXT NOT NULL,
 field TEXT NOT NULL CHECK(field IN ('tin','bankAccount','bankRouting')),
 key_id TEXT NOT NULL, nonce TEXT NOT NULL, ciphertext TEXT NOT NULL, tag TEXT NOT NULL,
 PRIMARY KEY(business,supplier,field)
);
