import { initializeSupplierMatching } from './supplier-identity';
import { moneyInput } from './money';
import { all, audit, can, get, put, requireThat, text, date, uid, type Actor, type Data, type State } from './types';
export function administration(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'business') {
        can(s, a, 'owner');
        const currencies = (b.currencies ?? ['AUD']).map((c: unknown) => text(c, 'Currency'));
        requireThat(currencies.length && currencies.every((c: string) => /^[A-Z]{3}$/.test(c)), 'Use ISO currency codes');
        for(const field of ['locations','costCentres','projects']){requireThat(Array.isArray(b[field])&&b[field].length>0&&b[field].length<=100,field+' requires 1–100 codes');requireThat(b[field].every((v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=200),field+' must contain nonempty names');requireThat(new Set(b[field]).size===b[field].length,field+' contains duplicates')}
        const timezone = b.timezone || s.get('business:main')?.value.timezone || 'America/New_York';
        try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); } catch { requireThat(false,'Use a valid IANA installation timezone'); }
        put(s, 'business', 'main', { timezone, name: text(b.name, 'Business name'), currencies, locations: b.locations ?? [], costCentres: b.costCentres ?? [], projects: b.projects ?? [] });
        initializeSupplierMatching(s);
        audit(s, a, op, 'main');
        return get(s, 'business', 'main');
    }
    if (op === 'member') {
        can(s, a, 'owner');
        const email = text(b.email, 'Email').toLowerCase();
        requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Valid email required');
        requireThat(Array.isArray(b.roles) && b.roles.every((r: string) => ['requester', 'approver', 'buyer', 'receiver'].includes(r)), 'Invalid role');
        put(s, 'member', email, { email, name: text(b.name, 'Name'), roles: b.roles, active: b.active !== false });
        audit(s, a, op, email, { roles: b.roles, active: b.active !== false });
        return get(s, 'member', email);
    }
    if (op === 'policy') {
        can(s, a, 'owner');
        currency(s, b.currency);
        const id = b.id ?? uid();
        put(s, 'policy', id, { name: text(b.name, 'Policy name'), currency: b.currency, category: b.category || '*', project: b.project || '*', limitMinor: moneyInput(b, 'limitAmount', 'limitMinor', 'Authority limit'), budgetMinor: moneyInput(b, 'budgetAmount', 'budgetMinor', 'Budget'), approver: text(b.approver, 'Approver email').toLowerCase(), active: b.active !== false });
        audit(s, a, op, id);
        return get(s, 'policy', id);
    }
    if (op === 'delegation') {
        can(s, a, 'approver');
        const p = get(s, 'policy', b.policy);
        requireThat(a.owner || p.approver === a.email, 'Only policy approver may delegate', 403);
        requireThat(all(s, 'member').some(m => m.email === b.delegate && m.active && m.roles.includes('approver')), 'Delegate must be an active approver');
        const expires = text(b.expires, 'Expiry');
        requireThat(Number.isFinite(Date.parse(expires)) && Date.parse(expires) > Date.now(), 'Expiry must be in the future');
        const id = uid();
        put(s, 'delegation', id, { policy: p.id, from: p.approver, delegate: b.delegate, expires, reason: text(b.reason, 'Delegation reason'), active: true });
        audit(s, a, op, id);
        return get(s, 'delegation', id);
    }
    if (op === 'revoke-delegation') {
        can(s, a, 'approver');
        const d = get(s, 'delegation', b.id);
        requireThat(a.owner || d.from === a.email, 'Delegation outside your scope', 403);
        put(s, 'delegation', b.id, { ...d, active: false });
        audit(s, a, op, b.id);
        return { id: b.id };
    }
}
export function supplier(s: State, id: string) { const v = get(s, 'supplier', id); requireThat(!v.mergedInto, 'Supplier merged; choose the surviving supplier and renew purchasing authority', 409); requireThat(v.status !== 'blocked', 'Supplier blocked: ' + v.reason, 409); requireThat(v.status !== 'pending_review', 'Supplier pending OFAC compliance review', 409); requireThat(v.screenings?.length, 'Supplier requires OFAC screening before activation', 409); return v; }
export function currency(s: State, c: string) { requireThat(get(s, 'business', 'main').currencies.includes(c), 'Currency is not enabled for this business'); }
