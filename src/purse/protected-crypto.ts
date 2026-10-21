import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { Fault } from './types';

export const protectedFields = ['tin', 'bankAccount', 'bankRouting'] as const;
export type ProtectedField = typeof protectedFields[number];
export type CipherRow = { supplier: string; field: ProtectedField; key_id: string; nonce: string; ciphertext: string; tag: string };
export type ProtectedPayload = { value: string; reason: string; evidence: string };
export const unavailable = () => new Fault(503, 'Protected data key unavailable; restore the installation key or re-enter values');
function keyMaterial(secret: string | undefined) {
    if (!/^[a-f0-9]{64}$/i.test(secret ?? '')) throw unavailable();
    const bytes = Buffer.from(secret!, 'hex');
    return { bytes, id: createHash('sha256').update(bytes).digest('hex') };
}
const aad = (supplier: string, field: ProtectedField, keyId: string) => Buffer.from(JSON.stringify(['main', supplier, field, keyId]));
export function encryptProtected(env: Bindings, supplier: string, field: ProtectedField, payload: ProtectedPayload): CipherRow {
    const key = keyMaterial(env.PROTECTED_DATA_KEY), nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key.bytes, nonce);
    cipher.setAAD(aad(supplier, field, key.id));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return { supplier, field, key_id: key.id, nonce: Buffer.from(nonce).toString('base64'), ciphertext: ciphertext.toString('base64'), tag: Buffer.from(cipher.getAuthTag()).toString('base64') };
}
export function decryptProtected(env: Bindings, row: CipherRow): ProtectedPayload {
    try {
        // A previous secret is an explicit rotation key, never a plaintext fallback.
        const active = keyMaterial(env.PROTECTED_DATA_KEY);
        const key = active.id === row.key_id ? active : keyMaterial(env.PROTECTED_DATA_PREVIOUS_KEY);
        if (key.id !== row.key_id) throw unavailable();
        const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(row.nonce, 'base64'));
        decipher.setAAD(aad(row.supplier, row.field, row.key_id));
        decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
        const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
        if (!payload || !['value', 'reason', 'evidence'].every(field => typeof payload[field] === 'string')) throw unavailable();
        return payload;
    } catch { throw unavailable(); }
}
export function activeKeyAvailable(env: Bindings) { try { keyMaterial(env.PROTECTED_DATA_KEY); return true; } catch { return false; } }
export function usesActiveKey(env: Bindings, row: CipherRow) { return row.key_id === keyMaterial(env.PROTECTED_DATA_KEY).id; }
export const protectedRows = async (env: Bindings, supplier?: string) => (await env.DB.prepare("SELECT * FROM p_supplier_protected WHERE business='main'" + (supplier === undefined ? '' : ' AND supplier=?')).bind(...(supplier === undefined ? [] : [supplier])).all<CipherRow>()).results;
export const writeProtected = (env: Bindings, row: CipherRow) => env.DB.prepare('INSERT INTO p_supplier_protected(business,supplier,field,key_id,nonce,ciphertext,tag) VALUES(?,?,?,?,?,?,?) ON CONFLICT(business,supplier,field) DO UPDATE SET key_id=excluded.key_id,nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag').bind('main', row.supplier, row.field, row.key_id, row.nonce, row.ciphertext, row.tag);
