import { unverifiedHistory } from '../../src/purse/erasure-history-text.mjs';
export { unverifiedHistory };
export const journalSignal = 'PURSE_RESTORE_JOURNAL';
/** A fresh destination cannot know about erasures made after its archive. Without a later
 * journal, the restore is held until the current native owner acknowledges that exact limit;
 * the report row records the acknowledgment, the archive time and that no journal was supplied. */
export async function recordRestoreHistory({ db, manifest, check, env = process.env }) {
 const supplied = env[journalSignal] === 'supplied', row = await db.prepare("SELECT * FROM p_restore_history WHERE id='main'").first();
 const native = Boolean(row?.acknowledged_at);
 check(supplied || native, 'erasure_history_unacknowledged');
 const at = new Date().toISOString();
 await db.prepare(`INSERT INTO p_restore_history(id,acknowledged_by,acknowledged_at,acknowledgment,journal_supplied,archive_at,source_identity,restored_at) VALUES('main',?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET acknowledged_by=excluded.acknowledged_by,acknowledged_at=excluded.acknowledged_at,acknowledgment=excluded.acknowledgment,journal_supplied=excluded.journal_supplied,archive_at=excluded.archive_at,source_identity=excluded.source_identity,restored_at=excluded.restored_at`)
  .bind(supplied ? null : row.acknowledged_by, supplied ? null : row.acknowledged_at, supplied ? null : unverifiedHistory, supplied ? 1 : 0, manifest.exportedAt, manifest.sourceIdentity, at).run();
}
