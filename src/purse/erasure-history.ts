import type { Bindings } from '../auth.server';
import { protectedProof } from './protected-controls';
import { unverifiedHistory } from './erasure-history-text.mjs';
import { requireThat, type Actor, type Data } from './types';

export { unverifiedHistory };
/** How this installation's erasure history was established, read from the installation-local restore report. */
export async function erasureHistory(db: D1Database): Promise<Data> {
 const row = await db.prepare("SELECT * FROM p_restore_history WHERE id='main'").first<Data>();
 if (!row) return { state: 'native', label: null };
 if (!row.restored_at) return { state: 'acknowledged', label: null, acknowledgedBy: row.acknowledged_by, acknowledgedAt: row.acknowledged_at };
 if (row.journal_supplied === 1) return { state: 'journal-supplied', label: 'Restored with the latest archive supplied as the erasure journal', journalSupplied: true, archiveAt: row.archive_at, restoredAt: row.restored_at };
 return { state: 'unverified', label: unverifiedHistory, journalSupplied: false, acknowledgedBy: row.acknowledged_by, acknowledgedAt: row.acknowledged_at, archiveAt: row.archive_at, restoredAt: row.restored_at };
}
/** Before a journal-less restore the current native owner acknowledges that exact limit, with fresh native proof.
 * Only an empty installation takes it: it is the restore's hold, not a setting for a business with history. */
export async function acknowledgeHistory(env: Bindings, a: Actor, body: Data) {
 requireThat(body.acknowledgment === unverifiedHistory, 'Acknowledge the exact sentence: ' + unverifiedHistory);
 requireThat(!(await env.DB.prepare('SELECT 1 AS x FROM p_records LIMIT 1').first()), 'Only an empty installation awaiting restore takes this acknowledgment', 409);
 requireThat(!(await env.DB.prepare("SELECT 1 AS x FROM p_restore_history WHERE restored_at IS NOT NULL").first()), 'This installation was already restored', 409);
 await protectedProof(env, a, Date.now() - 600000);
 await env.DB.prepare("INSERT INTO p_restore_history(id,acknowledged_by,acknowledged_at,acknowledgment) VALUES('main',?,?,?) ON CONFLICT(id) DO UPDATE SET acknowledged_by=excluded.acknowledged_by,acknowledged_at=excluded.acknowledged_at,acknowledgment=excluded.acknowledgment").bind(a.email, new Date().toISOString(), unverifiedHistory).run();
 return erasureHistory(env.DB);
}
