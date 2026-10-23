import { linePosition } from './orders';
import { type Data, type State } from './types';

/** Only these purchasing facts enter the agent; supplier tax/bank projections never do. */
export function chaseInputs(s: State, order: Data, policy: Data, governance: Data[], event: Data) {
    const orderInput = { id: order.id, number: order.number, request: order.request, revision: order.revision,
        supplier: order.supplier, currency: order.currency, needDate: order.needDate,
        lines: order.lines.map((line: Data) => ({ id: line.id, description: line.description, category: line.category,
            q: line.q, unit: line.unit, unitMinor: line.unitMinor, position: linePosition(s, order.id, line) })) };
    return { order: orderInput, schedule: { version: policy.version, cadenceDays: policy.cadenceDays, maxChases: policy.maxChases,
        authorizedBy: policy.actor, operatorVersion: policy.operatorVersion },
        governance: governance.map(row => ({ id: row.id, version: row.version, purchaseType: row.purchaseType,
            cadenceDays: row.cadenceDays, maxChases: row.maxChases })),
        scheduledFor: event.at, reason: event.reason, supplierReply: event.evidence,
        supplierAcknowledgment: event.supplierAcknowledgment };
}
export function chaseRun(event: Data, policy: Data) {
    return { id: 'late-follow-up:' + event.id, agent: 'AGENT-003', workflow: 'late-order',
        actor: policy.actor, request: event.request, order: event.order, version: 1,
        mode: 'deterministic v1', model: 'none', provider: 'none', mailProvider: event.mailProvider,
        at: event.startedAt, inputs: event.inputs, sources: event.sources, references: event.references,
        messages: [event.message], proposals: [], outcomes: [event.outcome], chase: event.id };
}
export function agentRecordInsert(db: D1Database, event: Data, policy: Data, claimVersion: string, runVersion: string) {
    const run = chaseRun(event, policy);
    return db.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
        SELECT 'main','agentRun',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='orderChaseEvent' AND id=? AND revision=?)`)
        .bind(run.id, runVersion, JSON.stringify(run), event.id, claimVersion);
}
