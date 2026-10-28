import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { csv } from './import-mapping';
import { moneyInput } from './money';
import { all, audit, can, get, put, requireThat, type Actor, type Data, type State } from './types';

const fields = ['budget', 'amount', 'currency', 'department', 'location', 'project', 'glAccount', 'owner', 'thresholds'];
const dimensions: Record<string, string> = { department: 'costCentre', location: 'location', project: 'project', glAccount: 'glAccount' };
function mapped(values: unknown, source: string, label: string): string {
    requireThat(values && typeof values === 'object' && Object.hasOwn(values, source), 'Map ' + label + ': ' + source);
    const result = (values as Data)[source];
    requireThat(typeof result === 'string' && result.length > 0, 'Choose ' + label);
    return result;
}
function plan(s: State, a: Actor, b: Data) {
    can(s, a, 'owner');
    requireThat(typeof b.csv === 'string' && new TextEncoder().encode(b.csv).length <= 1000000, 'Choose a UTF-8 CSV of at most 1 MB');
    const rows = csv(b.csv.replace(/^\uFEFF/,'')), mapping = b.mapping;
    requireThat(rows.length > 0 && rows.length <= 500, 'Import 1–500 budget rows');
    requireThat(mapping && fields.every(field => typeof mapping.columns?.[field] === 'string' && Object.hasOwn(rows[0], mapping.columns[field])), 'Map every budget column');
    requireThat(new Set(fields.map(field => mapping.columns[field])).size === fields.length, 'Map each column only once');
    const used = new Set<string>();
    const changes = rows.map((row, index) => {
        const value = (field: string) => row[mapping.columns[field]].trim();
        const policy = get(s, 'policy', mapped(mapping.budgets, value('budget'), 'budget'));
        requireThat(policy.active && policy.budgetPeriod, 'Choose an active dated approval policy');
        requireThat(!used.has(policy.id), 'Only one row per target budget'); used.add(policy.id);
        requireThat(policy.currency === value('currency') && get(s, 'business', 'main').currencies.includes(policy.currency), 'Budget currency must match its enabled policy currency');
        const coding: Data = {};
        for (const [field, target] of Object.entries(dimensions)) {
            const selected = mapped(mapping.dimensions?.[field], value(field), field);
            requireThat(selected === (policy[target] || '*'), 'Mapped ' + field + ' differs from the target policy');
            const choices = ({ department: 'costCentres', location: 'locations', project: 'projects' } as Data)[field];
            requireThat(selected === '*' || !choices || get(s, 'business', 'main')[choices].includes(selected), 'Choose a configured ' + field);
            coding[target] = selected;
        }
        const ownerEmail = mapped(mapping.owners, value('owner'), 'current member');
        requireThat(s.get('member:' + ownerEmail)?.value.active === true, 'Budget owner must be a current active member');
        const thresholds = value('thresholds') === '' ? [] : value('thresholds').split(';').map(item => {
            requireThat(/^\d{1,3}$/.test(item.trim()), 'Thresholds must be whole percentages separated by semicolons');
            const percent = Number(item); requireThat(percent > 0 && percent <= 100, 'Thresholds must be between 1 and 100 percent'); return percent;
        });
        requireThat(thresholds.length <= 10 && new Set(thresholds).size === thresholds.length, 'Choose up to ten distinct thresholds'); thresholds.sort((a,b) => a-b);
        const amountMinor = moneyInput({amount: value('amount')}, 'amount', 'minor', 'Budget amount');
        const settings = { policy: policy.id, ownerEmail, thresholds };
        const previous = s.get('budgetAssignment:' + policy.id)?.value;
        const changed = amountMinor !== policy.budgetMinor || !previous || previous.ownerEmail !== ownerEmail || canonicalJson(previous.thresholds) !== canonicalJson(thresholds);
        return { row: index + 2, policy: policy.id, name: policy.name, currency: policy.currency, ...coding, period: policy.budgetPeriod, beforeMinor: policy.budgetMinor, amountMinor, ownerEmail, thresholds, changed, settings };
    });
    const sourceHash = sha256(b.csv), mappingHash = sha256(canonicalJson(mapping));
    const stateHash = sha256(canonicalJson([...s.entries()].map(([key, row]) => [key, row.revision]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))));
    const fingerprint = sha256(canonicalJson({ sourceHash, mappingHash, stateHash, actor: a.id, version: a.version, session: a.session, changes }));
    return { sourceHash, mappingHash, fingerprint, rows: changes, changes: changes.filter(row => row.changed).length };
}
function reviewToken(env: Bindings, fingerprint: string) {
    requireThat(env.SESSION_SECRET, 'Native review signing is unavailable', 409);
    return createHmac('sha256', env.SESSION_SECRET).update('budget-import:' + fingerprint).digest('hex');
}
export function budgetImportColumns(s: State, a: Actor, b: Data) {
    can(s,a,'owner');
    requireThat(typeof b.csv === 'string' && new TextEncoder().encode(b.csv).length <= 1000000,'Choose a UTF-8 CSV of at most 1 MB');
    const rows = csv(b.csv.replace(/^\uFEFF/,''));
    requireThat(rows.length > 0 && rows.length <= 500,'Import 1–500 budget rows');
    return {columns:Object.keys(rows[0]),rows};
}
export function previewBudgetImport(s: State, a: Actor, b: Data, env: Bindings) {
    const result = plan(s,a,b);
    return { ...result, review: reviewToken(env,result.fingerprint) };
}
export function budgetImport(s: State, a: Actor, op: string, b: Data, env?: Bindings): Data | undefined {
    if (op !== 'budget-import-commit') return;
    requireThat(b.consent === true, 'Review and explicitly confirm the budget import');
    const result = plan(s,a,b);
    requireThat(env && result.fingerprint === b.fingerprint, 'Budget source, mapping or state changed; preview again', 409);
    const expected = reviewToken(env,result.fingerprint);
    requireThat(typeof b.review === 'string' && /^[a-f0-9]{64}$/.test(b.review) && timingSafeEqual(Buffer.from(expected),Buffer.from(b.review)), 'Preview this exact budget import before committing', 409);
    for (const row of result.rows.filter(row => row.changed)) {
        const before = get(s,'policy',row.policy), beforeSettings = s.get('budgetAssignment:' + row.policy)?.value ?? null;
        // Import edits money and alert custody only. Existing approval authority,
        // coding, period, workflow and over-budget decisions are untouched.
        put(s,'policy',row.policy,{...before,budgetMinor:row.amountMinor});
        put(s,'budgetAssignment',row.policy,row.settings);
        audit(s,a,'budget-import',row.policy,{sourceHash:result.sourceHash,mappingHash:result.mappingHash,beforeMinor:before.budgetMinor,afterMinor:row.amountMinor,beforeSettings,afterSettings:row.settings});
    }
    return { changes: result.changes, sourceHash: result.sourceHash, mappingHash: result.mappingHash };
}
