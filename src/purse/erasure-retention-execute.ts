import type { Bindings } from '../auth.server';
import { authority } from './store';
import { ensureSearchStorage } from './search-storage';
import { evidenceKey } from './invoice-evidence-history';
import { erasureSeal, receiptPayload } from './erasure-journal.mjs';
import { erasureCheckpoint } from './erasure-checkpoint.mjs';
import { audit, key, put, type Actor, type Data, type State } from './types';
import type { RetentionPlan } from './erasure-retention';

const retained = 'Expired protected values and tax originals were removed on owner confirmation. Purchasing, payable and tax history, totals, evidence hashes and attestations remain with an honest source-values-erased label.';
/** One atomic batch: the value rows, the records that stop pointing at them, the receipt and the archive fence. */
export async function executeRetentionErasure(env: Bindings, a: Actor, before: State, revision: number, plan: RetentionPlan, since: number) {
 const secret = evidenceKey(plan.state), auth = authority(a, true), at = new Date().toISOString();
 const receipt: Data = { id: plan.id, subject: 'retention', anonymousReference: 'erased-' + plan.id, actor: a.id, at, fields: plan.fields, affected: [...new Map(plan.fields.map(f => [key(f.kind, f.id), { kind: f.kind, id: f.id }])).values()], originals: [],
  items: plan.ready.map(({ kind, supplier, supplierName, label, latestPayable, eligibleOn }) => ({ kind, supplier, supplierName, label, latestPayable, eligibleOn })), protectedValues: plan.protectedValues, invoices: plan.invoices, retained,
  consent: 'Owner explicitly confirmed removal of these expired retained values after review', phase: 'complete' };
 receipt.seal = erasureSeal(secret, receiptPayload(receipt));
 put(plan.state, 'erasureReceipt', receipt.id, receipt);
 audit(plan.state, a, 'personal-data-erasure', receipt.id, { subject: 'retention', fields: receipt.fields.length, originals: 0, values: plan.protectedValues.length, consent: true });
 await ensureSearchStorage(env.DB);
 const statements = [
  env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=?) THEN 1 ELSE 0 END`).bind(...auth.params, revision, a.session, a.id, a.version, since, Date.now()),
  ...plan.protectedValues.map(v => env.DB.prepare("DELETE FROM p_supplier_protected WHERE business='main' AND supplier=? AND field=?").bind(v.supplier, v.field)),
  ...[...plan.state].filter(([k, row]) => JSON.stringify(before.get(k)) !== JSON.stringify(row)).map(([, row]) => env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.business, row.kind, row.id, row.revision, JSON.stringify(row.value))),
  env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params), env.DB.prepare('DELETE FROM p_guard'),
  ...(await erasureCheckpoint(env.DB)).map(s => env.DB.prepare(s.sql).bind(...s.params)),
 ];
 await env.DB.batch(statements);
 return receipt;
}
