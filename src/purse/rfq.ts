import { supplier } from './admin';
import { requests } from './requests';
import { all, audit, can, get, put, requireThat, roles, text, date, uid, type Actor, type Data, type State } from './types';

export function visibleRfqs(s: State, a: Actor) {
    const allowed = roles(s, a).includes('buyer');
    return Object.fromEntries(['rfq', 'rfqResponse', 'rfqMailEvent'].map(kind => [kind, allowed ? all(s, kind) : []]));
}
export const rfqResponses = (s: State, id: string, supplierId?: string) => all(s, 'rfqResponse').filter(r => r.rfq === id && (!supplierId || r.supplier === supplierId)).sort((a, b) => a.sequence - b.sequence);

/** Configurations and supplier responses are evidence; only a buyer can amend the ordinary request. */
export function rfq(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['rfq-create', 'rfq-award'].includes(op)) return;
    can(s, a, 'buyer');
    if (op === 'rfq-create') {
        const request = get(s, 'request', b.request);
        requireThat(!request.imported && request.status === 'draft' && request.revision === b.revision, 'Use the exact current native draft', 409);
        const instant=(value:unknown)=>{requireThat(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(value),'RFQ times require ISO timestamps with an explicit time zone');date(value.slice(0,10),'RFQ date');return Date.parse(value);};
        const deadline = instant(b.deadline), reminderAt = instant(b.reminderAt), now = Date.now();
        requireThat(Number.isFinite(deadline) && deadline > now && deadline <= now + 30 * 86400000, 'RFQ deadline must be within the next 30 days');
        requireThat(Number.isFinite(reminderAt) && reminderAt > now && reminderAt <= deadline - 3600000, 'Reminder must be after now and at least one hour before the deadline');
        requireThat(Array.isArray(b.suppliers) && b.suppliers.length >= 1 && b.suppliers.length <= 50 && new Set(b.suppliers).size === b.suppliers.length, 'Nominate 1–50 unique suppliers');
        const nominated = b.suppliers.map((id: string) => { const value = supplier(s, id); const email = text(value.contacts?.[0]?.email, 'Supplier contact email', 320); requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Supplier requires a contact email'); return { id: value.id, name: value.name, email }; });
        requireThat(Array.isArray(b.questions) && b.questions.length <= 30, 'Provide up to 30 questions');
        const questions = b.questions.map((q: unknown) => text(q, 'Question'));
        const id = uid(), value = { id, request: request.id, revision: request.revision, scope: text(b.scope, 'RFQ scope'), deadline: new Date(deadline).toISOString(), reminderAt: new Date(reminderAt).toISOString(), suppliers: nominated, questions,
            lines: request.lines.map((l: Data) => ({ id: l.id, description: l.description, quantity: l.quantity, q: l.q, unit: l.unit, partNumber: l.partNumber })), actor: a.id, at: new Date(now).toISOString() };
        put(s, 'rfq', id, value); audit(s, a, op, request.id, { rfq: id, revision: request.revision }); return value;
    }
    const invitation = get(s, 'rfq', b.rfq), current = get(s, 'request', invitation.request);
    requireThat(current.revision === b.revision && current.revision === invitation.revision && current.status === 'draft', 'RFQ award requires its exact current draft; create a new RFQ after changes', 409);
    const first = get(s, 'rfqResponse', b.firstResponse), winner = get(s, 'rfqResponse', b.response);
    requireThat(first.rfq === invitation.id && winner.rfq === invitation.id && first.currency === winner.currency, 'Select two distinct responses to this RFQ in one currency');
    const baseline = rfqResponses(s, invitation.id).filter(r => r.currency === winner.currency).sort((a,b)=>a.offerSequence-b.offerSequence)[0];
    const latest = rfqResponses(s, invitation.id, winner.supplier).at(-1);
    requireThat(baseline?.id === first.id && latest?.id === winner.id, 'Use the actual first recorded offer in the awarded currency and the latest exact winning response', 409);
    const reason = text(b.reason, 'Award reason');
    const updated = requests(s, a, 'amend', { ...current, id: current.id, revision: current.revision, supplier: winner.supplier, currency: winner.currency,
        freightMinor: winner.freightMinor, taxMinor: winner.taxMinor, terms: `Lead time: ${winner.leadTime}\nValidity: ${winner.validity}${winner.conditions ? '\n' + winner.conditions : ''}`,
        lines: current.lines.map((l: Data) => { const offered = winner.lines.find((x: Data) => x.sourceLine === l.id); requireThat(offered, 'Winning response does not cover this request line'); return { ...l, catalogue: null, unitMinor: offered.unitMinor, lineTaxMinor: null }; }), reason })!;
    const firstQuote=get(s,'quote',first.quote),winnerQuote=get(s,'quote',winner.quote);
    const award = { id:uid(), request:current.id, revision:updated.revision, firstQuote:firstQuote.id, awardedQuote:winnerQuote.id,
        supplier:winner.supplier, currency:winner.currency, reason, actor:a.id, at:new Date().toISOString(), rfq:invitation.id,
        firstResponse:first.id, awardedResponse:winner.id, firstSupplier:first.supplier,
        lines:updated.lines.map((line:Data)=>({requestLine:line.id,firstLine:firstQuote.lines.find((item:Data)=>item.sourceLine===line.id)!.id,awardedLine:winnerQuote.lines.find((item:Data)=>item.sourceLine===line.id)!.id})) };
    put(s,'quoteAward',award.id,award); audit(s,a,'quote-award',current.id,{award:award.id,revision:updated.revision,reason});
    const result = { ...updated, rfqAward: award.id };
    put(s, 'request', updated.id, result); put(s, 'revision', `${updated.id}:${updated.revision}`, { ...result, request: updated.id });
    audit(s, a, op, current.id, { rfq: invitation.id, award: award.id, firstResponse: first.id, response: winner.id, revision: updated.revision, reason });
    return result;
}
