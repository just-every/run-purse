import { checkInvoiceAttachment } from './invoice-evidence';
import { allocateLineTax } from './po-line-tax';
import { optionalPoText } from './po-profiles';
import { moneyInput } from './money';
import { requireCatalogueAccess } from './catalogue-access';
import { currentPrice, requiredCatalogueFiles } from './catalogue';
import { all, audit, can, get, put, requireThat, text, minor, quantity, extended, date, uid, own, roles, type Actor, type Data, type State } from './types';
import { supplier, currency } from './admin';
export function lines(s: State, input: unknown, a: Actor) { requireThat(Array.isArray(input) && input.length > 0 && input.length <= 100, 'Provide 1–100 lines'); return input.map((x: Data) => { const item = x.catalogue ? get(s, 'catalogue', x.catalogue) : undefined; if (item)
    { requireCatalogueAccess(s, a, item); requireThat(item.approved, 'Catalogue item is not approved'); requireThat(currentPrice(item), 'Catalogue price is outside its validity dates', 409); } const unitMinor = moneyInput(x, 'unitAmount', 'unitMinor', 'Unit price', { fallback: item?.unitMinor }), q = quantity(x.quantity); return { id: x.id ?? uid(), description: text(x.description ?? item?.description, 'Line description'), quantity: x.quantity, q, unitMinor, totalMinor: extended(q, unitMinor), category: text(x.category ?? item?.category, 'Category'), project: text(x.project || item?.project, 'Project'), catalogue: item?.id ?? null, partNumber: item?.partNumber ?? x.partNumber ?? '', unit: item?.unit ?? x.unit ?? 'each', shipTo: optionalPoText(x.shipTo, 'Line ship to'), lineTaxMinor: Object.hasOwn(x, 'lineTaxAmount') || Object.hasOwn(x, 'lineTaxMinor') ? moneyInput(x, 'lineTaxAmount', 'lineTaxMinor', 'Line tax', { optional: true }) : null, requiredAttachments: item?.requiredAttachments ?? x.requiredAttachments ?? [] }; }); }
