import { screenSupplier } from './screening';
import { all, audit, can, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

export async function suppliers(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['supplier', 'screen-supplier', 'review-screening'].includes(op)) return;
    can(s, a, 'buyer');
    if (op === 'review-screening') {
        can(s, a, 'owner');
        const supplier = get(s, 'supplier', b.id), screening = supplier.screenings?.at(-1);
        requireThat(screening?.id === b.screening && screening.status === 'pending_review', 'Screening changed or already reviewed; reload', 409);
        requireThat(['clear', 'confirmed'].includes(b.decision), 'Choose clear or confirmed');
        const review = { actor: a.id, at: new Date().toISOString(), decision: b.decision, reason: text(b.reason, 'Compliance review reason') };
        const reviewed = { ...screening, status: b.decision === 'clear' ? 'cleared_by_review' : 'confirmed', review };
        const result = { ...supplier, status: b.decision === 'clear' ? supplier.requestedStatus : 'blocked', screenings: [...supplier.screenings.slice(0, -1), reviewed] };
        put(s, 'supplier', supplier.id, result);
        audit(s, a, op, supplier.id, { screening: screening.id, ...review });
        return result;
    }
    const previous = b.id ? get(s, 'supplier', b.id) : undefined;
    const input = op === 'screen-supplier' ? previous! : b;
    const id = previous?.id ?? uid(), name = text(input.name, 'Supplier name');
    const address = input.address == null ? previous?.address ?? '' : typeof input.address === 'string' ? input.address.trim() : null;
    requireThat(typeof address === 'string' && address.length <= 2000, 'Address must be text (maximum 2000 characters)');
    const requestedStatus = input.requestedStatus && op === 'screen-supplier' ? input.requestedStatus : input.status;
    requireThat(['active', 'preferred', 'blocked', 'pending_review'].includes(requestedStatus), 'Choose supplier status');
    const desired = requestedStatus === 'pending_review' ? previous?.requestedStatus : requestedStatus;
    requireThat(['active', 'preferred', 'blocked'].includes(desired), 'Choose supplier status');
    const reason = text(input.reason, 'Reason');
    requireThat(input.contractRef == null || typeof input.contractRef === 'string', 'Agreement reference must be text');
    const contacts = (input.contacts ?? []).map((c: Data) => ({ name: text(c.name, 'Contact name'), email: text(c.email, 'Contact email') }));
    const screenings = [...(previous?.screenings ?? [])];
    if (!screenings.length || name !== previous?.name || address !== (previous?.address ?? '') || op === 'screen-supplier') screenings.push(await screenSupplier(name, address));
    const latest = screenings.at(-1)!;
    const status = latest.status === 'pending_review' ? 'pending_review' : latest.status === 'confirmed' ? 'blocked' : desired;
    const result = { name, address, status, requestedStatus: desired, reason, contacts, contractRef: input.contractRef ?? '', renewal: input.renewal ? date(input.renewal) : '', documents: all(s, 'attachment').filter(x => x.record === id).map(x => x.id), screenings };
    put(s, 'supplier', id, result);
    audit(s, a, op, id, { reason, status, screening: latest.id });
    return get(s, 'supplier', id);
}
