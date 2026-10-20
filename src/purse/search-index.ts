import { date, requireThat } from './types';
import { moneyInput } from './money';

export const searchKinds = ['request', 'order', 'invoice', 'receipt', 'supplier', 'catalogue', 'quoteReading', 'invoiceReading', 'supplierDocument', 'agreement'] as const;
export type SearchFilters = ReturnType<typeof searchFilters>;

function bounded(value: string | undefined, label: string, max = 300) {
    requireThat(!value || value.length <= max, `${label} exceeds ${max} characters`);
    return value?.trim() ?? '';
}
function integer(value: string | undefined, fallback: number, max: number) {
    requireThat(value === undefined || /^\d{1,7}$/.test(value), 'Use a nonnegative integer for pagination');
    const result = value === undefined ? fallback : Number(value);
    requireThat(result <= max, `Pagination exceeds ${max}`);
    return result;
}
export function searchFilters(query: Record<string, string>) {
    let q = bounded(query.q, 'Search', 300);
    const kind = bounded(query.kind, 'Kind', 40);
    requireThat(!kind || searchKinds.includes(kind as typeof searchKinds[number]), 'Unknown search kind');
    let amountMin = query.amountMin === undefined || query.amountMin === '' ? undefined : moneyInput({ amount: query.amountMin }, 'amount', 'minor', 'Minimum amount');
    let amountMax = query.amountMax === undefined || query.amountMax === '' ? undefined : moneyInput({ amount: query.amountMax }, 'amount', 'minor', 'Maximum amount');
    if (/^\$/.test(q) || /^(?:\d+\.\d{1,2}|[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?)$/.test(q)) {
        const exact = moneyInput({ amount: q.replace(/^\$/, '').trim() }, 'amount', 'minor', 'Search amount');
        requireThat((amountMin === undefined || exact >= amountMin) && (amountMax === undefined || exact <= amountMax), 'Exact amount is outside the selected range');
        amountMin = amountMax = exact; q = '';
    }
    requireThat(amountMin === undefined || amountMax === undefined || amountMin <= amountMax, 'Amount range is reversed');
    const dateFrom = query.dateFrom ? date(query.dateFrom, 'From date') : '', dateTo = query.dateTo ? date(query.dateTo, 'To date') : '';
    requireThat(!dateFrom || !dateTo || dateFrom <= dateTo, 'Date range is reversed');
    const currency = bounded(query.currency, 'Currency', 3).toUpperCase();
    requireThat(!currency || /^[A-Z]{3}$/.test(currency), 'Use a three-letter currency');
    const limit = integer(query.limit, 25, 100); requireThat(limit > 0, 'Limit must be positive');
    return { q, kind, id: bounded(query.id, 'Record ID', 2000), amountMin, amountMax, dateFrom, dateTo, currency, requester: bounded(query.requester, 'Requester'), status: bounded(query.status, 'Status', 100), coding: bounded(query.coding, 'Coding'), limit, offset: integer(query.offset, 0, 100000) };
}

/** Both the migration and queries fold names through these same Unicode tables. */
export const normalizeSearchSql = `WITH RECURSIVE chars(rest, folded) AS (
    VALUES(?, '') UNION ALL SELECT substr(rest, 2), folded ||
    CASE WHEN EXISTS(SELECT 1 FROM p_search_drop WHERE unicode(substr(rest,1,1)) BETWEEN lo AND hi)
        THEN '' ELSE coalesce((SELECT replacement FROM p_search_fold WHERE code=unicode(substr(rest,1,1))),substr(rest,1,1)) END
    FROM chars WHERE rest<>''
) SELECT folded AS normalized FROM chars WHERE rest=''`;

export function searchExpression(q: string) {
    const tokens = q.match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
    return tokens.map(token => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
}
export const likeText = (value: string) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
