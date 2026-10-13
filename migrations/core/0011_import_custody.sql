-- Installation-local authority. Never exported: the next restore needs its own
-- completed restore and an explicit claim by a current native owner.
CREATE TABLE p_import_custody (
  job_id TEXT PRIMARY KEY,
  restore_id TEXT NOT NULL REFERENCES rer_portability_jobs(id),
  principal_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
