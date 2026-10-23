import { createHash } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { decryptPantry, encryptPantry, type PantryCredential } from './pantry-client';
import { Fault } from './types';

const unavailable = () => new Fault(503, 'Pantry credential key operation unavailable; restore the installation key or reconnect Pantry');

function activeKeyId(env: Bindings): string {
    if (!/^[a-f0-9]{64}$/i.test(env.PROTECTED_DATA_KEY ?? '')) throw unavailable();
    return createHash('sha256').update(Buffer.from(env.PROTECTED_DATA_KEY!, 'hex')).digest('hex');
}

async function credentials(env: Bindings): Promise<PantryCredential[]> {
    try {
        const result = await env.DB.prepare('SELECT * FROM p_pantry_credentials ORDER BY id').all<PantryCredential>();
        if (!result.success) throw unavailable();
        return result.results;
    } catch { throw unavailable(); }
}

// Guard the complete old envelope and metadata: replacement or revocation must
// invalidate a transaction prepared against an earlier connection snapshot.
const unchanged = 'id=? AND generation=? AND nonce=? AND key_id=? AND ciphertext=? AND tag=? AND origin=? AND created_at=? AND revoked_at IS ?';
const identity = (row: PantryCredential) => [row.id, row.generation, row.nonce, row.key_id, row.ciphertext,
    row.tag, row.origin, row.created_at, row.revoked_at];
const guard = (env: Bindings, row: PantryCredential) => env.DB.prepare(
    `INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_pantry_credentials WHERE ${unchanged}) THEN 1 ELSE 0 END`
).bind(...identity(row));

export async function pantryKeyState(env: Bindings): Promise<{ stored: number; unreadable: number; awaitingRotation: number }> {
    const rows = await credentials(env);
    let keyId: string | undefined;
    try { keyId = activeKeyId(env); } catch { /* Status remains readable when the installation key is unavailable. */ }
    let unreadable = 0, awaitingRotation = 0;
    for (const row of rows) {
        try {
            decryptPantry(env, row);
            if (row.key_id !== keyId) awaitingRotation++;
        } catch { unreadable++; }
    }
    return { stored: rows.length, unreadable, awaitingRotation };
}

export async function rotatePantryKeys(env: Bindings): Promise<{ checked: number; statements: D1PreparedStatement[] }> {
    try {
        activeKeyId(env);
        const rows = await credentials(env);
        // Authenticate every active and revoked row before preparing any writes.
        const authenticated = rows.map(row => ({ row, token: decryptPantry(env, row) }));
        const replacements = authenticated.map(({ row, token }) => {
            const envelope = encryptPantry(env, token, row.id);
            if (decryptPantry(env, { ...row, ...envelope }) !== token) throw unavailable();
            return { row, envelope };
        });
        const statements = replacements.flatMap(({ row, envelope }) => [guard(env, row),
            env.DB.prepare(`UPDATE p_pantry_credentials SET key_id=?,nonce=?,ciphertext=?,tag=? WHERE ${unchanged}`)
                .bind(envelope.key_id, envelope.nonce, envelope.ciphertext, envelope.tag, ...identity(row))]);
        return { checked: rows.length, statements };
    } catch { throw unavailable(); }
}

export async function discardUnreadablePantryKeys(env: Bindings): Promise<{ discarded: number; statements: D1PreparedStatement[] }> {
    try {
        const rows = await credentials(env);
        const unreadable = rows.filter(row => {
            try { decryptPantry(env, row); return false; } catch { return true; }
        });
        const statements = unreadable.flatMap(row => [guard(env, row),
            env.DB.prepare(`DELETE FROM p_pantry_credentials WHERE ${unchanged}`).bind(...identity(row))]);
        return { discarded: unreadable.length, statements };
    } catch { throw unavailable(); }
}
