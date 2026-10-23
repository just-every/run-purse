import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { Fault, type Data } from './types';

export type PantryEnvelope = { key_id: string; nonce: string; ciphertext: string; tag: string };
export type PantryCredential = PantryEnvelope & { id: string; origin: string; generation: number; created_at: string; revoked_at: string | null };
const unavailable = () => new Fault(503, 'Pantry credential unavailable; restore the installation key or reconnect Pantry');
const tokenValid = (token: unknown): token is string => typeof token === 'string' && token.trim().length > 0 && token.length <= 512 && !/[\r\n]/.test(token);

function keyMaterial(secret: string | undefined) {
    if (!/^[a-f0-9]{64}$/i.test(secret ?? '')) throw unavailable();
    const bytes = Buffer.from(secret!, 'hex');
    return { bytes, id: createHash('sha256').update(bytes).digest('hex') };
}
// This context cannot authenticate supplier ciphertext as a connector secret.
const aad = (id: string, keyId: string) => Buffer.from(JSON.stringify(['pantry-credential', 'installation', 'main', id, keyId]));

export function pantryMetadata(row: Data) {
    return { id: row.id, origin: row.origin, generation: row.generation, createdAt: row.created_at, revokedAt: row.revoked_at ?? null };
}

export function encryptPantry(env: Bindings, token: string, id = 'main'): PantryEnvelope {
    if (!tokenValid(token)) throw new Fault(400, 'Supply a nonblank Pantry credential of at most 512 characters');
    const key = keyMaterial(env.PROTECTED_DATA_KEY), nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key.bytes, nonce);
    cipher.setAAD(aad(id, key.id));
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return { key_id: key.id, nonce: Buffer.from(nonce).toString('base64'), ciphertext: ciphertext.toString('base64'), tag: Buffer.from(cipher.getAuthTag()).toString('base64') };
}

export function decryptPantry(env: Bindings, row: PantryCredential): string {
    try {
        const active = keyMaterial(env.PROTECTED_DATA_KEY);
        const key = active.id === row.key_id ? active : keyMaterial(env.PROTECTED_DATA_PREVIOUS_KEY);
        if (key.id !== row.key_id) throw unavailable();
        const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(row.nonce, 'base64'));
        decipher.setAAD(aad(row.id, row.key_id));
        decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
        const token = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
        if (!tokenValid(token)) throw unavailable();
        return token;
    } catch { throw unavailable(); }
}

export function validatePantryOrigin(input: unknown, env: Bindings): string {
    const invalid = () => new Fault(400, 'Supply a Pantry HTTPS origin; local HTTP requires local mode');
    if (typeof input !== 'string' || !/^https?:\/\/[^/?#\\\s]+\/?$/.test(input.trim())) throw invalid();
    let url: URL;
    try { url = new URL(input.trim()); } catch { throw invalid(); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !(url.protocol === 'https:' || url.protocol === 'http:' && local && env.AUTH_LOCAL === 'true')) throw invalid();
    return url.origin;
}

export async function loadPantry(env: Bindings): Promise<PantryCredential> {
    const row = await env.DB.prepare("SELECT * FROM p_pantry_credentials WHERE id='main'").first<PantryCredential>();
    if (!row || row.revoked_at) throw new Fault(409, 'Connect Pantry before syncing');
    try { validatePantryOrigin(row.origin, env); } catch { throw new Fault(409, 'Reconnect Pantry with a valid origin'); }
    return row;
}

const MAX_RESPONSE = 2 * 1024 * 1024;
async function boundedJson(response: Response): Promise<Data> {
    const tooLarge = () => new Fault(502, 'Pantry response exceeded the supported size');
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE) {
        await response.body?.cancel();
        throw tooLarge();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Fault(502, 'Pantry returned an invalid response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_RESPONSE) { await reader.cancel(); throw tooLarge(); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (!value || typeof value !== 'object') throw new Error();
        return value;
    } catch { throw new Fault(502, 'Pantry returned an invalid response'); }
}

export async function pantryCall(env: Bindings, row: PantryCredential, path: string,
    options: { method?: string; body?: Data; key?: string } = {}): Promise<Data> {
    const live = await loadPantry(env);
    if (row.revoked_at || live.generation !== row.generation || live.origin !== row.origin || live.nonce !== row.nonce || live.tag !== row.tag || live.ciphertext !== row.ciphertext) throw new Fault(409, 'Pantry connection changed; reload');
    const origin = validatePantryOrigin(row.origin, env), base = origin + '/api/pantry/integration/v1';
    if (!path.startsWith('/') || path.startsWith('//')) throw new Fault(400, 'Invalid Pantry resource path');
    const url = new URL(base + path);
    if (url.origin !== origin || !url.pathname.startsWith('/api/pantry/integration/v1/') || url.hash) throw new Fault(400, 'Invalid Pantry resource path');
    const headers = new Headers({ Authorization: 'Bearer ' + decryptPantry(env, row), Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.key !== undefined) headers.set('Idempotency-Key', options.key);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await fetch(url.toString(), { method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
            headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: 'manual', signal: controller.signal });
        if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel();
            throw new Fault(502, 'Pantry redirected the request; reconnect using its final origin');
        }
        if (!response.ok) {
            await response.body?.cancel();
            const status = response.status >= 400 && response.status < 500 ? response.status : 502;
            throw new Fault(status, 'Pantry refused the request; check connection scopes and record state');
        }
        return await boundedJson(response);
    } catch (error) {
        if (error instanceof Fault) throw error;
        throw new Fault(502, 'Pantry request failed; check the connection and try again');
    } finally { clearTimeout(timer); }
}
