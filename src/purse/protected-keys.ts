import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { audit, requireThat, type Actor } from './types';
import { activeKeyAvailable, decryptProtected, encryptProtected, protectedRows, usesActiveKey, writeProtected } from './protected-crypto';
import { privateText, protectedBody, protectedProof, protectedRefusal } from './protected-controls';

export const protectedKeysApi = new Hono<{ Bindings: Bindings }>();
protectedKeysApi.get('/api/purse/protected-keys', async c => {
    const env = runtimeBindings(c.env); let a: Actor | undefined;
    try {
        a = await actor(c.req.raw, env); requireThat(a.owner, 'Current native owner required', 403);
        const { revision } = await load(env.DB), stored = await protectedRows(env);
        const active = activeKeyAvailable(env); let unreadable = 0, awaitingRotation = 0;
        for (const row of stored) {
            try { decryptProtected(env, row); if (!usesActiveKey(env, row)) awaitingRotation++; } catch { unreadable++; }
        }
        await readFence(env.DB, a, revision);
        return c.json({ revision, activeKeyAvailable: active, stored: stored.length, unreadable, awaitingRotation,
            previousKeyMayBeRemoved: active && unreadable === 0 && awaitingRotation === 0,
            recovery: 'Lost keys cannot be recovered. Restore the installation secret privately, or explicitly discard unreadable values and re-enter them. No escrow or plaintext copies exist.' });
    } catch (error) { return protectedRefusal(env, c.req.raw, 'key-status', error, a); }
});
protectedKeysApi.post('/api/purse/protected-keys/:operation', async c => {
    const env = runtimeBindings(c.env), operation = c.req.param('operation'); let a: Actor | undefined;
    try {
        a = await actor(c.req.raw, env); requireThat(a.owner, 'Current native owner required', 403);
        requireThat(['rotate', 'recover'].includes(operation), 'Protected operation unavailable', 404);
        const {state, revision} = await load(env.DB), before = structuredClone(state), body = await protectedBody(c.req.raw);
        requireThat(body.revision === revision, 'State changed; reload before trying again', 409);
        requireThat(privateText(body.reason), 'Private reason required');
        const since = Date.now() - 10 * 60 * 1000; await protectedProof(env, a, since);
        requireThat(activeKeyAvailable(env), 'Protected data key unavailable; restore the installation key or re-enter values', 503);
        const stored = await protectedRows(env);
        if (operation === 'rotate') {
            // Read and authenticate ALL old envelopes before preparing any writes.
            const payloads = stored.map(row => ({ row, payload: decryptProtected(env, row) }));
            const encrypted = payloads.map(({row, payload}) => encryptProtected(env, row.supplier, row.field, payload));
            for (let i = 0; i < encrypted.length; i++) requireThat(JSON.stringify(decryptProtected(env, encrypted[i])) === JSON.stringify(payloads[i].payload), 'Protected rotation check failed', 503);
            audit(state, a, 'protected-key-rotation', 'supplier-protected', { reason: 'Owner requested rotation; private reason supplied', checked: encrypted.length, result: 'All values reencrypted and authenticated under the active key' });
            await save(env.DB, a, before, state, revision, { statements: encrypted.map(row => writeProtected(env, row)), proofSince: since });
            return c.json({ checked: encrypted.length, result: 'Rotation complete. Every protected value was reencrypted and checked. The previous Worker secret may now be removed privately.' });
        }
        requireThat(body.acknowledge === 'discard-unreadable-and-reenter', 'Explicit loss acknowledgement required');
        const unreadable = stored.filter(row => { try { decryptProtected(env, row); return false; } catch { return true; } });
        requireThat(unreadable.length > 0, 'No unreadable protected values to discard', 409);
        const statements = unreadable.map(row => env.DB.prepare("DELETE FROM p_supplier_protected WHERE business='main' AND supplier=? AND field=?").bind(row.supplier, row.field));
        // protectedOnFile remains: every cleared field is explicitly Not restored – re-enter.
        audit(state, a, 'protected-key-loss', 'supplier-protected', { reason: 'Owner acknowledged irreversible key loss; private reason supplied', discarded: unreadable.length, result: 'Unreadable values discarded; owner reentry required' });
        await save(env.DB, a, before, state, revision, { statements, proofSince: since });
        return c.json({ discarded: unreadable.length, result: 'Unreadable values discarded. Re-enter the protected values with a reason and evidence reference.' });
    } catch (error) { return protectedRefusal(env, c.req.raw, operation, error, a); }
});
