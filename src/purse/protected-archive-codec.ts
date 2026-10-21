import { randomBytes } from 'node:crypto';
import { Fault, requireThat } from './types';

const format = 'purse-protected-v1';
const aad = new TextEncoder().encode(format);
export const protectedArchiveLimit = 8 * 1024 * 1024;
export type ProtectedEnvelope = { format: string; salt: string; iv: string; ciphertext: string };
export function archivePassphrase(value: unknown): asserts value is string {
    requireThat(typeof value === 'string' && value.length >= 12 && value.length <= 1024, 'Use a private archive passphrase of 12 to 1024 characters');
}
async function key(passphrase: string, salt: Uint8Array) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function decode(value: unknown, bytes?: number) {
    requireThat(typeof value === 'string' && value.length <= protectedArchiveLimit, 'Protected archive invalid');
    const decoded = Buffer.from(value, 'base64');
    requireThat(decoded.toString('base64') === value && (bytes === undefined || decoded.length === bytes), 'Protected archive invalid');
    return decoded;
}
export async function sealProtectedArchive(value: unknown, passphrase: string): Promise<ProtectedEnvelope> {
    archivePassphrase(passphrase);
    const plaintext = new TextEncoder().encode(JSON.stringify(value)), salt = randomBytes(32), iv = randomBytes(12);
    requireThat(plaintext.byteLength < protectedArchiveLimit / 2, 'Protected archive too large', 413);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad }, await key(passphrase, salt), plaintext);
    return { format, salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') };
}
export async function openProtectedArchive(value: unknown, passphrase: string): Promise<unknown> {
    archivePassphrase(passphrase);
    try {
        requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Protected archive invalid');
        const envelope = value as ProtectedEnvelope;
        requireThat(Object.keys(envelope).length === 4 && envelope.format === format, 'Protected archive invalid');
        const salt = decode(envelope.salt, 32), iv = decode(envelope.iv, 12), ciphertext = decode(envelope.ciphertext);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad }, await key(passphrase, salt), ciphertext as BufferSource);
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch { throw new Fault(400, 'Protected archive or passphrase invalid'); }
}
