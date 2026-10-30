import assert from 'node:assert/strict';
import { containsProtectedInput } from '../src/purse/protected-context-fields.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?::[1-9][0-9]*)?$/i;
const identifiers = new Set(['id', 'actor', 'line', 'target', 'request', 'supplier', 'proposal', 'order', 'invoice', 'exception', 'attachment', 'version']);
const digests = new Set(['inputDigest', 'outputDigest', 'sourceVersion', 'sha256']);

/** Inspect all content, including bare and masked suffixes. Native UUIDs and
 * SHA-256 metadata can coincidentally contain four digits from a secret. */
export function assertNoProtectedValues(record, values, suffixes = values.map(value => value.slice(-4))) {
    const raw = JSON.stringify(record);
    for (const value of values) assert.ok(!raw.includes(value), 'Protected value entered the record');
    assert.equal(containsProtectedInput(record), false, 'Protected field entered the record');
    const content = JSON.stringify(record, (key, value) => {
        if (typeof value === 'string' && (identifiers.has(key) && uuid.test(value)
            || digests.has(key) && /^[a-f0-9]{64}$/i.test(value))) return '<native metadata>';
        return value;
    });
    for (const suffix of suffixes) assert.ok(!content.includes(suffix), 'Protected suffix entered record content');
}
