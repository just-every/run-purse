import { erasureDigest } from './erasure-journal.mjs';
import type { Data } from './types';

/** Value-free leaf differences: only digests of the before and after values are kept. */
export function diffValue(a: any, b: any, path: (string | number)[], kind: string, rowId: string, fields: Data[]) {
 if (JSON.stringify(a) === JSON.stringify(b)) return;
 if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && Object.keys(a).every(field => Object.hasOwn(b, field))) {
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) diffValue(a[field], b[field], [...path, Array.isArray(b) ? Number(field) : field], kind, rowId, fields);
 } else fields.push({ kind, id: rowId, path, before: erasureDigest(a ?? null), after: erasureDigest(b ?? null) });
}
