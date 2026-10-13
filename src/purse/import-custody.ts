import { authority } from './store';
import { requireThat, type Actor, type Data } from './types';

type Job = { id: string; principalId: string; mappingVersion: string; fingerprint: string };
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

// Completed restore metadata is written by Base's atomic apply, excluded from
// archives, and unavailable to public purchasing commands. It is the authority
// to offer continuation, never a client-supplied marker in a domain record.
async function restoredFrom(db: D1Database, job: Job) {
    const { results } = await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind='import' AND phase='complete'").all<{ id: string; metadata: string }>();
    for (const restore of results) {
        const metadata = JSON.parse(restore.metadata), table = metadata.copies?.ik_jobs;
        if (typeof table !== 'string' || !/^rer_portability_stage_[a-f0-9]+_\d+$/.test(table) || !metadata.contentHash) continue;
        const binding = await db.prepare(`SELECT 1 FROM ${quote(table)} WHERE id=? AND principal_id=? AND mapping_version=? AND fingerprint=? AND destination='main' AND namespace='procurify'`).bind(job.id, job.principalId, job.mappingVersion, job.fingerprint).first();
        if (binding) return { id: restore.id, metadata: restore.metadata, table };
    }
}
const jobQuery = "SELECT id,principal_id AS principalId,mapping_version AS mappingVersion,fingerprint,state,checkpoint,total FROM ik_jobs WHERE destination='main' AND namespace='procurify'";

export async function importJobs(db: D1Database, a: Actor) {
    const { results } = await db.prepare(jobQuery).all<Job>();
    const custody = (await db.prepare('SELECT job_id,owner_id,principal_id,restore_id FROM p_import_custody').all()).results;
    const result = [];
    for (const job of results) {
        const claim = custody.find(c => c.job_id === job.id && c.principal_id === job.principalId);
        result.push({ ...job, canResume: job.principalId === a.id || claim?.owner_id === a.id, canClaim: !claim && job.principalId !== a.id && !!await restoredFrom(db, job), custodyOwner: claim?.owner_id ?? null });
    }
    return result;
}

export async function claimImport(db: D1Database, a: Actor, b: Data) {
    const job = await db.prepare(jobQuery + ' AND id=? AND mapping_version=?').bind(b.id, b.mappingVersion).first<Job>();
    requireThat(job, 'Import job not found', 404);
    const restore = await restoredFrom(db, job);
    requireThat(restore, 'Only a batch in a completed archive restore can be claimed', 409);
    const existing = await db.prepare('SELECT owner_id FROM p_import_custody WHERE job_id=?').bind(job.id).first<{ owner_id: string }>();
    requireThat(!existing || existing.owner_id === a.id, 'Restored batch belongs to another owner', 403);
    if (existing) return job;
    const auth = authority(a, true), at = new Date().toISOString(), auditId = crypto.randomUUID();
    const audit = { id: auditId, actor: a.id, email: a.email, action: 'claim-restored-import', record: job.id, originalPrincipal: job.principalId, restore: restore.id, at };
    await db.batch([
        db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind='import' AND phase='complete' AND metadata=?) AND EXISTS(SELECT 1 FROM ${quote(restore.table)} WHERE id=? AND principal_id=? AND fingerprint=?) AND EXISTS(SELECT 1 FROM ik_jobs WHERE id=? AND principal_id=? AND fingerprint=?) THEN 1 ELSE 0 END`).bind(...auth.params, restore.id, restore.metadata, job.id, job.principalId, job.fingerprint, job.id, job.principalId, job.fingerprint),
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
