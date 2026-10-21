import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { localCliProof } from '@runeditrun/rer/adapter-auth';
import { localOrigin, localVariables } from '@runeditrun/rer/local/environment';
import { readPrivateFile } from '@runeditrun/rer/private-files';

export const seedProtectedKey = createHash('sha256').update('synthetic-purse-1').digest('hex');
const includeInput = { passphrase: 'synthetic-purse-2', reason: 'synthetic-purse-3', evidence: 'synthetic-purse-4', include: 'protected-values-and-matching' };

/** Only the harness mail network edge is synthetic; native authentication and
 * the explicit encrypted export endpoint create the real supplement.
 */
export async function exportSeedInclude(h) {
    assert.equal((await h.send('/auth/step-up', { action: 'export' }, h.owner)).status, 202);
    const message = [...h.messages].reverse().find(message => message.to.includes('owner@example.test'));
    const link = message?.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)?.[0];
    assert.ok(link, 'The source fixture must receive its native email challenge');
    const token = new URL(link).searchParams.get('token');
    assert.equal((await h.send('/auth/confirm', { token }, h.owner)).status, 303);
    const metadata = await h.send('/api/purse/protected-keys', undefined, h.owner); assert.equal(metadata.status, 200);
    const exported = await h.send('/api/purse/protected-archive/export', { ...includeInput, revision: metadata.value.revision }, h.owner);
    assert.equal(exported.status, 200, 'The source fixture explicitly exports its encrypted owner include');
    assert.equal(exported.value.fields, 0, 'This seed include preserves matching continuity without protected supplier values');
    return exported.value.archive;
}

/** Restore before changing the imported business. Local CLI proof is a public,
 * loopback-only native owner door, also used by Base dependency approval. It
 * creates fresh version-fenced proof; ordinary dev persona cookies do not.
 */
export async function restoreSeedInclude(root, origin, archive) {
    const vars = localVariables(await readPrivateFile(join(root, '.dev.vars')));
    assert.equal(localOrigin(vars).origin, origin, 'Seed restore uses this checkout’s own loopback installation');
    assert.ok(typeof vars.SESSION_SECRET === 'string' && vars.SESSION_SECRET.length >= 32, 'The disposable installation must have its private native session setting');
    const proof = await fetch(origin + '/auth/local/cli-session', { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json', 'x-rer-local-cli': localCliProof(vars.SESSION_SECRET) }, body: '{}' });
    assert.equal(proof.status, 303, 'The seed must obtain fresh native owner proof through the public local CLI door');
    const cookie = proof.headers.get('set-cookie')?.split(';')[0]; await proof.body?.cancel();
    assert.ok(cookie, 'The local owner proof must issue its own native session');
    try {
        const headers = { origin, cookie, 'content-type': 'application/json' };
        const metadata = await fetch(origin + '/api/purse/protected-keys', { headers }); assert.equal(metadata.status, 200);
        const { revision } = await metadata.json();
        const restored = await fetch(origin + '/api/purse/protected-archive/restore', { method: 'POST', headers, body: JSON.stringify({ ...includeInput, revision, archive }) });
        assert.equal(restored.status, 200, 'The browser seed must restore the explicit owner include before purchasing mutations');
        assert.equal((await restored.json()).restored, 0, 'Only seed matching continuity is restored');
    } finally {
        const signedOut = await fetch(origin + '/auth/signout', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: '{}' });
        assert.equal(signedOut.status, 204, 'The fixture releases its temporary native owner session');
        await signedOut.body?.cancel();
    }
}
