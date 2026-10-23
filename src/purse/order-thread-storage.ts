import { requireThat, uid, type Data } from './types';

/** Routes are installation authority: exclude this table from every archive. */
export const orderThreadSchema = [
    'CREATE TABLE IF NOT EXISTS p_order_thread_routes (hash TEXT PRIMARY KEY, thread TEXT NOT NULL, order_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    "CREATE TABLE IF NOT EXISTS p_order_thread_receipts (provider TEXT NOT NULL, email_id TEXT NOT NULL, message TEXT NOT NULL, thread TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('claimed','stored','uncertain')), created_at TEXT NOT NULL, PRIMARY KEY(provider,email_id))",
];
export const threadFileKey = (message: string, file: string) => `order-thread/${message}/${file}`;
export async function threadDigest(bytes: Uint8Array) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const threadAliasHash = (address: string) => threadDigest(new TextEncoder().encode(address.toLowerCase()));
export const threadInsert = (db: D1Database, kind: string, value: Data) => db.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?)").bind(kind, value.id, uid(), JSON.stringify(value));
export async function retainThreadFile(bucket: R2Bucket, message: string, id: string, name: string, mediaType: string, bytes: Uint8Array) {
    const file = { id, name, mediaType, key: threadFileKey(message, id), size: bytes.length, sha256: await threadDigest(bytes) };
    requireThat(name.length <= 2000 && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mediaType), 'Invalid supplier attachment metadata');
    await bucket.put(file.key, bytes, { httpMetadata: { contentType: mediaType } });
    return file;
}
