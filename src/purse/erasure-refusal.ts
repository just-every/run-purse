import type { Bindings } from '../auth.server';
import { Fault, uid, type Actor } from './types';

export const erasureOperations = ['read', 'preview', 'execute', 'resume', 'retention', 'ready', 'history', 'agent-proposal'];
/** Every refused erasure door of a configured business appends one value-free audit row; a body, cookie or
 * submitted identifier is never retained. Unidentified callers are recorded as such. */
export async function erasureRefusal(env: Bindings, operation: string, error: unknown, a?: Actor): Promise<never> {
 const fault = error instanceof Fault ? error : new Fault(409, 'Erasure could not settle current authority or source custody. Reload and review; no partial financial changes were committed.');
 const id = uid(), value = { id, actor: a?.id ?? 'unidentified', action: 'erasure-refused', record: 'erasure', operation: erasureOperations.includes(operation) ? operation : 'unavailable', status: fault.status, reason: 'Owner, origin, fresh proof, exact review or source custody refused', at: new Date().toISOString() };
 // An empty destination has no chronology yet: a row there would make it non-empty and block its restore.
 await env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) SELECT 'main','audit',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='business')").bind(id, uid(), JSON.stringify(value)).run();
 throw fault;
}
/** Agents and preparation runs hold no native credential: erasure is never an action they can propose. */
export class ErasureAgentFault extends Fault { constructor() { super(403, 'Personal-data erasure is a current native owner decision in Settings; agents and preparations cannot propose it'); } }
export const agentErasureAction = (action: unknown) => /erasure|erase/i.test(String(action));
