import { canonicalSupplier } from './supplier-identity';
import { currency } from './admin';
import { all, audit, can, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const integer = (v: unknown, label: string, min: number, max: number) => {
    requireThat(Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max, `${label} must be an integer from ${min} to ${max}`);
    return Number(v);
};
function reference(v: unknown, label: string, signature = false): Data | null {
    if (v == null) return null;
    const b = v as Data;
    const url = new URL(text(b.url, `${label} URL`, 2000));
    requireThat(url.protocol === 'https:' && !url.username && !url.password, 'Use an HTTPS reference without credentials');
    const result: Data = { provider: text(b.provider, `${label} provider`, 100), reference: text(b.reference, `${label} reference`, 300), url: url.href };
    if (signature) {
        requireThat(['not-recorded','draft','sent','signed','declined','void'].includes(b.status), 'Choose a recorded signature status');
        result.status = b.status;
        result.source = text(b.source, 'Signature status evidence');
        result.provenance = 'owner-recorded; not provider-verified';
    }
    return result;
}
export const noticeDeadline = (endDate: string, noticeDays: number) => new Date(Date.parse(endDate) - noticeDays * 86400000).toISOString().slice(0,10);
export function agreementDay(s: State, now: number) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: get(s,'business','main').timezone || 'America/New_York' }).format(new Date(now));
}
/** Round A stores confirmed terms, not a monetary value or an extracted/awarded price. */
export function agreements(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['agreement','agreement-invoice'].includes(op)) return;
    can(s,a,'owner');
    if (op === 'agreement-invoice') {
        const agreement = get(s,'agreement',b.agreement), invoice = get(s,'invoice',b.invoice), order = get(s,'order',invoice.order);
        requireThat(order.issuedAt && !order.imported, 'Attribute issued native invoice evidence only');
        requireThat(canonicalSupplier(s,invoice.supplier) === canonicalSupplier(s,agreement.supplier) && invoice.currency === agreement.currency, 'Invoice supplier family and currency must match the agreement');
        requireThat(!s.has('agreementInvoice:'+invoice.id), 'Invoice evidence is already attributed; attribution is immutable',409);
        const row = { id: invoice.id, agreement: agreement.id, agreementVersion: agreement.version, invoice: invoice.id, order: order.id, supplier: invoice.supplier, currency: invoice.currency,
            amountMinor: invoice.allocations.reduce((n: number,l: Data)=>n+l.amountMinor,0), reason: text(b.reason,'Attribution reason'), actor: a.id, at: new Date().toISOString() };
        requireThat(Number.isSafeInteger(row.amountMinor), 'Invoice total is too large');
        put(s,'agreementInvoice',row.id,row);audit(s,a,op,agreement.id,{ attribution: row.id, invoice: invoice.id, order: order.id, reason: row.reason });return row;
    }
    for (const field of ['value','valueMinor','totalMinor','firstOffer','awardedPrice','reading']) requireThat(!Object.hasOwn(b,field),'Agreement value, extraction and savings are not available yet');
    const previous = b.id ? get(s,'agreement',b.id) : undefined;
    requireThat(b.version === (previous?.version ?? 0),'Agreement changed; reload before confirming',409);
    requireThat(b.confirmed === true,'The owner must explicitly confirm these agreement terms');
    const supplier = get(s,'supplier',b.supplier);requireThat(!supplier.mergedInto,'Choose the surviving supplier for a new agreement revision',409);
    currency(s,b.currency);
    requireThat(!previous || !all(s,'agreementInvoice').some(l=>l.agreement===previous.id) || previous.currency===b.currency,'Attributed invoice currency cannot be changed',409);
    const startDate = date(b.startDate,'Start date'), endDate = date(b.endDate,'End date');
    requireThat(startDate <= endDate,'Agreement start must precede its end');
    requireThat(typeof b.autoRenew === 'boolean' && typeof b.remindersEnabled === 'boolean','Choose auto-renewal and reminder settings');
    const noticeDays = integer(b.noticeDays,'Notice days',0,3650), deadline = noticeDeadline(endDate,noticeDays);
    requireThat(Array.isArray(b.reminderDays) && b.reminderDays.length > 0 && b.reminderDays.length <= 12,'Configure 1–12 reminder intervals');
    const reminderDays = [...new Set(b.reminderDays.map((n: unknown)=>integer(n,'Reminder days before notice deadline',1,365)))].sort((a,b)=>b-a);
    const id = previous?.id ?? uid(), now = new Date().toISOString();
    const revision = { version: (previous?.version ?? 0)+1, name: text(b.name,'Agreement name',300), reference: text(b.reference,'Agreement reference',300), supplier: supplier.id, currency: b.currency,
        parties: text(b.parties,'Parties'), startDate, endDate, autoRenew: b.autoRenew, noticeDays, noticeDeadline: deadline,
        paymentTerms: text(b.paymentTerms,'Payment terms'), owner: a.id, ownerEmail: a.email, reminderDays, remindersEnabled: b.remindersEnabled,
        clm: reference(b.clm,'CLM'), signature: reference(b.signature,'Signature',true), reason: text(b.reason,'Confirmation or correction reason'), confirmedBy: a.id, at: now };
    const result = { ...revision, id, createdAt: previous?.createdAt ?? now, history: [...(previous?.history ?? []),revision] };
    put(s,'agreement',id,result);audit(s,a,op,id,{ version: revision.version, reason: revision.reason, before: previous?.history.at(-1) ?? null, after: revision });return result;
}
/** Explicit invoice attribution is evidence spend, never paid spend or verified compliance. */
export function agreementSpend(s: State, id: string) {
    get(s,'agreement',id);
    const rows: Data[] = all(s,'agreementInvoice').filter(r=>r.agreement===id).map(r=>({ ...r, reference: get(s,'invoice',r.invoice).reference, number: get(s,'order',r.order).number,
        source: get(s,'invoice',r.invoice).source, url: '/app?agreement='+encodeURIComponent(id) }));
    const totals = [...new Set(rows.map(r=>r.currency))].map(currency=>({ currency, amountMinor: rows.filter(r=>r.currency===currency).reduce((n,r)=>n+r.amountMinor,0) }));
    return { basis: 'Owner-attributed invoice evidence; not paid spend or verified contract compliance', rows, totals };
}
export function visibleAgreements(s: State, a: Actor) {
    can(s,a,'buyer');
    return { agreement: all(s,'agreement').map(r=>({ ...r, spend: agreementSpend(s,r.id) })), agreementInvoice: all(s,'agreementInvoice'), agreementReminder: all(s,'agreementReminder') };
}
