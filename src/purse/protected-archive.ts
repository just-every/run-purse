import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, save } from './store';
import { audit, Fault, requireThat, type Actor } from './types';
import { activeKeyAvailable, encryptProtected, protectedRows, writeProtected } from './protected-crypto';
import { privateText, protectedProof, protectedRefusal } from './protected-controls';
import { archivePassphrase, openProtectedArchive, protectedArchiveLimit, sealProtectedArchive } from './protected-archive-codec';
import { collectProtectedSection, restoreProtectedSection } from './protected-archive-data';

export const protectedArchiveApi = new Hono<{ Bindings: Bindings }>();
protectedArchiveApi.post('/api/purse/protected-archive/:operation', async c => {
    c.header('cache-control', 'no-store');
    const env = runtimeBindings(c.env), operation = c.req.param('operation'); let a: Actor | undefined;
    try {
        a = await actor(c.req.raw, env); requireThat(a.owner, 'Current native owner required', 403);
        requireThat(['export', 'restore'].includes(operation), 'Protected archive operation unavailable', 404);
        const { state, revision } = await load(env.DB), before = structuredClone(state);
        // Bound the body before parsing; errors never return body or passphrase text.
        const source = await c.req.text(); requireThat(Buffer.byteLength(source, 'utf8') <= protectedArchiveLimit, 'Protected archive input too large', 413);
        let body; try { body = JSON.parse(source); } catch { throw new Fault(400, 'Protected archive input invalid'); }
        requireThat(body && typeof body === 'object' && !Array.isArray(body), 'Protected archive input invalid');
        requireThat(body.revision === revision, 'State changed; reload before trying again', 409);
        requireThat(privateText(body.reason) && privateText(body.evidence), 'Private reason and evidence reference required');
        requireThat(body.include === 'protected-values-and-matching', 'Explicit protected archive choice required');
        archivePassphrase(body.passphrase);
        const since = Date.now() - 10 * 60 * 1000; await protectedProof(env, a, since);
        requireThat(activeKeyAvailable(env), 'Protected data key unavailable; configure the installation key privately', 503);
        if (operation === 'export') {
            const section = await collectProtectedSection(env, state), archive = await sealProtectedArchive(section, body.passphrase);
            audit(state, a, 'protected-archive-export', 'supplier-protected', { fields: section.values.length, suppliers: section.suppliers.length, reason: 'Owner explicitly included protected values and matching; private reason and evidence supplied' });
            await save(env.DB, a, before, state, revision, { statements: [], proofSince: since });
            return c.json({ archive, fields: section.values.length, suppliers: section.suppliers.length });
        }
        requireThat(!(await protectedRows(env)).length && !state.get('supplierMatchingKey:main')?.value.secret && ![...state.values()].some(row => row.kind === 'supplier' && Object.keys(row.value.matching ?? {}).length), 'Protected data or matching already exists; restore into the ordinary archive before making protected changes', 409);
        const section = await openProtectedArchive(body.archive, body.passphrase), values = restoreProtectedSection(state, section);
        const encrypted = values.map(value => encryptProtected(env, value.supplier, value.field, value.payload));
        audit(state, a, 'protected-archive-restore', 'supplier-protected', { fields: values.length, reason: 'Owner restored encrypted include; private reason and evidence supplied', authority: 'Current native session only; no reveal proof or grants restored' });
        await save(env.DB, a, before, state, revision, { statements: [
            env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM p_supplier_protected WHERE business='main') THEN 1 ELSE 0 END"),
            ...encrypted.map(row => writeProtected(env, row)),
        ], proofSince: since });
        return c.json({ restored: encrypted.length, result: 'Protected values and matching restored under this installation key. Reveal still requires the current native owner and fresh native reauthentication.' });
    } catch (error) { return protectedRefusal(env, c.req.raw, operation === 'export' ? 'archive-export' : 'archive-restore', error, a); }
});
