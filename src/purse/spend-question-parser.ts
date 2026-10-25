import { date, type Data } from './types';

const dimensions: Record<string, string> = {department:'department',project:'project',location:'location',supplier:'supplier',category:'category','gl account':'glAccount'};
const refused = (reason: string) => ({ status: 'declined', reason });
function quarter(year: number, month: number) {
    const start = new Date(Date.UTC(year, month, 1)), end = new Date(Date.UTC(year, month + 3, 0));
    return { from: start.toISOString().slice(0,10), through: end.toISOString().slice(0,10) };
}
/** A bounded native reader refuses any words it cannot map to report filters. */
export function parseSpendQuestion(question: string, choices: Data, now: Date): Data {
    let rest = question.trim().replace(/[?.]$/, '');
    if (/\b(paid|payment|card|without a po|forecast|predict|bank|tax identification|tin)\b/i.test(rest))
        return refused('REPORT-001 records purchasing authority and invoice evidence, not verified payments, card transactions, protected values or forecasts.');
    const filters: Data = { groupBy: 'supplier' };
    const explicit = /\bfrom (\d{4}-\d{2}-\d{2}) (?:through|to) (\d{4}-\d{2}-\d{2})\b/i.exec(rest);
    const relative = /\b(this quarter|last quarter|last year|in (\d{4})|all recorded dates)\b/i.exec(rest);
    if (explicit && relative) return refused('Use one period per question.');
    if (explicit) {
        try { filters.from = date(explicit[1]); filters.through = date(explicit[2]); } catch { return refused('The period contains an invalid calendar date.'); }
        if (filters.from > filters.through) return refused('The period starts after it ends.');
        rest = rest.replace(explicit[0], '');
    } else if (relative) {
        const phrase = relative[1].toLowerCase(), year = now.getUTCFullYear();
        if (phrase === 'this quarter') Object.assign(filters,quarter(year,Math.floor(now.getUTCMonth()/3)*3));
        else if (phrase === 'last quarter') Object.assign(filters,quarter(year,Math.floor(now.getUTCMonth()/3)*3-3));
        else if (phrase !== 'all recorded dates') { const y = phrase === 'last year' ? year-1 : Number(relative[2]); filters.from = `${y}-01-01`; filters.through = `${y}-12-31`; }
        rest = rest.replace(relative[0], '');
    } else return refused('State a period: from YYYY-MM-DD through YYYY-MM-DD, this quarter, last quarter, last year, in a year, or all recorded dates.');
    const group = /\bby (department|project|location|supplier|category|gl account)\b/i.exec(rest);
    if (group) { filters.groupBy = dimensions[group[1].toLowerCase()]; rest = rest.replace(group[0], ''); }
    const clauses = [...rest.matchAll(/\bfor (department|project|location|supplier|category|gl account)\s+("[^"]+"|.+?)(?=\s+for\s|$)/gi)];
    for (const clause of clauses) {
        const dimension = dimensions[clause[1].toLowerCase()], name = clause[2].trim().replace(/^"|"$/g,'');
        const candidates = (choices[dimension] ?? []).filter((choice: Data) => String(choice.label).toLowerCase() === name.toLowerCase() || String(choice.value).toLowerCase() === name.toLowerCase());
        if (filters[dimension] || candidates.length !== 1) return refused(`The ${clause[1].toLowerCase()} filter is unavailable or ambiguous in your visible report records.`);
        filters[dimension] = candidates[0].value;
        rest = rest.replace(clause[0], '');
    }
    rest = rest.trim().replace(/\s+/g,' ').toLowerCase();
    const match = /^(?:show|what is|what was|how much is|how much was|how much did we) (reserved|committed|actual|spend|reserve|commit)(?: spend)?(?: against budget)?$/.exec(rest);
    if (!match) return refused('This native reader could not map the whole question to REPORT-001. Ask for reserved, committed or actual spend, optional grouping and exact report filters; unsupported conditions are never ignored.');
    const metric = ({reserve:'reserved',commit:'committed',spend:'actual'} as Data)[match[1]] ?? match[1];
    return { status:'answered', filters, metric, againstBudget:rest.endsWith('against budget'), period:{from:filters.from ?? null,through:filters.through ?? null,basis:'UTC calendar; need dates for authority, UTC entry dates for invoice evidence'} };
}
