import { readPart, insist } from '@runeditrun/rer/modules/portability/storage';
import { checkPart } from '@runeditrun/rer/modules/portability/format';

// Completed imports retain verified archive parts, but Base removes their staging
// tables. Match the original job in those parts; ordinary live jobs confer no
// restore authority. Read each part once for all jobs needing a custody offer.
export async function restoredImports(db, jobs) {
    const wanted = new Map(jobs.map(job => [job.id, job])), found = new Map();
    if (!wanted.size) return found;
    const { results } = await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind='import' AND phase='complete'").all();
    for (const restore of results) {
        const metadata = JSON.parse(restore.metadata);
        let remaining = metadata.manifest?.tables.find(table => table.name === 'ik_jobs')?.count ?? 0;
        if (!metadata.contentHash || !remaining) continue;
        const { results: receipts } = await db.prepare('SELECT idx,sha256 FROM rer_portability_parts WHERE job=? ORDER BY idx').bind(restore.id).all();
        for (const receipt of receipts) {
            const part = await readPart(db, restore.id, receipt.idx);
            await checkPart(part, receipt.idx);
            insist(part.sha256 === receipt.sha256, 'restore_part_checksum');
            for (const item of part.items) {
                if (item.kind !== 'row' || item.table !== 'ik_jobs') continue;
                remaining--;
                const row = item.row, job = wanted.get(row.id);
                if (job && row.principal_id === job.principalId && row.mapping_version === job.mappingVersion && row.fingerprint === job.fingerprint && row.destination === 'main' && row.namespace === 'procurify') {
                    found.set(job.id, { ...restore, part: receipt.idx, sha256: receipt.sha256 });
                    wanted.delete(job.id);
                }
            }
            if (!wanted.size) return found;
            // Archive rows are ordered by table; no later part can hold this
            // table once its declared rows have been read. Skip object payloads.
            if (!remaining) break;
        }
    }
    return found;
}
