import { planD1Import, createD1ImportJob, applyD1ImportBatches, resumeD1Import, undoD1Import, readD1ImportJob, readD1ImportOriginals, readD1ImportUndoReport, type D1ImportContext } from '../modules/import-kit/src/d1/index';
import { supplierPublicValue } from './supplier-identity';
import { targets } from './import-target';
import { mappedSource } from './import-mapping';
import { authority } from './store';
import { claimImport, importAuthorization } from './import-custody';
import { can, requireThat, type Actor, type State, type Data } from './types';
export async function imports(db: D1Database, s: State, a: Actor, op: string, b: Data) {
    can(s, a, 'owner');
    const context = (version: string): D1ImportContext => ({ destination: 'main', reversalPolicy:'preserve-conflicts', namespace: 'procurify', mappingVersion: version, storage: { database: db as any, targets }, authorization: { principalId: a.id, predicate: () => authority(a, true) }, batchSize: 20, maxBatches: 2 });
    if (op === 'preview' || op === 'commit') {
        const { source, mapping, report } = mappedSource(s, b), ctx = context(mapping.version), plan = await planD1Import(source, mapping, ctx);
        if (op === 'preview')
            return { plan: { ...plan, entries: plan.entries.map(entry => ({ ...entry, effects: entry.effects.map(effect => ({ ...effect, value: effect.targetKind === 'supplier' ? supplierPublicValue(effect.value as Data) : effect.value })) })) }, report };
        requireThat(report.unresolved.length === 0 && plan.counts.rejected === 0, 'Resolve import errors first', 409);
        requireThat(b.fingerprint === plan.fingerprint, 'Preview changed; review these exact bytes and mapping again', 409);
        const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: b.fingerprint, operationKey: b.operationKey || b.fingerprint });
        return { job: await applyD1ImportBatches(job.id, ctx), report };
    }
    requireThat(typeof b.id === 'string' && typeof b.mappingVersion === 'string', 'Job and mapping version required');
    if (op === 'claim') return claimImport(db, a, b);
    const ctx = { ...context(b.mappingVersion), authorization: await importAuthorization(db, a, b.id) };
    if (op === 'resume')
        return resumeD1Import(b.id, ctx);
    if (op === 'undo')
        return undoD1Import(b.id, ctx);
    if (op === 'status')
        return { job: await readD1ImportJob(b.id, ctx), originals: await readD1ImportOriginals(b.id, ctx), undo: await readD1ImportUndoReport(b.id, ctx) };
    throw new Error('Unknown import action');
}
