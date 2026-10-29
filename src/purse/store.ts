import { requireReviews } from './cross-team-reviews';
import { currentDecision } from './approval';
import { ensureSearchStorage } from './search-storage';
import { currentIdentitySession } from './identity-authority';
import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server';
import { key, requireThat, Fault, type Actor, type Row, type State } from './types';
export async function actor(request: Request, original: Bindings): Promise<Actor> { const env = runtimeBindings(original); requireThat(new URL(request.url).origin === env.AUTH_ORIGIN, 'Invalid host', 403); if (!['GET', 'HEAD'].includes(request.method))
    requireThat(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403); const session = await operatorAuth(env).getSession(request); requireThat(session, 'Sign in required', 401); return { id: session.operator.id, email: session.operator.email, session: session.id, version:session.operator.version, owner: session.operator.role === 'owner', dev: session.kind === 'dev' }; }
export function authority(a: Actor, owner = false) {
 if (a.agent) return {
  sql: `EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=? AND o.version=? AND o.status='active' ${owner ? "AND o.role='owner'" : ""})
   AND EXISTS(SELECT 1 FROM agent_door_state d WHERE d.id=1 AND d.local_paused=0 AND d.envelope IS ? AND d.local_revision=?
    AND (d.envelope IS NULL OR (json_extract(d.envelope,'$.paused')=0 AND json_extract(d.envelope,'$.exp')>unixepoch()
     AND NOT EXISTS(SELECT 1 FROM json_each(d.envelope,'$.revoked.agents') WHERE value=?)
     AND NOT EXISTS(SELECT 1 FROM json_each(d.envelope,'$.revoked.consents') WHERE value=?))))
   ${a.agent.admission ? `AND EXISTS(SELECT 1 FROM agent_door_audit admission JOIN agent_door_state current ON current.id=1
    WHERE admission.id=? AND json_extract(admission.row,'$.agent.id')=? AND json_extract(admission.row,'$.sponsor.id')=?
    AND json_extract(admission.row,'$.revision') IS CASE WHEN current.envelope IS NULL THEN current.local_revision ELSE json_extract(current.envelope,'$.revision') END)` : ''}
   AND NOT EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND revoked=1)`,
  params: [a.id,a.version,a.agent.envelope,a.agent.localRevision,a.agent.id,a.agent.consent??'',...(a.agent.admission?[a.agent.admission,a.agent.id,a.id]:[]),a.agent.id],
 };
 return { sql: `EXISTS(SELECT 1 FROM oa_sessions se JOIN oa_operators o ON o.id=se.operator_id WHERE se.id=? AND o.id=? AND o.version=se.operator_version AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>unixepoch()*1000 AND ${currentIdentitySession} ${owner ? "AND o.role='owner'" : ""})`, params: [a.session, a.id] }; }
