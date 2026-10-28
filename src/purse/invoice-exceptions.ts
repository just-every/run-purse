import { exceptionOrder, mayReadInvoiceException } from './invoice-exception-access';
import { Hono } from 'hono';
import { type Bindings } from '../auth.server';
import { allowed } from './access';
import { discrepancies, linePosition } from './orders';
import { mayReceive, receiptVersion } from './receipt-routing';
import { actor, load, readFence } from './store';
import { all, audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';

const isException = (d: Data) => d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance || d.exception;

/** Keep the first occurrence even after receiving clears and later reopens it. */
export function synchronizeInvoiceExceptions(s: State, detectedAt?: string) {
    for (const row of discrepancies(s).filter(isException)) {
        if (s.has('invoiceException:' + row.invoiceId)) continue;
        const invoice = get(s, 'invoice', row.invoiceId);
        put(s, 'invoiceException', invoice.id, { invoice: invoice.id, order: invoice.order,
            openedAt: detectedAt ?? invoice.at ?? null, ageBasis: detectedAt ? 'Exception detected' : 'Invoice capture; earlier exception onset unavailable', version: 0, history: [] });
    }
}
function responsible(s: State, a: Actor, order: Data) {
    const request = get(s, 'request', order.request);
    return allowed(s, a, 'po.read', order) && (allowed(s, a, 'procurement.manage', order)
        || mayReceive(s, a, order) || request.requester === a.id && allowed(s, a, 'request.read', request));
}
async function directory(env: Bindings, s: State) {
    const rows = (await env.DB.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE status='active'").all<Data>()).results;
    return rows.flatMap(o => {
        const member = all(s, 'member').find(m => m.active && m.email.toLowerCase() === o.email.toLowerCase());
        if (o.role !== 'owner' && !member) return [];
        return [{ id: o.id, email: o.email, name: member?.name ?? o.display_name,
            version: o.version, owner: o.role === 'owner', session: '', dev: false } as Actor & { name: string }];
    });
}
function sourceVersion(s: State, record: Data) {
    const order = exceptionOrder(s, record);
    return [record.version, s.get('invoice:' + record.invoice)?.revision,
        receiptVersion(s, order)].join(':');
}
export async function invoiceExceptionQueue(s: State, a: Actor, env: Bindings) {
    synchronizeInvoiceExceptions(s);
    const members = await directory(env, s), rows = discrepancies(s);
    return all(s, 'invoiceException').filter(record => mayReadInvoiceException(s, a, record)).map((record): Data => {
        const invoice = get(s, 'invoice', record.invoice), order = exceptionOrder(s, record);
        const context = rows.filter(d => d.invoiceId === invoice.id), open = context.some(isException);
        const candidates = members.filter(member => responsible(s, member, order));
        const assigned = candidates.find(member => member.id === record.assignee && member.version === record.assigneeVersion);
        return { ...record, reference: invoice.reference, number: order.number, currentOrder: order.id,
            status: open ? 'open' : 'clear', sourceVersion: sourceVersion(s, record),
            assigneeName: assigned?.name ?? (record.assignee ? 'Unavailable assignee; reassign' : 'Unassigned'),
            assigneeCurrent: Boolean(assigned), mayAssign: open && allowed(s, a, 'invoice.review', invoice) && allowed(s, a, 'invoice.review', order),
            candidates: allowed(s, a, 'invoice.review', invoice) && allowed(s, a, 'invoice.review', order) ? candidates.map(m => ({ id: m.id, name: m.name })) : [],
            context: context.map(d => ({ ...d, orderedQuantity: order.lines.find((l: Data) => l.id === d.lineId)?.quantity,
                acceptedQuantity: linePosition(s, order.id, order.lines.find((l: Data) => l.id === d.lineId)).accepted / 1000,
                invoiceQuantity: invoice.allocations.find((l: Data) => l.line === d.lineId)?.quantity })) };
    }).sort((x, y) => (x.openedAt ?? '').localeCompare(y.openedAt ?? '') || x.id.localeCompare(y.id));
}
export async function invoiceExceptions(s: State, a: Actor, op: string, b: Data, env?: Bindings): Promise<Data | undefined> {
    if (op !== 'assign-invoice-exception') return;
    requireThat(env, 'Native exception storage required', 409);
    synchronizeInvoiceExceptions(s);
    const record = get(s, 'invoiceException', text(b.id, 'Exception', 200)), invoice = get(s, 'invoice', record.invoice);
    requireThat(mayReadInvoiceException(s, a, record) && allowed(s, a, 'invoice.review', invoice), 'Invoice review scope required', 403);
    requireThat(record.version === b.version && b.sourceVersion === sourceVersion(s, record), 'Exception context changed; reload before assigning', 409);
    requireThat(discrepancies(s).some(d => d.invoiceId === invoice.id && isException(d)), 'Matching context is already clear', 409);
    const order = exceptionOrder(s, record);
    requireThat(allowed(s, a, 'invoice.review', order), 'Current receiving context outside invoice review scope', 403);
    const candidates = await directory(env, s);
    const assignee = candidates.find(member => member.id === b.assignee);
    requireThat(assignee && responsible(s, assignee, order), 'Choose a currently authorized buyer, requester or receiver', 403);
    const event = { version: record.version + 1, assignee: assignee.id, assigneeVersion: assignee.version,
        reason: text(b.reason, 'Assignment reason'), actor: a.id, at: new Date().toISOString() };
    put(s, 'invoiceException', record.id, { ...record, ...event, history: [...record.history, event] });
    audit(s, a, op, invoice.id, { exception: record.id, from: record.assignee ?? null, ...event });
    return { id: record.id, version: event.version, openedAt: record.openedAt };
}

export const invoiceExceptionsApi = new Hono<{ Bindings: Bindings }>();
invoiceExceptionsApi.get('/api/purse/invoice-exceptions', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    requireThat(allowed(state, a, 'po.read'), 'Purchase read scope required', 403);
    const queue = await invoiceExceptionQueue(state, a, c.env);
    await readFence(c.env.DB, a, revision);
    return c.json({ queue });
});
