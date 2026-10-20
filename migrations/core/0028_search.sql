CREATE VIEW p_search_source AS SELECT
business AS business,
kind AS kind,
id AS id,
coalesce(nullif(coalesce(nullif(CASE WHEN json_type(value,'$.title')='text' THEN json_extract(value,'$.title') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.name')='text' THEN json_extract(value,'$.name') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.description')='text' THEN json_extract(value,'$.description') ELSE '' END,''),''),''),CASE WHEN kind='supplierDocument' THEN 'Supplier agreement' WHEN kind='invoiceReading' THEN 'Invoice document reading' WHEN kind='quoteReading' THEN 'Quote document reading' ELSE kind END) AS title,
coalesce(nullif(CASE WHEN json_type(value,'$.number')='text' THEN json_extract(value,'$.number') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.reference')='text' THEN json_extract(value,'$.reference') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.reference.value')='text' THEN json_extract(value,'$.reference.value') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.partNumber')='text' THEN json_extract(value,'$.partNumber') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.sourceId')='text' THEN json_extract(value,'$.sourceId') ELSE '' END,''),'') AS number,
CASE WHEN json_type(value,'$.supplier')='text' THEN json_extract(value,'$.supplier') ELSE '' END AS supplierId,
CASE WHEN json_type(value,'$.request')='text' THEN json_extract(value,'$.request') ELSE '' END AS requestId,
CASE WHEN json_type(value,'$.order')='text' THEN json_extract(value,'$.order') ELSE '' END AS orderId,
CASE WHEN json_type(value,'$.requester')='text' THEN json_extract(value,'$.requester') ELSE '' END AS requesterId,
CASE WHEN json_type(value,'$.requesterEmail')='text' THEN json_extract(value,'$.requesterEmail') ELSE '' END AS requesterEmail,
coalesce(nullif(CASE WHEN json_type(value,'$.currency')='text' THEN json_extract(value,'$.currency') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.currency.value')='text' THEN json_extract(value,'$.currency.value') ELSE '' END,''),'') AS currency,
CASE WHEN json_type(value,'$.totalMinor')='integer' THEN json_extract(value,'$.totalMinor') WHEN kind='catalogue' AND json_type(value,'$.unitMinor')='integer' THEN json_extract(value,'$.unitMinor') WHEN json_type(value,'$.amounts.totalMinor')='integer' THEN json_extract(value,'$.amounts.totalMinor') END AS amountMinor,
substr(coalesce(nullif(CASE WHEN json_type(value,'$.invoiceDate')='text' THEN json_extract(value,'$.invoiceDate') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.invoiceDate.value')='text' THEN json_extract(value,'$.invoiceDate.value') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.at')='text' THEN json_extract(value,'$.at') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.issuedAt')='text' THEN json_extract(value,'$.issuedAt') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.generatedAt')='text' THEN json_extract(value,'$.generatedAt') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.createdAt')='text' THEN json_extract(value,'$.createdAt') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.needDate')='text' THEN json_extract(value,'$.needDate') ELSE '' END,''),''),1,10) AS date,
coalesce(nullif(CASE WHEN json_type(value,'$.status')='text' THEN json_extract(value,'$.status') ELSE '' END,''),nullif(CASE WHEN json_type(value,'$.event')='text' THEN json_extract(value,'$.event') ELSE '' END,''),'') AS status,
CASE WHEN json_type(value,'$.name')='text' THEN json_extract(value,'$.name') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.dba')='text' THEN json_extract(value,'$.dba') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.supplierSnapshot.name')='text' THEN json_extract(value,'$.supplierSnapshot.name') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.supplierSnapshot.dba')='text' THEN json_extract(value,'$.supplierSnapshot.dba') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.supplier.value')='text' THEN json_extract(value,'$.supplier.value') ELSE '' END AS names,
CASE WHEN kind='invoice' THEN '' ELSE CASE WHEN json_type(value,'$.description')='text' THEN json_extract(value,'$.description') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.terms')='text' THEN json_extract(value,'$.terms') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.notes')='text' THEN json_extract(value,'$.notes') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.poDetails.notes')='text' THEN json_extract(value,'$.poDetails.notes') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.reason')='text' THEN json_extract(value,'$.reason') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.contractRef')='text' THEN json_extract(value,'$.contractRef') ELSE '' END || ' ' || coalesce((SELECT group_concat(CASE WHEN json_type(j.value,'$.description')='text' THEN json_extract(j.value,'$.description') ELSE '' END || ' ' || CASE WHEN json_type(j.value,'$.description.value')='text' THEN json_extract(j.value,'$.description.value') ELSE '' END || ' ' || CASE WHEN json_type(j.value,'$.partNumber')='text' THEN json_extract(j.value,'$.partNumber') ELSE '' END,' ') FROM json_each(CASE WHEN json_type(value,'$.lines')='array' THEN json_extract(value,'$.lines') ELSE '[]' END) j WHERE j.type='object'),'') END || ' ' || CASE WHEN kind IN ('invoiceReading','quoteReading') THEN CASE WHEN json_type(value,'$.searchText')='text' THEN json_extract(value,'$.searchText') ELSE '' END ELSE '' END AS body,
CASE WHEN json_type(value,'$.category')='text' THEN json_extract(value,'$.category') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.project')='text' THEN json_extract(value,'$.project') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.costCentre')='text' THEN json_extract(value,'$.costCentre') ELSE '' END || ' ' || CASE WHEN json_type(value,'$.location')='text' THEN json_extract(value,'$.location') ELSE '' END || ' ' || coalesce((SELECT group_concat(CASE WHEN json_type(j.value,'$.category')='text' THEN json_extract(j.value,'$.category') ELSE '' END || ' ' || CASE WHEN json_type(j.value,'$.project')='text' THEN json_extract(j.value,'$.project') ELSE '' END || ' ' || CASE WHEN json_type(j.value,'$.costCentre')='text' THEN json_extract(j.value,'$.costCentre') ELSE '' END || ' ' || CASE WHEN json_type(j.value,'$.location')='text' THEN json_extract(j.value,'$.location') ELSE '' END,' ') FROM json_each(CASE WHEN json_type(value,'$.lines')='array' THEN json_extract(value,'$.lines') ELSE '[]' END) j WHERE j.type='object'),'') AS coding,
CASE WHEN json_extract(value,'$.approved')=1 THEN 1 ELSE 0 END AS approved,
CASE WHEN json_type(value,'$.validFrom')='text' THEN json_extract(value,'$.validFrom') ELSE '' END AS validFrom,
CASE WHEN json_type(value,'$.validUntil')='text' THEN json_extract(value,'$.validUntil') ELSE '' END AS validUntil,
CASE WHEN json_type(value,'$.access.departments')='array' THEN json_extract(value,'$.access.departments') ELSE '[]' END AS access_departments,
CASE WHEN json_type(value,'$.access.locations')='array' THEN json_extract(value,'$.access.locations') ELSE '[]' END AS access_locations,
CASE WHEN json_type(value,'$.access.entities')='array' THEN json_extract(value,'$.access.entities') ELSE '[]' END AS access_entities,
CASE WHEN json_type(value,'$.access.roles')='array' THEN json_extract(value,'$.access.roles') ELSE '[]' END AS access_roles
FROM p_records WHERE kind IN ('request','order','invoice','receipt','supplier','catalogue','quoteReading','invoiceReading')
OR (kind='supplierDocument' AND json_extract(value,'$.type')='agreement');
CREATE TABLE p_search (
 rowid INTEGER PRIMARY KEY, business TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
 title TEXT NOT NULL, number TEXT NOT NULL, supplierId TEXT NOT NULL, requestId TEXT NOT NULL,
 orderId TEXT NOT NULL, requesterId TEXT NOT NULL, requesterEmail TEXT NOT NULL,
 currency TEXT NOT NULL, amountMinor INTEGER, date TEXT NOT NULL, status TEXT NOT NULL,
 names TEXT NOT NULL, body TEXT NOT NULL, coding TEXT NOT NULL, approved INTEGER NOT NULL,
 validFrom TEXT NOT NULL, validUntil TEXT NOT NULL,
 access_departments TEXT NOT NULL, access_locations TEXT NOT NULL, access_entities TEXT NOT NULL, access_roles TEXT NOT NULL,
 namesKey TEXT NOT NULL, UNIQUE(business,kind,id)
);
CREATE INDEX p_search_supplier ON p_search(business,supplierId);
CREATE INDEX p_search_request ON p_search(business,requestId);
CREATE INDEX p_search_order ON p_search(business,orderId);
CREATE INDEX p_search_amount ON p_search(business,amountMinor);
CREATE INDEX p_search_date ON p_search(business,date);
CREATE VIRTUAL TABLE p_search_fts USING fts5(title,number,names,body,coding,content='p_search',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER p_search_fts_insert AFTER INSERT ON p_search BEGIN
 INSERT INTO p_search_fts(rowid,title,number,names,body,coding) VALUES(new.rowid,new.title,new.number,new.names,new.body,new.coding);
END;
CREATE TRIGGER p_search_fts_delete AFTER DELETE ON p_search BEGIN
 INSERT INTO p_search_fts(p_search_fts,rowid,title,number,names,body,coding) VALUES('delete',old.rowid,old.title,old.number,old.names,old.body,old.coding);
END;
INSERT INTO p_search(business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,namesKey) SELECT business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,(WITH RECURSIVE chars(rest,folded) AS (
 SELECT names,'' UNION ALL SELECT substr(rest,2),folded ||
 CASE WHEN EXISTS(SELECT 1 FROM p_search_drop WHERE unicode(substr(rest,1,1)) BETWEEN lo AND hi) THEN ''
 ELSE coalesce((SELECT replacement FROM p_search_fold WHERE code=unicode(substr(rest,1,1))),substr(rest,1,1)) END
 FROM chars WHERE rest<>''
) SELECT folded FROM chars WHERE rest='') FROM p_search_source;
CREATE TRIGGER p_records_search_insert AFTER INSERT ON p_records BEGIN
 INSERT INTO p_search(business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,namesKey) SELECT business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,(WITH RECURSIVE chars(rest,folded) AS (
 SELECT names,'' UNION ALL SELECT substr(rest,2),folded ||
 CASE WHEN EXISTS(SELECT 1 FROM p_search_drop WHERE unicode(substr(rest,1,1)) BETWEEN lo AND hi) THEN ''
 ELSE coalesce((SELECT replacement FROM p_search_fold WHERE code=unicode(substr(rest,1,1))),substr(rest,1,1)) END
 FROM chars WHERE rest<>''
) SELECT folded FROM chars WHERE rest='') FROM p_search_source WHERE business=new.business AND kind=new.kind AND id=new.id;
END;
CREATE TRIGGER p_records_search_update AFTER UPDATE ON p_records BEGIN
 DELETE FROM p_search WHERE business=old.business AND kind=old.kind AND id=old.id;
 INSERT INTO p_search(business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,namesKey) SELECT business,kind,id,title,number,supplierId,requestId,orderId,requesterId,requesterEmail,currency,amountMinor,date,status,names,body,coding,approved,validFrom,validUntil,access_departments,access_locations,access_entities,access_roles,(WITH RECURSIVE chars(rest,folded) AS (
 SELECT names,'' UNION ALL SELECT substr(rest,2),folded ||
 CASE WHEN EXISTS(SELECT 1 FROM p_search_drop WHERE unicode(substr(rest,1,1)) BETWEEN lo AND hi) THEN ''
 ELSE coalesce((SELECT replacement FROM p_search_fold WHERE code=unicode(substr(rest,1,1))),substr(rest,1,1)) END
 FROM chars WHERE rest<>''
) SELECT folded FROM chars WHERE rest='') FROM p_search_source WHERE business=new.business AND kind=new.kind AND id=new.id;
END;
CREATE TRIGGER p_records_search_delete AFTER DELETE ON p_records BEGIN
 DELETE FROM p_search WHERE business=old.business AND kind=old.kind AND id=old.id;
END;