export async function load(db: D1Database) { const result = await db.batch([db.prepare('SELECT revision FROM p_meta WHERE id=1'), db.prepare("SELECT * FROM p_records WHERE business='main'")]); const revision = Number((result[0].results[0] as any).revision); const state: State = new Map(result[1].results.map((r: any) => [key(r.kind, r.id), { ...r, value: JSON.parse(r.value) }])); const live = (await db.prepare("SELECT p.* FROM p_cross_review_authority p JOIN oa_operators o ON o.id=p.actor AND o.version=p.operator_version AND o.status='active'").all<any>()).results; for(const row of live) state.set('nativeReviewAuthority:'+row.review,{business:'main',kind:'nativeReviewAuthority',id:row.review,revision:'native',value:{version:row.version,actor:row.actor,operatorVersion:row.operator_version}}); const tax = (await db.prepare("SELECT p.* FROM p_supplier_tax_authority p JOIN oa_operators o ON o.id=p.actor AND o.version=p.operator_version AND o.status='active' AND o.role='owner'").all<any>()).results; for(const row of tax) state.set('nativeTaxAuthority:'+row.review,{business:'main',kind:'nativeTaxAuthority',id:row.review,revision:'native',value:{actor:row.actor,operatorVersion:row.operator_version}}); return { revision, state }; }
export async function save(db: D1Database, a: Actor, before: State, after: State, revision: number, protectedWrite?: { statements: D1PreparedStatement[]; proofSince?: number }) { await ensureSearchStorage(db); const auth = authority(a, Boolean(protectedWrite)); const q = [db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision)];
if (protectedWrite?.proofSince !== undefined) q.push(db.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=?) THEN 1 ELSE 0 END`).bind(a.session,a.id,a.version,protectedWrite.proofSince,Date.now()));
if (protectedWrite) q.push(...protectedWrite.statements);
for (const [k, r] of after) {
    if(['nativeReviewAuthority','nativeTaxAuthority'].includes(r.kind)) continue;
    if(r.kind === 'invoiceException' && r.value.version > (before.get(k)?.value.version ?? 0)) q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(r.value.assignee,r.value.assigneeVersion));
    if (before.get(k)?.revision === r.revision)
        continue;
    if(r.kind==='supplierTaxReview' && !before.has(k)) q.push(db.prepare("INSERT INTO p_supplier_tax_authority(review,actor,operator_version) SELECT ?,id,version FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(r.id,a.id,a.version));
    if(r.kind==='crossTeamReview' && r.value.version > (before.get(k)?.value.version ?? 0)) { const event = r.value.events.at(-1); q.push(db.prepare('INSERT INTO p_cross_review_authority(review,version,actor,operator_version) VALUES(?,?,?,?) ON CONFLICT(review) DO UPDATE SET version=excluded.version,actor=excluded.actor,operator_version=excluded.operator_version').bind(r.id,r.value.version,event.actor,event.operatorVersion)); }
    if(r.kind==='emailIntake'&&r.value.status!=='held')q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(r.value.requester,r.value.requesterVersion));
    if(r.kind==='agreement'&&r.value.ownerProof){const p=r.value.ownerProof;q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(p.actor,p.operatorVersion));}
    if(r.kind==='recurringScenarioDraft')for(const proof of r.value.authorityProofs??[])q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')) THEN 1 ELSE 0 END").bind(proof.actor,proof.operatorVersion,proof.owner?1:0));
    // Standing rules and newly approved or scheduled invoices retain live native authority atomically.
    const prior = before.get(k)?.value;
    const newRule = r.kind === 'orderSend' && r.value.invoiceApprovalRule?.enabled && r.value.invoiceApprovalRule.version !== prior?.invoiceApprovalRule?.version;
    const newApproval = r.kind === 'invoice' && r.value.paymentApproval && !prior?.paymentApproval;
    const newSchedule = r.kind === 'invoice' && r.value.paymentSchedule && !prior?.paymentSchedule;
    if (newRule || newApproval || newSchedule) {
        const event = newRule ? r.value : after.get('orderSend:' + r.value.paymentApproval.send)!.value;
        const rule = event.invoiceApprovalRule;
        q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner') AND EXISTS(SELECT 1 FROM p_order_send_links WHERE send=? AND revoked_at IS NULL AND expires_at>?) THEN 1 ELSE 0 END").bind(rule.actor,rule.operatorVersion,event.id,Date.now()));
        const decision = currentDecision(after, after.get('request:' + event.request)!.value);
        for (const proof of [{actor:event.actor,version:event.operatorVersion},...(decision.chainProofs ?? [{actor:decision.actor,version:decision.operatorVersion}])])
            q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor,proof.version));
    }
    // Fresh grants cover preparation and issuance; issued receiving metadata is physical history.
    if(r.kind==='order'&&(r.value.status==='prepared'||r.value.issuedAt&&!before.get(k)?.value.issuedAt||(r.value.status==='issued'&&(before.get(k)?.value.status!=='issued'||r.value.reopenedAt!==before.get(k)?.value.reopenedAt))))q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(r.value.approvalActor,r.value.approvalVersion));
    if(r.kind==='order'&&['prepared','issued'].includes(r.value.status))for(const proof of r.value.approvalProofs??[])q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor,proof.version));
    if((r.kind==='decision' && r.value.decision==='approved' && !r.value.carriedFrom) || r.kind==='order' && (r.value.status==='prepared' || r.value.status==='issued' && (prior?.status!=='issued' || !prior?.issuedAt))) { const request = after.get('request:'+r.value.request)!.value; for(const review of requireReviews(after,request)) { const proof=review.events.at(-1); q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators o JOIN p_cross_review_authority p ON p.actor=o.id WHERE p.review=? AND p.version=? AND o.id=? AND o.version=? AND o.status='active') THEN 1 ELSE 0 END").bind(review.id,review.version,proof.actor,proof.operatorVersion)); } }
    q.push(db.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(r.business, r.kind, r.id, r.revision, JSON.stringify(r.value)));
} for (const [k, r] of before)
    if (!['nativeReviewAuthority','nativeTaxAuthority'].includes(r.kind) && !after.has(k))
        q.push(db.prepare('DELETE FROM p_records WHERE business=? AND kind=? AND id=?').bind(r.business, r.kind, r.id)); q.push(db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params), db.prepare('DELETE FROM p_guard')); try {
    await db.batch(q);
}
catch (e) {
    if (String(e).includes('CHECK constraint'))
        throw new Fault(409, 'State or authority changed; reload before trying again');
    throw e;
} }
export async function readFence(db: D1Database, a: Actor, revision: number) { const auth = authority(a); const result = await db.prepare(`SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END AS ok`).bind(...auth.params, revision).first<{
    ok: number;
}>(); requireThat(result?.ok === 1, 'State or authority changed; reload', 409); }