export function requestTotal(r: Data) { const total = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0) + r.freightMinor + r.taxMinor; return minor(total, 'Request total'); }
export function policies(s: State, r: Data) { return all(s, 'policy').filter(p => p.active && p.currency === r.currency && p.limitMinor >= r.totalMinor && r.lines.every((l: Data) => (p.category === '*' || p.category === l.category) && (p.project === '*' || p.project === l.project))).sort((a, b) => a.limitMinor - b.limitMinor || a.id.localeCompare(b.id)); }
export const reserved = (s: State, policy: string) => all(s, 'commitment').filter(e => e.policy === policy).reduce((n, e) => n + e.amountMinor, 0);
export function reservationAvailable(s: State, r: Data, amountMinor: number) { const p = policies(s, r).find(p => p.id === r.policy); return Boolean(p && reserved(s, p.id) + amountMinor <= p.budgetMinor); }
export function ledger(s: State, a: Actor, r: Data, amountMinor: number, kind: string) { requireThat(amountMinor <= 0 || reservationAvailable(s, r, amountMinor), 'Current policy or budget does not authorize replenishment; renew approval', 409); const balance=all(s,'commitment').filter(e=>e.currency===r.currency).reduce((n,e)=>n+e.amountMinor,0);requireThat(Number.isSafeInteger(balance+amountMinor),'Commitment exceeds supported integer range',409);const id = uid(); put(s, 'commitment', id, { request: r.id, revision: r.revision, policy: r.policy, currency: r.currency, amountMinor, kind, actor: a.id, at: new Date().toISOString() }); }
export function authorizedApproval(s: State, a: Actor, r: Data) { can(s, a, 'approver'); requireThat(a.id !== r.requester && a.email !== r.requesterEmail, 'Self approval is prohibited', 403); const p = get(s, 'policy', r.policy); requireThat(policies(s, r).some(x => x.id === p.id), 'Current policy does not cover these terms', 409); const delegated = all(s, 'delegation').find(d => d.policy === p.id && d.from === p.approver && d.delegate === a.email && d.active && Date.parse(d.expires) > Date.now()); requireThat(a.email === p.approver || delegated, 'You do not hold authority for this policy', 403); return { p, delegated }; }
export function requests(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'request' || op === 'amend') {
        can(s, a, op === 'amend' && roles(s, a).includes('buyer') ? 'buyer' : 'requester');
        let old: Data | undefined;
        if (b.id) {
            old = get(s, 'request', b.id);requireThat(b.revision===old.revision,'Stale request revision',409);
            requireThat(old.requester === a.id || old.requesterEmail === a.email || a.owner || (op === 'amend' && roles(s, a).includes('buyer')), 'Only requester or buyer may edit', 403);
            requireThat(!old.imported, 'Imported historical records cannot grant native authority', 409);
        }
        const counterparty = supplier(s, b.supplier);
        currency(s, b.currency);
        const id = old?.id ?? uid();
        const supplierSnapshot = { id: counterparty.id, name: counterparty.name, address: counterparty.address || '', remitTo: counterparty.remitTo || '', postalState: counterparty.postalState || '', contacts: structuredClone(counterparty.contacts), contractRef: counterparty.contractRef };
        const r = { id, requester: old?.requester ?? a.id, requesterEmail:old?.requesterEmail??a.email, requesterOwner:old?.requesterOwner??a.owner, title: text(b.title, 'Request title'), supplier: b.supplier, supplierSnapshot, currency: b.currency, needDate: date(b.needDate), location: text(b.location, 'Location'), costCentre: text(b.costCentre, 'Cost centre'), lines: lines(s, b.lines, old && !a.owner ? { ...a, id: old.requester, email: old.requesterEmail, owner: old.requesterOwner === true } : a), freightMinor: moneyInput(b, 'freightAmount', 'freightMinor', 'Freight', { fallback: 0 }), taxMinor: moneyInput(b, 'taxAmount', 'taxMinor', 'Supplied tax', { fallback: 0 }), terms: text(b.terms, 'Supplier-supplied terms'), revision: (old?.revision ?? 0) + 1, status: 'draft', policy: null, totalMinor: 0 };
        if(old?.integration) (r as Data).integration = structuredClone(old.integration);
        if(old?.emailIntake) (r as Data).emailIntake = old.emailIntake;
        if(old?.quoteTerms) (r as Data).quoteTerms = structuredClone(old.quoteTerms);
        (r as Data).poDetails = { depositTerms: optionalPoText((b.poDetails ?? old?.poDetails)?.depositTerms, 'Deposit/prepayment terms'), notes: optionalPoText((b.poDetails ?? old?.poDetails)?.notes, 'Notes to supplier'), shippingTerms: optionalPoText((b.poDetails ?? old?.poDetails)?.shippingTerms, 'Shipping terms'), buyerContact: optionalPoText((b.poDetails ?? old?.poDetails)?.buyerContact, 'Buyer contact') };
        allocateLineTax(r.lines, r.taxMinor);
        const business = get(s, 'business', 'main');
        requireThat(business.locations.includes(r.location) && business.costCentres.includes(r.costCentre) && r.lines.every(l => business.projects.includes(l.project)), 'Use configured location, cost centre and project');
        requireThat(new Set(r.lines.map(l => l.id)).size === r.lines.length, 'Line IDs must be unique');
        if (old) requireThat(!all(s, 'orderClosure').some(c => c.active && get(s, 'order', c.order).request === old!.id), 'Reopen closed balances before amending this request', 409);
        if (old)
            requireThat(r.lines.every(l => !b.lines.find((x: Data) => x.id === l.id) || old!.lines.some((x: Data) => x.id === l.id)), 'Line ID is outside this request');
        for (const l of r.lines) {
            if (l.catalogue) {
                const item = get(s, 'catalogue', l.catalogue);
                requireThat(item.currency === r.currency && item.supplier === r.supplier, 'Catalogue supplier and currency must match the request');
            }
        }
        r.totalMinor = requestTotal(r);
        const issued = all(s, 'order').find(o => o.request === id && (o.status === 'issued' || o.status === 'amendment-pending'));
        if (issued) {
            (r as Data).amends = issued.id;
            for (const l of r.lines) {
                const prior = issued.lines.find((p: Data) => p.id === l.id);
                const events = all(s, 'receipt').filter(e => e.order === issued.id && e.line === l.id);
                const accepted = (prior?.carriedAccepted ?? 0) + events.reduce((n, e) => n + (e.event === 'receive' ? e.q : e.event === 'return' ? -e.q : 0), 0);
                const cancelled = (prior?.carriedCancelled ?? 0) + events.filter(e => e.event === 'cancel').reduce((n, e) => n + e.q, 0);
                requireThat(l.q >= accepted + cancelled, 'Amended quantity cannot erase received or cancelled quantities');
                Object.assign(l, { carriedAccepted: accepted, carriedCancelled: cancelled });
            }
            requireThat(issued.lines.every((p: Data) => r.lines.some(l => l.id === p.id)), 'Amendments retain each original line');
            // Editing invalidates unissued amendment reservations, but never the original obligation.
            const originalLines=issued.lines.map((l:Data)=>{const current:Data=r.lines.find(x=>x.id===l.id)!;return {...l,carriedAccepted:current.carriedAccepted,carriedCancelled:current.carriedCancelled}});
            const originalLiability=approvalAmount({...issued,lines:originalLines});
            const groups=new Map<string,Data>();for(const e of all(s,'commitment').filter(e=>e.request===id)){const k=e.policy+':'+e.currency;const g=groups.get(k)??{policy:e.policy,currency:e.currency,amount:0};g.amount+=e.amountMinor;groups.set(k,g)}
            // A draft can release authority, never grant unapproved replenishment.
            for(const g of groups.values()){const target=g.policy===issued.policy&&g.currency===issued.currency?Math.min(originalLiability,g.amount):0;if(g.amount!==target)ledger(s,a,{...old,policy:g.policy,currency:g.currency},target-g.amount,'unissued-amendment-release')}
            put(s, 'order', issued.id, { ...issued, status: 'amendment-pending' });
        }
        else if (old?.status === 'approved') {
            const current = all(s, 'commitment').filter(e => e.request === id).reduce((n, e) => n + e.amountMinor, 0);
            ledger(s, a, old, -current, 'amendment-release');
        }
        for (const o of all(s, 'order').filter(o => o.request === id && !o.issuedAt))
            put(s, 'order', o.id, { ...o, status: 'superseded' });
        put(s, 'request', id, r);
        put(s, 'revision', `${id}:${r.revision}`, { ...r, request: id });
        audit(s, a, op, id, { revision: r.revision, reason: old ? text(b.reason, 'Amendment reason') : 'Created' });
        return r;
    }
    if (['submit', 'decision'].includes(op)) {
        const r = get(s, 'request', b.id);
        requireThat(r.revision === b.revision, 'Stale request revision', 409);
        supplier(s, r.supplier);
        requireThat(!r.imported, 'Imported status cannot grant native authority', 409);
        if (op === 'submit') {
            can(s, a, 'requester');
            requireThat(a.owner || r.requester === a.id || r.requesterEmail===a.email, 'Only requester may submit', 403);
            requireThat(['draft', 'returned', 'rejected'].includes(r.status), 'Request is not a draft', 409);
            for (const line of r.lines) if (line.catalogue) { const item = get(s, 'catalogue', line.catalogue); requireCatalogueAccess(s, a, item); requireThat(item.approved && currentPrice(item), 'Catalogue item is unapproved or outside price validity; revise the draft', 409); }
            requiredCatalogueFiles(s, r);
            const p = policies(s, r)[0];
            requireThat(p, 'No amount/category/project authority policy covers this request', 409);
            put(s, 'request', r.id, { ...r, status: 'pending', policy: p.id });
            audit(s, a, op, r.id, { revision: r.revision });
            return get(s, 'request', r.id);
        }
        requireThat(r.status === 'pending' && !r.imported, 'Request is not pending native authority', 409);
        const { p, delegated } = authorizedApproval(s, a, r);
        const decision = b.decision;
        requireThat(['approved', 'rejected', 'returned'].includes(decision), 'Choose approve, reject or return');
        const reason = text(b.reason, 'Decision reason');
        if (decision === 'approved') {
            const current = all(s, 'commitment').filter(e => e.request === r.id && e.policy===r.policy && e.currency===r.currency).reduce((n, e) => n + e.amountMinor, 0);
            const desired = approvalAmount(r);
            const delta = Math.max(0, desired - current);
            requireThat(reserved(s, p.id) + delta <= p.budgetMinor, 'Budget exhausted by existing commitments', 409);
            if (delta)
                ledger(s, a, r, delta, r.amends ? 'amendment-reservation' : 'reservation');
        }
        const id = uid();
        put(s, 'decision', id, { request: r.id, revision: r.revision, decision, reason, actor: a.id, email: a.email, owner: a.owner, operatorVersion:a.version, at: new Date().toISOString(), policy: p.id, policyVersion:s.get('policy:'+p.id)!.revision, policySnapshot:structuredClone(p), delegation: delegated?.id ?? null });
        put(s, 'request', r.id, { ...r, status: decision });
        audit(s, a, op, r.id, { revision: r.revision, decision, reason, decisionId: id });
        return get(s, 'request', r.id);
    }
    if (op === 'quote') {
        can(s, a, 'requester');
        const r = get(s, 'request', b.request);
        own(s, a, r);
        supplier(s, b.supplier);
        currency(s, b.currency);
        const id = uid();
        const ls = lines(s, b.lines, a);
        const q = { id, at: new Date().toISOString(), sequence: all(s, 'quote').filter(q => q.request === r.id && q.revision === r.revision).length + 1, request: r.id, revision: r.revision, supplier: b.supplier, currency: b.currency, lines: ls, freightMinor: moneyInput(b, 'freightAmount', 'freightMinor', 'Freight', { optional: true }), taxMinor: moneyInput(b, 'taxAmount', 'taxMinor', 'Supplied tax', { optional: true }), delivery: b.delivery ? date(b.delivery) : null, conditions: b.conditions ? text(b.conditions, 'Conditions') : null, source: text(b.source, 'Quote source evidence'), missing: [] as string[] };
        q.missing = ['freightMinor', 'taxMinor', 'delivery', 'conditions'].filter(k => (q as Data)[k] === null);
        put(s, 'quote', id, q);
        audit(s, a, op, r.id, { quote: id });
        return q;
    }
    if (op === 'attachment') {
        const kind = text(b.kind, 'Record kind');
        requireThat(['request', 'supplier', 'order', 'invoice', 'agreement'].includes(kind), 'Unsupported attachment record');
        const r = get(s, kind, b.record);
        requireThat(b.privateSupplierDocument === undefined || typeof b.privateSupplierDocument === 'boolean', 'Private supplier document flag must be boolean');
        requireThat(!b.privateSupplierDocument || kind === 'supplier', 'Private compliance evidence belongs to a supplier');
        if (kind === 'request') {
            can(s, a, 'requester');
            own(s, a, r);
        }
        else
            can(s, a, kind === 'agreement' ? 'owner' : kind === 'supplier' ? 'buyer' : kind === 'invoice' ? 'buyer' : 'receiver');
        requireThat(typeof b.base64 === 'string' && b.base64.length > 0 && b.base64.length <= 1400000, 'Attachment must contain up to 1 MB of bytes');
        let bytes;
        try {
            bytes = atob(b.base64);
        }
        catch {
            requireThat(false, 'Invalid attachment bytes');
        }
        requireThat(bytes!.length<=1000000,'Attachment must contain up to 1 MB of bytes');
        const id = uid();
        put(s, 'attachment', id, { kind, record: r.id, ...(b.privateSupplierDocument ? { privateSupplierDocument: true } : {}), name: text(b.name, 'Filename', 200), mediaType: text(b.mediaType ?? 'application/octet-stream', 'Media type', 150), base64: b.base64, size: bytes!.length, actor: a.id, at: new Date().toISOString() });
        audit(s, a, op, r.id, { attachment: id });
        if (kind === 'invoice') checkInvoiceAttachment(s, a, get(s, 'attachment', id));
        return { id };
    }
}
export function approvalAmount(r: Data) { const base = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0), remaining = r.lines.reduce((n: number, l: Data) => n + extended(l.q - (l.carriedAccepted ?? 0) - (l.carriedCancelled ?? 0), l.unitMinor), 0); return base ? Number((BigInt(r.totalMinor) * BigInt(remaining) + BigInt(base) / 2n) / BigInt(base)) : (r.lines.some((l:Data)=>l.q>(l.carriedAccepted??0)+(l.carriedCancelled??0))?r.totalMinor:0); }
