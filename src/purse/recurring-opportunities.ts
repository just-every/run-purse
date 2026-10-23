import { purchaseTypes, requireAgentPolicies } from './agent-governance';
import { canonicalValue, valueDigest } from './agent-value-evidence';
import { orderAdoption } from './adoption-position';
import { rejectProtectedInput } from './protected-input';
import { canonicalSupplier } from './supplier-identity';
import { all, audit, date, get, put, requireThat, uid, type Actor, type Data, type State } from './types';

const pick = (row: Data, fields: string) => Object.fromEntries(fields.split(',').filter(k => row[k] !== undefined).map(k => [k, structuredClone(row[k])]));
const category = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const intersects = (from: string, to: string, start: string, end: string) => start <= to && end >= from;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function source(s: State, kind: string, id: string, value: Data) {
    const row = s.get(kind + ':' + id);
    requireThat(row && !row.value.imported, 'Discovery needs native source records', 409);
    return { kind, id, revision: row.revision, value };
}

function agreementSource(s: State, agreement: Data) {
    return source(s, 'agreement', agreement.id, { ...pick(agreement, 'name,reference,version,supplier,currency,startDate,endDate,noticeDeadline,noticeDays,autoRenew,owner,valueMinor'),
        priceHistory: (agreement.history ?? []).map((h: Data) => ({ ...pick(h, 'version,currency,valueMinor,startDate,endDate,noticeDeadline,at'),
            priceLines: (h.priceLines ?? []).map((l: Data) => pick(l, 'description,partNumber,unit,q,awardedUnitMinor')) })) });
}

function priceIncreases(agreement: Data, from: string, to: string) {
    const result: Data[] = [], history: Data[] = agreement.history ?? [];
    for (let index = 1; index < history.length; index++) {
        const previous = history[index - 1], current = history[index];
        // A correction without an unchanged priced item/quantity is not a price
        // increase. Recorded confirmation dates, rather than invented billing
        // periods, determine which history belongs in this discovery period.
        if (current.currency !== previous.currency || current.currency !== agreement.currency ||
            current.startDate !== previous.startDate || current.endDate !== previous.endDate ||
            !current.confirmedBy || !previous.confirmedBy || !current.at || current.at.slice(0, 10) < from || current.at.slice(0, 10) > to) continue;
        const key = (line: Data) => canonicalValue({ partNumber: line.partNumber ?? null, description: line.description, unit: line.unit, q: line.q });
        const before: Data[] = previous.priceLines ?? [], after: Data[] = current.priceLines ?? [];
        const beforeKeys = before.map(key), afterKeys = after.map(key);
        if (new Set(beforeKeys).size !== beforeKeys.length || new Set(afterKeys).size !== afterKeys.length) continue;
        for (const line of after) {
            const old = before.find(row => key(row) === key(line));
            if (old && nonnegative(old.awardedUnitMinor) && nonnegative(line.awardedUnitMinor) && line.awardedUnitMinor > old.awardedUnitMinor)
                result.push({ previousVersion: previous.version, currentVersion: current.version, confirmedAt: current.at,
                    ...pick(line, 'description,partNumber,unit,q'), beforeUnitMinor: old.awardedUnitMinor, afterUnitMinor: line.awardedUnitMinor,
                    increaseUnitMinor: line.awardedUnitMinor - old.awardedUnitMinor, currency: agreement.currency,
                    basis: 'Owner-confirmed same item, unit and quantity; recorded price-history correction, not proof of a new supplier charge' });
        }
    }
    return result;
}

/** Discovery is conditional native research. It never invents a replacement
 * price, treats reported activity as verified utility, or executes a proposal.
 */
