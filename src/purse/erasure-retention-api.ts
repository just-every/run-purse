import { createHash } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { protectedProof } from './protected-controls';
import { save } from './store';
import { audit, requireThat, type Actor, type Data, type State } from './types';
import { planRetentionErasure, retentionStatus, setRetention } from './erasure-retention';
import { executeRetentionErasure } from './erasure-retention-execute';

/** The owner's retention period only decides what is listed; nothing is removed until a separate confirmed erase. */
export async function retentionDoor(env: Bindings, a: Actor, body: Data, state: State, revision: number) {
 const before = structuredClone(state);
 setRetention(state, body.years, body.warningAcknowledged, a.id);
 audit(state, a, 'erasure-retention', 'erasure', { years: body.years, warning: body.years < 7 ? 'IRS Pub. 583 warning acknowledged' : null });
 await save(env.DB, a, before, state, revision);
 return { retention: await retentionStatus(env, state) };
}
const reviewId = (revision: number, items: string[]) => { const h = createHash('sha256').update(JSON.stringify([revision, [...items].sort()])).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
export async function readyDoor(env: Bindings, a: Actor, body: Data, state: State, revision: number) {
 requireThat(body.consent === true, 'Explicit consent to erase these expired retained values is required');
 const status = await retentionStatus(env, state), ids: string[] = Array.isArray(body.items) ? body.items : [];
 requireThat(ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => status.ready.some(r => r.id === id)), 'Choose values that are ready to erase; the retention period may have changed', 409);
 const since = Date.now() - 600000;
 await protectedProof(env, a, since);
 const plan = planRetentionErasure(state, status.ready.filter(r => ids.includes(r.id)), reviewId(revision, ids), revision);
 return executeRetentionErasure(env, a, state, revision, plan, since);
}
