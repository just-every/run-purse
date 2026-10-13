export type Data = Record<string, any>;
export type Row = {
    business: string;
    kind: string;
    id: string;
    revision: string;
    value: Data;
};
export type State = Map<string, Row>;
export type Actor = {
    id: string;
    email: string;
    session: string; version:number;
    owner: boolean;
    dev: boolean;
};
export class Fault extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function requireThat(value: unknown, message: string, status = 400): asserts value { if (!value)
    throw new Fault(status, message); }
export const key = (kind: string, id: string) => `${kind}:${id}`;
export const all = (s: State, kind: string) => [...s.values()].filter(r => r.kind === kind).map(r => ({ ...r.value, id: r.id })) as Data[];
export function get(s: State, kind: string, id: string): Data { const r = s.get(key(kind, id)); requireThat(r, `${kind} not found`, 404); return { ...r.value, id: r.id }; }
export function put(s: State, kind: string, id: string, value: Data) { s.set(key(kind, id), { business: 'main', kind, id, revision: crypto.randomUUID(), value: { ...value, id } }); }
export const uid = () => crypto.randomUUID();
export function text(v: unknown, label: string, max = 2000): string { requireThat(typeof v === 'string' && v.trim().length > 0 && v.length <= max, `${label} required (maximum ${max} characters)`); return v.trim(); }
export function minor(v: unknown, label = 'Minor units'): number { requireThat(Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e12, `${label} must be nonnegative integer minor units`); return Number(v); }
export function quantity(v: unknown): number { requireThat(typeof v === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(v), 'Quantity must be a positive decimal string with up to 3 decimal places'); const [w, f = ''] = v.split('.'); const q = Number(w) * 1000 + Number(f.padEnd(3, '0')); requireThat(q > 0, 'Quantity must be positive'); return q; }
export const extended = (q: number, cost: number) => { const n = (BigInt(q) * BigInt(cost) + 500n) / 1000n; requireThat(n <= 1000000000000n, 'Line amount too large'); return Number(n); };
export const qty = (n: number) => (n / 1000).toFixed(3).replace(/\.?0+$/, '');
export function date(v: unknown, label = 'Date') { const x = text(v, label); requireThat(/^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x, 'Use a valid YYYY-MM-DD date'); return x; }
export const audit = (s: State, a: Actor, action: string, record: string, detail: Data = {}) => { const id = uid(); put(s, 'audit', id, { actor: a.id, email: a.email, action, record, at: new Date().toISOString(), ...detail }); };
export function roles(s: State, a: Actor): string[] { if (a.owner)
    return ['owner', 'requester', 'approver', 'buyer', 'receiver']; const m = all(s, 'member').find(m => m.email.toLowerCase() === a.email.toLowerCase() && m.active); return m?.roles ?? []; }
export function can(s: State, a: Actor, role: string) { requireThat(roles(s, a).includes(role), `${role} capability required`, 403); }
export function own(s: State, a: Actor, r: Data) { requireThat(a.owner || r.requester === a.id || r.requesterEmail === a.email || roles(s, a).some(r => ['approver', 'buyer', 'receiver'].includes(r)), 'Record outside your scope', 403); }
