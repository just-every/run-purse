import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoProtectedValues } from './protected-value-assertions.mjs';

const values = ['987651234', '123456789', '9876543215678'];
const suffixes = ['1234', '6789', '5678'];
const id = 'abcd1234-abcd-4abc-8abc-abcd56786789';
const sha256 = 'abcd123456786789'.padEnd(64, 'a');

test('Protected-content assertions distinguish native metadata collisions from leaked values and suffixes', () => {
    assert.doesNotThrow(() => assertNoProtectedValues({ id, references: [{ id: id + ':1', version: id }],
        actor: id, requester: id, correctionOf: id, inputDigest: sha256, outputDigest: sha256, sources: [{ value: { sha256 } }] }, values, suffixes));
    for (const value of [...values, ...suffixes]) {
        for (const leaked of [value, Number(value), '••••' + value, 'Account ending ' + value, 'prefix' + value + 'postfix']) {
            assert.throws(() => assertNoProtectedValues({ sources: [{ value: { description: leaked } }] }, values, suffixes),
                /Protected (value|suffix)/);
        }
        assert.throws(() => assertNoProtectedValues({ id: value }, values, suffixes), /Protected (value|suffix)/);
    }
    // A source string resembling metadata is still content unless it occupies a typed metadata field.
    for (const text of [id, sha256]) assert.throws(() => assertNoProtectedValues({ draft: text }, values, suffixes), /Protected suffix/);
    assert.throws(() => assertNoProtectedValues({ bankAccount: '<withheld>' }, values, suffixes), /Protected field/);
    // Even typed metadata cannot hide a complete protected value.
    assert.throws(() => assertNoProtectedValues({ inputDigest: ('a'.repeat(51) + values[2]) }, values, suffixes), /Protected value/);
});
