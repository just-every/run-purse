import { cashRequirements } from './cash-requirements';
import { canonicalValue, valueDigest } from './agent-value-evidence';
import { canonicalSupplier } from './supplier-identity';
import { rejectProtectedInput } from './protected-input';
import { unrestrictedPermission } from './access-records';
import { performanceAgreementSources } from './access-agreement-sources';
import { accessGrants, allowed, all, audit, date, get, minor, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

const ops = ['recurring-scenario-prepare', 'recurring-scenario-approve', 'recurring-scenario-draft'];
const evidenceFields: Record<string, string> = {
    valueSeatImport: 'request,revision,provider,periodStart,periodEnd,activeRule,sha256,seatCount,activeSeats,provenance',
    valueConfirmation: 'request,revision,usefulness,at,run,runVersion',
    supplierIssue: 'supplier,order,category,status,at',
    supplierOrderEvidence: 'order,supplier,version,promisedDate,acknowledgedAt',
    receipt: 'order,line,event,q,quantity,at,valueMinor,mode,percentage,milestone',
};
const pick = (value: Data, fields: string) => Object.fromEntries(fields.split(',').filter(field => value[field] !== undefined).map(field => [field, structuredClone(value[field])]));
const total = (values: number[]) => { const n = values.reduce((sum, value) => sum + value, 0); requireThat(Number.isSafeInteger(n), 'Scenario total is too large'); return n; };

function choices(input: Data) {
    requireThat(['consolidate', 'renegotiate', 'cancel'].includes(input.kind), 'Choose consolidate, renegotiate or cancel');
    requireThat(Array.isArray(input.agreementIds) && input.agreementIds.length > 0 && input.agreementIds.length <= 20, 'Choose 1–20 explicit agreements');
    const agreementIds = input.agreementIds.map((id: unknown) => text(id, 'Agreement ID', 200)).sort();
    requireThat(new Set(agreementIds).size === agreementIds.length, 'Choose each agreement once');
    requireThat(input.kind !== 'consolidate' || agreementIds.length > 1, 'Consolidation needs at least two agreements');
    const from = date(input.from, 'Scenario start'), to = date(input.to, 'Scenario end');
    requireThat(from <= to, 'Scenario end must follow its start');
    requireThat(Array.isArray(input.assumptions) && input.assumptions.length > 0 && input.assumptions.length <= 100, 'Supply 1–100 explicit assumptions');
    const assumptions = input.assumptions.map((row: Data) => {
        const agreement = text(row.agreement, 'Assumption agreement', 200);
        requireThat(agreementIds.includes(agreement), 'Assumption must name a selected agreement');
        const reason = text(row.reason, 'Assumption reason');
        if (!row.order) {
            requireThat(row.proposedMinor == null && row.proposedCommitmentMinor == null, 'Unlinked agreements have unknown forecast amounts');
            return { agreement, order: null, proposedMinor: null, proposedCommitmentMinor: null, expectedDate: null, reason };
        }
        const expectedDate = date(row.expectedDate, 'Proposed forecast date');
        requireThat(expectedDate >= from && expectedDate <= to, 'Proposed forecast date must fall inside the scenario');
        return { agreement, order: text(row.order, 'Assumption PO', 200), proposedMinor: minor(row.proposedMinor, 'Proposed cash forecast'),
            proposedCommitmentMinor: minor(row.proposedCommitmentMinor, 'Proposed outstanding commitment'), expectedDate, reason };
    }).sort((a: Data, b: Data) => a.agreement.localeCompare(b.agreement) || String(a.order).localeCompare(String(b.order)));
    requireThat(agreementIds.every((id: string) => assumptions.some((row: Data) => row.agreement === id)), 'Every affected agreement needs an explicit assumption');
    const orderIds = assumptions.filter((row: Data) => row.order).map((row: Data) => row.order);
    requireThat(new Set(orderIds).size === orderIds.length, 'A PO forecast can only be changed once');
    requireThat(agreementIds.every((id: string) => !assumptions.some((r: Data) => r.agreement === id && !r.order) || assumptions.filter((r: Data) => r.agreement === id).length === 1), 'Unknown forecast cannot accompany a linked forecast');
    requireThat(input.evidence === undefined || Array.isArray(input.evidence) && input.evidence.length <= 100, 'Choose at most 100 explicit evidence records');
    const evidence = (input.evidence ?? []).map((row: Data) => {
        requireThat(Object.hasOwn(evidenceFields, row.kind), 'Choose supported native usage or service evidence');
        return { kind: row.kind, id: text(row.id, 'Evidence ID', 200) };
    }).sort((a: Data, b: Data) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    requireThat(new Set(evidence.map((r: Data) => r.kind + ':' + r.id)).size === evidence.length, 'Choose each evidence record once');
    return { kind: input.kind, agreementIds, from, to, reason: text(input.reason, 'Scenario reason'), operationalRisk: text(input.operationalRisk, 'Operational risk and mitigation'), assumptions, evidence };
}

function source(s: State, kind: string, id: string, value: Data): Data {
    const row = s.get(kind + ':' + id);
    requireThat(row && !row.value.imported, 'Scenario sources must be current native records', 409);
    return { kind, id, revision: row.revision, value };
}

function snapshot(s: State, a: Actor, input: Data) {
    requirePermission(s, a, 'cash.read');
    const agreements = input.agreementIds.map((id: string) => get(s, 'agreement', id));
    const currencies = new Set(agreements.map((r: Data) => r.currency));
    requireThat(currencies.size === 1, 'Scenario agreements must use one currency');
    const currency = agreements[0].currency, sources: Data[] = [];
    for (const agreement of agreements) {
        if (!a.owner && !unrestrictedPermission(s, a, 'procurement.manage')) {
            const permitted = performanceAgreementSources(s, a).versions.get(agreement.id);
            requireThat(permitted?.has(agreement.version) && (agreement.history ?? []).every((r: Data) => permitted.has(r.version)),
                'Every cited agreement price revision must be inside current performance scope', 403);
        }
        sources.push(source(s, 'agreement', agreement.id, { ...pick(agreement, 'version,name,reference,supplier,currency,valueMinor,firstOfferMinor,startDate,endDate,autoRenew,noticeDays,noticeDeadline,owner'),
            priceHistory: (agreement.history ?? []).map((h: Data) => ({ ...pick(h, 'version,valueMinor,firstOfferMinor,startDate,endDate,noticeDays,noticeDeadline,at'),
                priceLines: (h.priceLines ?? []).map((l: Data) => pick(l, 'description,quantity,q,unit,partNumber,firstUnitMinor,awardedUnitMinor')) })) }));
    }
    const families = new Set(agreements.map((r: Data) => canonicalSupplier(s, r.supplier)));
    for (const supplier of all(s, 'supplier').filter(r => families.has(canonicalSupplier(s, r.id))))
        sources.push(source(s, 'supplier', supplier.id, pick(supplier, 'name,mergedInto')));
    const selectedOrders = input.assumptions.filter((r: Data) => r.order).map((r: Data) => get(s, 'order', r.order));
    const requests = new Set<string>(selectedOrders.map((r: Data) => r.request));
    requireThat(requests.size === selectedOrders.length, 'Use one current issued PO per request lineage');
    const lineage = all(s, 'order').filter(o => requests.has(o.request));
    const lineageIds = new Set(lineage.map(o => o.id));
    for (const order of selectedOrders) {
        const assumption = input.assumptions.find((r: Data) => r.order === order.id);
        const agreement = agreements.find((r: Data) => r.id === assumption.agreement);
        requireThat(order.issuedAt && !order.imported && order.currency === currency && canonicalSupplier(s, order.supplier) === canonicalSupplier(s, agreement.supplier), 'Use a native issued PO in the agreement supplier family and currency', 409);
        const series = all(s, 'recurringSeries').filter(r => r.agreement === agreement.id && (r.order === order.id || r.request === order.request || r.id === order.recurring?.series));
        requireThat(series.length > 0, 'PO needs an explicit recurring-series agreement link', 409);
        for (const row of series) sources.push(source(s, 'recurringSeries', row.id, pick(row, 'order,request,agreement,status,version,nextDate,endDate,maxOrders,generatedCount')));
    }
    for (const order of lineage) {
        requirePermission(s, a, 'cash.read', order); requirePermission(s, a, 'performance.read', order);
        sources.push(source(s, 'order', order.id, { ...pick(order, 'request,revision,status,currency,totalMinor,issuedAt,needDate'),
            lines: order.lines.map((l: Data) => pick(l, 'id,q,unitMinor,totalMinor')) }));
    }
    for (const requestId of requests) {
        const request = get(s, 'request', requestId);
        requirePermission(s, a, 'request.read', request);
        sources.push(source(s, 'request', requestId, pick(request, 'revision,status,valuePromise')));
    }
    for (const row of all(s, 'commitment').filter(r => requests.has(r.request)))
        sources.push(source(s, 'commitment', row.id, pick(row, 'request,revision,currency,amountMinor,event,at')));
    for (const invoice of all(s, 'invoice').filter(r => lineageIds.has(r.order))) {
        requirePermission(s, a, 'invoice.read', invoice); requirePermission(s, a, 'cash.read', invoice);
        sources.push(source(s, 'invoice', invoice.id, pick(invoice, 'order,currency,totalMinor')));
        for (const payable of all(s, 'payable').filter(r => r.invoice === invoice.id))
            sources.push(source(s, 'payable', payable.id, pick(payable, 'invoice,version,approvedAt,approvedMinor,dueDate')));
    }
    for (const ref of input.evidence) {
        const row = get(s, ref.kind, ref.id), order = row.order ? get(s, 'order', row.order) : null;
        const requestId = row.request ?? order?.request;
        requireThat(requests.has(requestId), 'Evidence must belong to a selected native PO request', 403);
        requirePermission(s, a, 'performance.read', get(s, 'request', requestId));
        sources.push(source(s, ref.kind, ref.id, pick(row, evidenceFields[ref.kind])));
    }
    const cash = cashRequirements(s, a);
    const bills = cash.bills.filter((r: Data) => lineageIds.has(r.order) && r.currency === currency && r.dueDate >= input.from && r.dueDate <= input.to)
        .map((r: Data) => pick(r, 'invoice,order,amountMinor,dueDate,week'));
    const forecast = input.assumptions.filter((r: Data) => r.order).map((assumption: Data) => {
        const row = cash.commitments.find((r: Data) => r.order === assumption.order && r.currency === currency);
        requireThat(row && row.expectedDate >= input.from && row.expectedDate <= input.to, 'Selected PO must have an outstanding forecast inside the scenario period', 409);
        return { agreement: assumption.agreement, ...pick(row, 'order,amountMinor,expectedDate,week,basis') };
    });
    const commitmentRows = [...requests].map(request => ({ request, amountMinor: total(all(s, 'commitment').filter(r => r.request === request && r.currency === currency).map(r => r.amountMinor)) }));
    requireThat(commitmentRows.every(row => row.amountMinor >= 0), 'Commitment ledger is not supported by this scenario', 409);
    const billMinor = total(bills.map((r: Data) => r.amountMinor)), forecastMinor = total(forecast.map((r: Data) => r.amountMinor));
    const proposedForecastMinor = total(input.assumptions.filter((r: Data) => r.order).map((r: Data) => r.proposedMinor));
    const committedMinor = total(commitmentRows.map(row => row.amountMinor));
    const proposedCommitmentMinor = total(input.assumptions.filter((r: Data) => r.order).map((r: Data) => r.proposedCommitmentMinor));
    const unique = [...new Map(sources.map(row => [row.kind + ':' + row.id, row])).values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    const overlaps: Data[] = [];
    for (let left = 0; left < agreements.length; left++) for (let right = left + 1; right < agreements.length; right++) {
        const first = agreements[left], second = agreements[right];
        const start = [first.startDate, second.startDate, input.from].sort().at(-1)!;
        const end = [first.endDate, second.endDate, input.to].sort()[0];
        if (start <= end) overlaps.push({ agreements: [first.id, second.id], from: start, to: end,
            sameSupplierFamily: canonicalSupplier(s, first.supplier) === canonicalSupplier(s, second.supplier),
            basis: 'Calendar overlap only; functional overlap is the human scenario assumption' });
    }
    return { currency, sources: unique, overlaps, agreements: agreements.map((r: Data) => ({ id: r.id, owner: r.owner, noticeDeadline: r.noticeDeadline,
        noticeDueInPeriod: r.noticeDeadline >= input.from && r.noticeDeadline <= input.to, noticeBeforeScenario: r.noticeDeadline < input.from })),
        baseline: { bills, forecast, commitmentRows, billsMinor: billMinor, forecastMinor, commitmentsMinor: committedMinor, cashMinor: total([billMinor, forecastMinor]) },
        proposed: { billsMinor: billMinor, forecastMinor: proposedForecastMinor, commitmentsMinor: proposedCommitmentMinor, cashMinor: total([billMinor, proposedForecastMinor]) },
        effect: { cashMinor: proposedForecastMinor - forecastMinor, commitmentsMinor: proposedCommitmentMinor - committedMinor },
        unknownForecastAgreements: input.assumptions.filter((r: Data) => !r.order).map((r: Data) => r.agreement),
        basis: 'Hypothetical scenario on selected native issued PO obligations; approved bills unchanged; future unissued renewals unknown; never realized savings' };
}

function consentAuthority(s: State, a: Actor, scenario: Data, role: string, agreementId?: string) {
    if (role === 'owner') {
        const agreement = get(s, 'agreement', agreementId!);
        requireThat(scenario.choices.agreementIds.includes(agreement.id) && a.owner && a.id === agreement.owner, 'Exact current native agreement owner required', 403);
        return;
    }
    requireThat(role === 'finance' && !scenario.snapshot.agreements.some((r: Data) => r.owner === a.id), 'Finance consent must be independent of affected agreement owners', 403);
    const grants = accessGrants(s, a);
    requireThat(!grants.some(g => g.role === 'auditor') && allowed(s, a, 'payable.approve') && allowed(s, a, 'cash.read'), 'Current finance approval capability required', 403);
    for (const assumption of scenario.choices.assumptions.filter((r: Data) => r.order)) {
        const order = get(s, 'order', assumption.order);
        requirePermission(s, a, 'payable.approve', order); requirePermission(s, a, 'cash.read', order);
    }
}

function proofs(consents: Data[]) { return consents.map(c => ({ actor: c.actor, operatorVersion: c.operatorVersion, owner: c.nativeOwner })); }

export async function recurringScenarios(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!ops.includes(op)) return;
    rejectProtectedInput(b);
    if (op === 'recurring-scenario-prepare') {
        requireThat(a.owner, 'Current native owner required to prepare scenarios', 403);
        const input = choices(b), captured = snapshot(s, a, input);
        const hash = await valueDigest(canonicalValue({ choices: input, snapshot: captured })), id = uid();
        const row = { choices: input, snapshot: captured, hash, mode: 'deterministic v1', model: 'none', provider: 'none',
            label: 'Scenario — not realized savings', preparedBy: a.id, at: new Date().toISOString(), status: 'proposed' };
        put(s, 'recurringScenario', id, row);
        audit(s, a, op, id, { hash, agreements: input.agreementIds });
        return { id, ...row };
    }
    const scenario = get(s, 'recurringScenario', b.id);
    requireThat(b.hash === scenario.hash, 'Approve the exact scenario hash', 409);
    const fresh = snapshot(s, a, scenario.choices);
    requireThat(await valueDigest(canonicalValue({ choices: scenario.choices, snapshot: fresh })) === scenario.hash, 'Scenario sources changed; prepare a new scenario', 409);
    if (op === 'recurring-scenario-approve') {
        consentAuthority(s, a, scenario, b.role, b.agreement);
        requireThat(b.confirmed === true, 'Explicit approval of this scenario is required');
        const agreement = b.role === 'owner' ? b.agreement : null;
        const id = scenario.id + ':' + b.role + ':' + (agreement ?? 'finance');
        requireThat(!s.has('recurringScenarioConsent:' + id), 'This scenario consent is already recorded', 409);
        const row = { scenario: scenario.id, hash: scenario.hash, role: b.role, agreement, actor: a.id, email: a.email,
            nativeOwner: a.owner, operatorVersion: a.version, reason: text(b.reason, 'Approval reason'), at: new Date().toISOString() };
        put(s, 'recurringScenarioConsent', id, row); audit(s, a, op, scenario.id, { hash: scenario.hash, consent: id, role: row.role, agreement });
        return { id: scenario.id, hash: scenario.hash, status: 'consent-recorded', authorityProofs: proofs([row]) };
    }
    requireThat(a.owner, 'Current native owner required to draft a nonbinding brief', 403);
    requireThat(!s.has('recurringScenarioDraft:' + scenario.id), 'A brief for this scenario already exists', 409);
    const consents = all(s, 'recurringScenarioConsent').filter(c => c.scenario === scenario.id && c.hash === scenario.hash);
    requireThat(consents.some(c => c.role === 'finance') && scenario.choices.agreementIds.every((id: string) => consents.some(c => c.role === 'owner' && c.agreement === id)), 'Independent finance and every affected agreement owner must approve this hash', 409);
    for (const consent of consents) consentAuthority(s, { id: consent.actor, email: consent.email, owner: consent.nativeOwner,
        version: consent.operatorVersion, session: '', dev: false }, scenario, consent.role, consent.agreement);
    const row = { scenario: scenario.id, hash: scenario.hash, kind: scenario.choices.kind === 'cancel' ? 'cancellation-brief' : 'negotiation-brief',
        binding: false, sent: false, actor: a.id, at: new Date().toISOString(), authorityProofs: proofs(consents),
        text: ['NONBINDING DRAFT — human review and separate sending required.', `Scenario ${scenario.hash}`, `Action: ${scenario.choices.kind}`,
            ...fresh.agreements.map((r: Data) => `Agreement ${r.id}: notice deadline ${r.noticeDeadline}.`),
            `Assumption reason: ${scenario.choices.reason}`, `Operational risk: ${scenario.choices.operationalRisk}`,
            `Hypothetical cash change: ${fresh.effect.cashMinor} ${fresh.currency} minor units. Unknown forecasts: ${fresh.unknownForecastAgreements.join(', ') || 'none'}.`,
            'No commitment, forecast, agreement, purchase order, supplier communication or cancellation has been changed.'].join('\n') };
    put(s, 'recurringScenarioDraft', scenario.id, row); audit(s, a, op, scenario.id, { hash: scenario.hash, kind: row.kind });
    return { id: scenario.id, ...row };
}

/** Finance reads the exact immutable scenario only while every cited source is
 * still current and readable. Consent reasons and private owner drafts stay out.
 */
export function projectRecurringScenario(s: State, a: Actor, scenario: Data): Data {
    requireThat(s.has('recurringScenario:' + scenario.id), 'Scenario not found', 404);
    const stored = get(s, 'recurringScenario', scenario.id);
    rejectProtectedInput(stored);
    if (!a.owner) {
        consentAuthority(s, a, stored, 'finance');
        requirePermission(s, a, 'performance.read'); requirePermission(s, a, 'request.read');
        const fresh = snapshot(s, a, stored.choices);
        requireThat(canonicalValue(fresh) === canonicalValue(stored.snapshot), 'Scenario sources changed; prepare a new scenario', 409);
    }
    return pick(stored, 'id,choices,snapshot,hash,mode,model,provider,label,preparedBy,at,status');
}

export function visibleRecurringScenarios(s: State, a: Actor): Data {
    const recurringScenario = all(s, 'recurringScenario').flatMap(row => {
        try { return [projectRecurringScenario(s, a, row)]; } catch { return []; }
    });
    if (!a.owner) return { recurringScenario, recurringScenarioConsent: [], recurringScenarioDraft: [] };
    return { recurringScenario,
        recurringScenarioConsent: all(s, 'recurringScenarioConsent').map(r => pick(r, 'id,scenario,hash,role,agreement,actor,operatorVersion,at')),
        recurringScenarioDraft: all(s, 'recurringScenarioDraft') };
}
