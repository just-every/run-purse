import { authority } from './store';
import { requireThat, type Actor, type Data } from './types';
import { restoredImports, type ImportJob } from './restored-imports.mjs';
const jobQuery = "SELECT id,principal_id AS principalId,mapping_version AS mappingVersion,fingerprint,state,checkpoint,total FROM ik_jobs WHERE destination='main' AND namespace='procurify'";

export async function importJobs(db: D1Database, a: Actor) {
    const { results } = await db.prepare(jobQuery).all<ImportJob>();
    const custody = (await db.prepare('SELECT job_id,owner_id,principal_id,restore_id FROM p_import_custody').all()).results;
    const unclaimed = results.filter(job => job.principalId !== a.id && !custody.some(c => c.job_id === job.id && c.principal_id === job.principalId));
    const restored = await restoredImports(db, unclaimed);
    const result = [];
    for (const job of results) {
        const claim = custody.find(c => c.job_id === job.id && c.principal_id === job.principalId);
        result.push({ ...job, canResume: job.principalId === a.id || claim?.owner_id === a.id, canClaim: !claim && job.principalId !== a.id && restored.has(job.id), custodyOwner: claim?.owner_id ?? null });
    }
    return result;
}

export async function claimImport(db: D1Database, a: Actor, b: Data) {
    const job = await db.prepare(jobQuery + ' AND id=? AND mapping_version=?').bind(b.id, b.mappingVersion).first<ImportJob>();
    requireThat(job, 'Import job not found', 404);
    const restore = (await restoredImports(db, [job])).get(job.id);
    requireThat(restore, 'Only a batch in a completed archive restore can be claimed', 409);
    const existing = await db.prepare('SELECT owner_id FROM p_import_custody WHERE job_id=?').bind(job.id).first<{ owner_id: string }>();
    requireThat(!existing || existing.owner_id === a.id, 'Restored batch belongs to another owner', 403);
    if (existing) return job;
    const auth = authority(a, true), at = new Date().toISOString(), auditId = crypto.randomUUID();
    const audit = { id: auditId, actor: a.id, email: a.email, action: 'claim-restored-import', record: job.id, originalPrincipal: job.principalId, restore: restore.id, at };
    await db.batch([
        db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind='import' AND phase='complete' AND metadata=?) AND EXISTS(SELECT 1 FROM rer_portability_parts WHERE job=? AND idx=? AND sha256=?) AND EXISTS(SELECT 1 FROM ik_jobs WHERE id=? AND principal_id=? AND mapping_version=? AND fingerprint=? AND destination='main' AND namespace='procurify') THEN 1 ELSE 0 END`).bind(...auth.params, restore.id, restore.metadata, restore.id, restore.part, restore.sha256, job.id, job.principalId, job.mappingVersion, job.fingerprint),
        db.prepare('INSERT INTO p_import_custody VALUES(?,?,?,?,?)').bind(job.id, restore.id, job.principalId, a.id, at),
        db.prepare("INSERT INTO p_records VALUES('main','audit',?,?,?)").bind(auditId, crypto.randomUUID(), JSON.stringify(audit)),
        db.prepare('DELETE FROM p_guard'),
    ]);
    return job;
}

export async function importAuthorization(db: D1Database, a: Actor, id: string) {
    const claim = await db.prepare("SELECT c.principal_id,c.restore_id FROM p_import_custody c JOIN rer_portability_jobs r ON r.id=c.restore_id AND r.kind='import' AND r.phase='complete' WHERE c.job_id=? AND c.owner_id=?").bind(id, a.id).first<{ principal_id: string; restore_id: string }>();
    const auth = authority(a, true);
    if (!claim) return { principalId: a.id, predicate: () => auth };
    return { principalId: claim.principal_id, predicate: () => ({
        sql: `(${auth.sql}) AND EXISTS(SELECT 1 FROM p_import_custody c JOIN rer_portability_jobs r ON r.id=c.restore_id WHERE c.job_id=? AND c.owner_id=? AND c.principal_id=? AND c.restore_id=? AND r.kind='import' AND r.phase='complete')`,
        params: [...auth.params, id, a.id, claim.principal_id, claim.restore_id],
    }) };
}