export async function recurringOpportunities(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (op !== 'recurring-scenario-discover') return;
    rejectProtectedInput(b);
    requireThat(a.owner, 'Current native owner required to discover recurring opportunities', 403);
    const from = date(b.from, 'Discovery start'), to = date(b.to, 'Discovery end'), limit = b.limit ?? 100;
    requireThat(from <= to, 'Discovery end must follow its start');
    requireThat(Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'Choose an explicit proposal limit from 1 to 200');
    const agreements = all(s, 'agreement'), orders = all(s, 'order'), usage = all(s, 'valueSeatImport'), issues = all(s, 'supplierIssue');
    const series = all(s, 'recurringSeries'), awards = all(s, 'agreementAward'), suppliers = all(s, 'supplier');
    requireThat(agreements.length <= 1000 && orders.length <= 10000 && usage.length <= 10000 && issues.length <= 10000 &&
        series.length <= 10000 && awards.length <= 10000 && suppliers.length <= 10000,
        'Discovery source limit exceeded; native discovery supports 1,000 agreements and 10,000 records per related type', 409);
    const relevant = agreements.filter(r => !r.imported && intersects(from, to, r.startDate, r.endDate)).sort((x,y) => x.id.localeCompare(y.id));
    requireThat(relevant.every(r => Array.isArray(r.history) && r.history.length <= 1000), 'Discovery supports up to 1,000 confirmed price revisions per agreement', 409);
    const contexts = relevant.map(agreement => {
        const family = canonicalSupplier(s, agreement.supplier);
        const links = [...series.filter(r => !r.imported && r.agreement === agreement.id).map(r => ({ kind: 'recurringSeries', row: r })),
            ...awards.filter(r => !r.imported && r.agreement === agreement.id).map(r => ({ kind: 'agreementAward', row: r }))];
        const nativeOrders = orders.filter(order => order.issuedAt && !order.imported && !orderAdoption(s, order) && order.currency === agreement.currency &&
            canonicalSupplier(s, order.supplier) === family && links.some(link => link.kind === 'recurringSeries'
                ? link.row.order === order.id || link.row.request === order.request || link.row.id === order.recurring?.series
                : link.row.request === order.request && link.row.revision === order.revision));
        requireAgentPolicies(s, 'AGENT-006', nativeOrders.length ? [...new Set(nativeOrders.flatMap(purchaseTypes))] : ['*']);
        const orderIds = new Set(nativeOrders.map(r => r.id));
        const categories = [...new Set(nativeOrders.flatMap(order => order.lines.map((line: Data) => category(line.category))).filter(Boolean))].sort();
        const usageRows = usage.filter(row => !row.imported && nonnegative(row.seatCount) && row.seatCount > 0 && nonnegative(row.activeSeats) && row.activeSeats <= row.seatCount &&
            row.activeRule === 'active-true' && row.periodStart >= from && row.periodEnd <= to &&
            nativeOrders.some(order => order.request === row.request && order.revision === row.revision));
        // Keep the latest period for each reported provider and exact request.
        // Independent provider reports remain separate facts, never a sum.
        const latest = new Map<string, Data>();
        for (const row of usageRows.sort((x,y) => x.periodEnd.localeCompare(y.periodEnd) || x.periodStart.localeCompare(y.periodStart) || x.id.localeCompare(y.id)))
            latest.set(canonicalValue([row.request,row.revision,row.provider]), row);
        const reportedUsage = [...latest.values()].sort((x,y) => x.id.localeCompare(y.id));
        const serviceIssues = issues.filter(row => !row.imported && orderIds.has(row.order) && row.status === 'open' && row.at?.slice(0,10) <= to);
        const sources: Data[] = [agreementSource(s, agreement)];
        for (const supplier of suppliers.filter(row => canonicalSupplier(s, row.id) === family))
            sources.push(source(s, 'supplier', supplier.id, pick(supplier, 'name,mergedInto')));
        for (const link of links.filter(link => nativeOrders.some(order => link.kind === 'recurringSeries'
            ? link.row.order === order.id || link.row.request === order.request || link.row.id === order.recurring?.series
            : link.row.request === order.request && link.row.revision === order.revision)))
            sources.push(source(s, link.kind, link.row.id, pick(link.row, 'agreement,agreementVersion,order,request,revision,status,version')));
        for (const order of nativeOrders) {
            sources.push(source(s, 'order', order.id, { ...pick(order, 'number,request,revision,supplier,currency,issuedAt,status,totalMinor'),
                lines: order.lines.map((line: Data) => pick(line, 'id,category,q,unitMinor,totalMinor')) }));
            const request = get(s, 'request', order.request);
            sources.push(source(s, 'request', request.id, pick(request, 'title,revision,status')));
        }
        for (const row of reportedUsage) sources.push(source(s, 'valueSeatImport', row.id, pick(row, 'request,revision,provider,periodStart,periodEnd,seatCount,activeSeats,activeRule,provenance,sha256')));
        for (const row of serviceIssues) sources.push(source(s, 'supplierIssue', row.id, pick(row, 'order,supplier,category,status,at')));
        return { agreement, family, categories, sources, reportedUsage, serviceIssues, increases: priceIncreases(agreement, from, to) };
    });
    if (!contexts.length) requireAgentPolicies(s, 'AGENT-006', ['*']);
    const candidates: Data[] = [];
    let citedRecords = 0;
    const add = (kind: string, selected: typeof contexts, facts: Data, reason: string, operationalRisk: string) => {
        requireThat(candidates.length < limit, 'More opportunities exist than the explicit limit; narrow the discovery period or increase its limit', 409);
        const sources = [...new Map(selected.flatMap(r => r.sources).map(row => [row.kind + ':' + row.id, row])).values()]
            .sort((x,y) => x.kind.localeCompare(y.kind) || x.id.localeCompare(y.id));
        citedRecords += sources.length;
        requireThat(sources.length <= 2000 && citedRecords <= 10000, 'Discovery evidence limit exceeded; narrow the explicit discovery period', 409);
        candidates.push({ kind, agreementIds: selected.map(r => r.agreement.id).sort(), reason, operationalRisk,
            conditional: true, reviewRequired: true, sources, baseline: { currency: selected[0].agreement.currency,
                noticeDeadlines: selected.map(r => ({ agreement: r.agreement.id, name: r.agreement.name, reference: r.agreement.reference,
                    date: r.agreement.noticeDeadline, dueInPeriod: r.agreement.noticeDeadline >= from && r.agreement.noticeDeadline <= to,
                    alreadyBeforePeriod: r.agreement.noticeDeadline < from })), ...facts,
                openServiceIssues: [...new Map(selected.flatMap(r => r.serviceIssues).map(r => [r.id, { id: r.id, ...pick(r, 'order,category,status,at') }])).values()].sort((x,y) => x.id.localeCompare(y.id)), futureForecast: 'unknown',
                cashEffect: 'Not estimated; a separate owner-entered scenario with reasoned assumptions is required' } });
    };
    for (let left = 0; left < contexts.length; left++) for (let right = left + 1; right < contexts.length; right++) {
        const first = contexts[left], second = contexts[right];
        if (first.agreement.currency !== second.agreement.currency) continue;
        const sharedCategories = first.categories.filter(value => second.categories.includes(value));
        const start = [from,first.agreement.startDate,second.agreement.startDate].sort().at(-1)!;
        const end = [to,first.agreement.endDate,second.agreement.endDate].sort()[0];
        if (start > end || !first.categories.length || !second.categories.length || !sharedCategories.length && first.family !== second.family) continue;
        add('consolidate', [first,second], { overlap: { from: start, to: end }, sharedCategories, sameSupplierFamily: first.family === second.family,
            basis: 'Confirmed native PO category or supplier-family overlap during recorded agreement calendar overlap' },
        'Review consolidation of overlapping agreements with recorded related PO categories or supplier family.',
        'Calendar, category and supplier-family overlap do not prove interchangeability. Owners must verify service coverage, migration effort, notice obligations and recorded open supplier issues before pricing a scenario.');
    }
    for (const context of contexts) {
        const underused = context.reportedUsage.filter(row => row.activeSeats < row.seatCount);
        if (underused.length || context.increases.length)
            add('renegotiate', [context], { usage: underused.map(row => ({ id: row.id, provider: row.provider, periodStart: row.periodStart, periodEnd: row.periodEnd,
                seatCount: row.seatCount, activeSeats: row.activeSeats, unusedReportedSeats: row.seatCount - row.activeSeats })), priceIncreases: context.increases,
                basis: 'Latest in-period provider-reported activity per exact request/provider, or comparable owner-confirmed price history' },
            'Review renegotiation against recorded underusage or a confirmed comparable unit-price increase.',
            'Reported activity is unverified and does not measure business utility. Price-history corrections are recorded terms, not proof of supplier billing. Owners must confirm the appropriate seat plan, service outcomes, notice deadline and actual offered price.');
        if (context.reportedUsage.length && context.reportedUsage.every(row => row.activeSeats === 0))
            add('cancellation-review', [context], { usage: context.reportedUsage.map(row => ({ id: row.id, provider: row.provider, periodStart: row.periodStart,
                periodEnd: row.periodEnd, seatCount: row.seatCount, activeSeats: row.activeSeats })), basis: 'All selected latest in-period reports record zero active seats; absence of other usage evidence is not evidence of no use' },
            'Ask the agreement owner to review cancellation because the selected recorded usage reports show zero active seats.',
            'Zero reported activity does not establish that a service is useless, unused by other people or safe to cancel. Review integrations, continuity, service issues and contractual notice; a person must separately approve a scenario and send any eventual notice.');
    }
    const proposals: Data[] = await Promise.all(candidates.map(async candidate => ({ id: await valueDigest(canonicalValue({ from, to, ...candidate })), ...candidate })));
    for (const proposal of proposals) rejectProtectedInput(proposal);
    const references = [...new Map<string, Data>(proposals.flatMap(proposal => proposal.sources.map((r: Data) =>
        [r.kind + ':' + r.id, { kind: r.kind, id: r.id, version: r.revision }] as [string, Data]))).values()]
        .sort((x,y) => x.kind.localeCompare(y.kind) || x.id.localeCompare(y.id));
    const id = uid(), run = { workflow: 'recurring-discovery', actor: a.id, from, to, inputs: { from, to, limit },
        missing: [], draft: `${proposals.length} conditional recurring-spend proposals for ${from} through ${to}; owner review and a separately approved scenario are required.`,
        version: 1, at: new Date().toISOString(), actions: [], mode: 'deterministic v1', model: 'none', provider: 'none', proposals, references };
    rejectProtectedInput(run);
    put(s, 'agentRun', id, run);
    audit(s, a, op, 'recurring-opportunities', { run: id, from, to, mode: 'deterministic v1', model: 'none', provider: 'none',
        proposals: proposals.map(proposal => ({ id: proposal.id, kind: proposal.kind, agreements: proposal.agreementIds,
            sources: proposal.sources.map((r: Data) => ({ kind: r.kind, id: r.id, revision: r.revision })) })) });
    return { id, ...run,
        basis: 'Conditional owner-review proposals from recorded native facts; no purchasing, cash, agreement, message or cancellation changes' };
}
