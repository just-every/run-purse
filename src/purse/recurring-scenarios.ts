import {canReadRecurringDiscoveryProposal} from './recurring-opportunities';
import {recordedRenewalForecast, recurringDraftText} from './recurring-forecast.mjs';
import {assignedAgreementOwner,scenarioBudgetOwners,scenarioConsentAuthority,scenarioApprovals} from './recurring-scenario-authority';
import { purchaseTypes, requireAgentPolicies } from './agent-governance';
import { cashRequirements, cashRequirementsFromRecords } from './cash-requirements';
import { canonicalValue, valueDigest } from './agent-value-evidence';
import { canonicalSupplier } from './supplier-identity';
import { rejectProtectedInput } from './protected-input';
import { unrestrictedPermission } from './access-records';
import { performanceAgreementSources } from './access-agreement-sources';
import { linePosition } from './orders';
import { orderAdoption } from './adoption-position';
import { allowed, all, audit, date, get, minor, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

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
    requireThat(input.renewalAssumptions===undefined || Array.isArray(input.renewalAssumptions)&&input.renewalAssumptions.length<=20,'Choose at most 20 renewal assumptions');
    const renewalAssumptions=(input.renewalAssumptions??[]).map((r:Data)=>{requireThat(agreementIds.includes(r.agreement),'Renewal assumption must name a selected agreement');return {agreement:r.agreement,proposedMinor:minor(r.proposedMinor,'Proposed recorded-term forecast'),reason:text(r.reason,'Renewal assumption reason')};}).sort((a:Data,b:Data)=>a.agreement.localeCompare(b.agreement));
    requireThat(new Set(renewalAssumptions.map((r:Data)=>r.agreement)).size===renewalAssumptions.length,'Choose each renewal once');
    return { kind: input.kind, agreementIds, from, to, renewalAssumptions, reason: text(input.reason, 'Scenario reason'), operationalRisk: text(input.operationalRisk, 'Operational risk and mitigation'), assumptions, evidence };
}

function source(s: State, kind: string, id: string, value: Data): Data {
    const row = s.get(kind + ':' + id);
    requireThat(row && !row.value.imported, 'Scenario sources must be current native records', 409);
    return { kind, id, revision: row.revision, value };
}

function snapshot(s: State, a: Actor, input: Data, checkScope=true) {
    if(checkScope) requirePermission(s, a, 'cash.read');
    const agreements = input.agreementIds.map((id: string) => get(s, 'agreement', id));
    const currencies = new Set(agreements.map((r: Data) => r.currency));
    requireThat(currencies.size === 1, 'Scenario agreements must use one currency');
    const currency = agreements[0].currency, sources: Data[] = [];
    for (const agreement of agreements) {
        if (checkScope && !a.owner && !unrestrictedPermission(s, a, 'procurement.manage') && !assignedAgreementOwner(s,a,agreement)) {
            const permitted = performanceAgreementSources(s, a).versions.get(agreement.id);
            requireThat(permitted?.has(agreement.version) && (agreement.history ?? []).every((r: Data) => permitted.has(r.version)),
                'Every cited agreement price revision must be inside current performance scope', 403);
        }
        sources.push(source(s, 'agreement', agreement.id, { ...pick(agreement, 'version,name,reference,supplier,currency,valueMinor,firstOfferMinor,startDate,endDate,autoRenew,noticeDays,noticeDeadline,owner,ownerEmail,renewalTermMonths,renewalIncreaseCapBps,paymentTerms'),
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
        requireThat(!orderAdoption(s, order), 'Adopted purchase lineages are outside this native scenario', 409);
        if(checkScope){requirePermission(s, a, 'cash.read', order); requirePermission(s, a, 'performance.read', order);}
        sources.push(source(s, 'order', order.id, { ...pick(order, 'number,request,revision,status,currency,totalMinor,issuedAt,needDate,supplier,amendedBy'),
            lines: order.lines.map((l: Data) => ({ ...pick(l, 'id,q,unitMinor,totalMinor,carriedAccepted,carriedCancelled,carriedAcceptedMinor,carriedCancelledMinor'),
                ...(l.service ? { service: pick(l.service, 'mode') } : {}), position: linePosition(s, order.id, l) })) }));
    }
    for (const row of all(s, 'receipt').filter(r => lineageIds.has(r.order)))
        sources.push(source(s, 'receipt', row.id, pick(row, evidenceFields.receipt)));
    for (const row of all(s, 'orderClosure').filter(r => lineageIds.has(r.order)))
        sources.push(source(s, 'orderClosure', row.id, { ...pick(row, 'order,active'), lines: row.lines.map((l: Data) => pick(l, 'line,q')) }));
    for (const row of all(s, 'cashExpectation').filter(r => lineageIds.has(r.order)))
        sources.push(source(s, 'cashExpectation', row.id, pick(row, 'order,version,expectedDate')));
    for (const requestId of requests) {
        const request = get(s, 'request', requestId);
        if(checkScope)requirePermission(s, a, 'request.read', request);
        sources.push(source(s, 'request', requestId, pick(request, 'title,revision,status,valuePromise,policy')));
    }
    for (const row of all(s, 'commitment').filter(r => requests.has(r.request)))
        sources.push(source(s, 'commitment', row.id, pick(row, 'request,revision,currency,amountMinor,event,at,policy,budgetAllocations')));
    for (const invoice of all(s, 'invoice').filter(r => lineageIds.has(r.order))) {
        if(checkScope){requirePermission(s, a, 'invoice.read', invoice); requirePermission(s, a, 'cash.read', invoice);}
        sources.push(source(s, 'invoice', invoice.id, { ...pick(invoice, 'reference,order,currency,totalMinor'), hasSourcePayment: Boolean(invoice.sourcePayment),
            flags: (invoice.flags ?? []).map((r: Data) => pick(r, 'id,code')), riskReviews: (invoice.riskReviews ?? []).map((r: Data) => pick(r, 'flag')),
            allocations: (invoice.allocations ?? []).map((r: Data) => pick(r, 'line,q,amountMinor')),
            ...(invoice.pantry ? { pantry: pick(invoice.pantry, 'status,openMinor,dueDate,discountDate') } : {}) }));
        for (const payable of all(s, 'payable').filter(r => r.invoice === invoice.id))
            sources.push(source(s, 'payable', payable.id, pick(payable, 'invoice,version,approvedAt,approvedMinor,invoiceDate,term,dueDate,discountDate,discountPercent')));
    }
    for (const ref of input.evidence) {
        const row = get(s, ref.kind, ref.id), order = row.order ? get(s, 'order', row.order) : null;
        const requestId = row.request ?? order?.request;
        requireThat(requests.has(requestId), 'Evidence must belong to a selected native PO request', 403);
        if(checkScope)requirePermission(s, a, 'performance.read', get(s, 'request', requestId));
        sources.push(source(s, ref.kind, ref.id, pick(row, evidenceFields[ref.kind])));
    }
    const cash = checkScope?cashRequirements(s,a):cashRequirementsFromRecords(s,record=>lineageIds.has(record.order??record.id));
    const bills = cash.bills.filter((r: Data) => lineageIds.has(r.order) && r.currency === currency && r.dueDate >= input.from && r.dueDate <= input.to)
        .map((r: Data) => pick(r, 'invoice,order,amountMinor,dueDate,week'));
    const forecast = input.assumptions.filter((r: Data) => r.order).map((assumption: Data) => {
        const row = cash.commitments.find((r: Data) => r.order === assumption.order && r.currency === currency);
        requireThat(row && row.expectedDate >= input.from && row.expectedDate <= input.to, 'Selected PO must have an outstanding forecast inside the scenario period', 409);
        const order = get(s, 'order', row.order), baseMinor = total(order.lines.map((l: Data) => l.totalMinor));
        const activeLineMinor = total(order.lines.map((l: Data) => { const p = linePosition(s, order.id, l);
            return Number((BigInt(Math.max(0, l.q - p.cancelled - p.closed)) * BigInt(l.unitMinor) + 500n) / 1000n); }));
        const liabilityMinor = baseMinor ? Number((BigInt(order.totalMinor) * BigInt(activeLineMinor) + BigInt(baseMinor) / 2n) / BigInt(baseMinor)) : 0;
        const approvedBilledMinor = total(all(s, 'payable').filter(p => p.approvedAt).filter(p => {
            const invoice = get(s, 'invoice', p.invoice), invoiceOrder = get(s, 'order', invoice.order);
            return invoiceOrder.request === order.request && invoiceOrder.issuedAt && invoice.currency === currency && !(invoice.flags ?? []).some((flag: Data) => !(invoice.riskReviews ?? []).some((review: Data) => review.flag === flag.id));
        }).map(p => p.approvedMinor));
        requireThat(row.amountMinor === Math.max(0, liabilityMinor - approvedBilledMinor), 'Native forecast arithmetic changed; prepare with supported source inputs', 409);
        return { agreement: assumption.agreement, ...pick(row, 'order,amountMinor,expectedDate,week,basis'),
            calculation: { baseMinor, activeLineMinor, liabilityMinor, approvedBilledMinor, depositMinor: 0 } };
    });
    const commitmentRows = [...requests].map(request => ({ request, amountMinor: total(all(s, 'commitment').filter(r => r.request === request && r.currency === currency).map(r => r.amountMinor)) }));
    requireThat(commitmentRows.every(row => row.amountMinor >= 0), 'Commitment ledger is not supported by this scenario', 409);
    const billMinor = total(bills.map((r: Data) => r.amountMinor)), forecastMinor = total(forecast.map((r: Data) => r.amountMinor));
    const proposedForecastMinor = total(input.assumptions.filter((r: Data) => r.order).map((r: Data) => r.proposedMinor));
    const committedMinor = total(commitmentRows.map(row => row.amountMinor));
    const proposedCommitmentMinor = total(input.assumptions.filter((r: Data) => r.order).map((r: Data) => r.proposedCommitmentMinor));
    const budgetOwners=scenarioBudgetOwners(s,input,commitmentRows);
    for(const row of budgetOwners) {const policy=get(s,'policy',row.policy);sources.push(source(s,'policy',policy.id,pick(policy,'name,approver,budgetOwner,active')));}
    const recordedForecast=recordedRenewalForecast(agreements,input.from,input.to,input.renewalAssumptions??[]);
    requireThat(!(input.renewalAssumptions??[]).some((r:Data)=>recordedForecast.unknownAgreementIds.includes(r.agreement)),'Unknown recorded terms cannot support a numeric forecast');
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
    return { currency, sources: unique, overlaps, recordedForecast, budgetOwners, agreements: agreements.map((r: Data) => ({ id: r.id, owner: r.owner, noticeDeadline: r.noticeDeadline,
        noticeDueInPeriod: r.noticeDeadline >= input.from && r.noticeDeadline <= input.to, noticeBeforeScenario: r.noticeDeadline < input.from })),
        baseline: { bills, forecast, commitmentRows, billsMinor: billMinor, forecastMinor, commitmentsMinor: committedMinor, cashMinor: total([billMinor, forecastMinor]) },
        proposed: { billsMinor: billMinor, forecastMinor: proposedForecastMinor, commitmentsMinor: proposedCommitmentMinor, cashMinor: total([billMinor, proposedForecastMinor]) },
        effect: { cashMinor: proposedForecastMinor - forecastMinor, commitmentsMinor: proposedCommitmentMinor - committedMinor },
        unknownForecastAgreements: recordedForecast.unknownAgreementIds,
        basis: 'Hypothetical scenario on selected native issued PO obligations; approved bills unchanged; renewals forecast separately from recorded terms; never realized savings' };
}

function generationAuthority(s: State, captured: Data) {
    const types = captured.sources.filter((row: Data) => row.kind === 'order').flatMap((row: Data) => purchaseTypes(get(s, 'order', row.id)));
    requireAgentPolicies(s, 'AGENT-006', types.length ? [...new Set<string>(types)] : ['*']);
}

function proofs(consents: Data[]) { return consents.map(c => ({ actor: c.actor, operatorVersion: c.operatorVersion, owner: c.nativeOwner })); }

export async function recurringScenarios(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!ops.includes(op)) return;
    rejectProtectedInput(b);
    if (op === 'recurring-scenario-prepare') {
        requireThat(a.owner||allowed(s,a,'procurement.manage')||allowed(s,a,'payable.approve'),'Procurement or finance preparation capability required',403);
        const input = choices(b), captured = snapshot(s, a, input);
        generationAuthority(s, captured);
        const hash = await valueDigest(canonicalValue({ choices: input, snapshot: captured })), id = uid();
        const row = { choices: input, snapshot: captured, hash, mode: 'deterministic v1', model: 'none', provider: 'none',
            label: 'Scenario — not realized savings', preparedBy: a.id, at: new Date().toISOString(), status: 'proposed' };
        put(s, 'recurringScenario', id, row);
        audit(s, a, op, id, { hash, agreements: input.agreementIds });
        return { id, ...row };
    }
    const scenario = get(s, 'recurringScenario', b.id);
    requireThat(b.hash === scenario.hash, 'Approve the exact scenario hash', 409);
    if(op==='recurring-scenario-approve')scenarioConsentAuthority(s,a,scenario,b.role,b.agreement,b.policy);
    else requireThat(a.owner,'Current native owner required to draft a nonbinding brief',403);
    const fresh = snapshot(s, a, scenario.choices, op!=='recurring-scenario-approve'||b.role==='finance');
    requireThat(await valueDigest(canonicalValue({ choices: scenario.choices, snapshot: fresh })) === scenario.hash, 'Scenario sources changed; prepare a new scenario', 409);
    if (op === 'recurring-scenario-approve') {
        requireThat(b.confirmed === true, 'Explicit approval of this scenario is required');
        const agreement = b.role === 'owner' ? b.agreement : null, policy=b.role==='budget'?b.policy:null;
        const id = scenario.id + ':' + b.role + ':' + (agreement ?? policy ?? 'finance');
        requireThat(!s.has('recurringScenarioConsent:' + id), 'This scenario consent is already recorded', 409);
        const row = { scenario: scenario.id, hash: scenario.hash, role: b.role, agreement, policy, actor: a.id, email: a.email,
            nativeOwner: a.owner, operatorVersion: a.version, reason: text(b.reason, 'Approval reason'), at: new Date().toISOString() };
        put(s, 'recurringScenarioConsent', id, row); audit(s, a, op, scenario.id, { hash: scenario.hash, consent: id, role: row.role, agreement, policy });
        return { id: scenario.id, hash: scenario.hash, status: 'consent-recorded', authorityProofs: proofs([row]) };
    }
    requireThat(a.owner, 'Current native owner required to draft a nonbinding brief', 403);
    generationAuthority(s, fresh);
    requireThat(!s.has('recurringScenarioDraft:' + scenario.id), 'A brief for this scenario already exists', 409);
    const consents = scenarioApprovals(s,scenario);
    const draftText=recurringDraftText(scenario);
    const row = { scenario: scenario.id, hash: scenario.hash, draftHash:await valueDigest(draftText), kind: scenario.choices.kind === 'cancel' ? 'cancellation-brief' : 'negotiation-brief',
        binding: false, sent: false, actor: a.id, at: new Date().toISOString(), authorityProofs: proofs(consents),text:draftText };
    put(s, 'recurringScenarioDraft', scenario.id, row); audit(s, a, op, scenario.id, { hash: scenario.hash, kind: row.kind });
    return { id: scenario.id, ...row };
}

export async function currentRecurringScenario(s:State,a:Actor,b:Data) {
    requireThat(a.owner,'Current native owner required',403);
    const scenario=get(s,'recurringScenario',b.id);
    requireThat(b.hash===scenario.hash,'Use the exact scenario hash',409);
    const fresh=snapshot(s,a,scenario.choices);
    requireThat(await valueDigest(canonicalValue({choices:scenario.choices,snapshot:fresh}))===scenario.hash,'Scenario sources changed; prepare a new scenario',409);
    generationAuthority(s,fresh);
    return {scenario,consents:scenarioApprovals(s,scenario)};
}

/** Finance reads the exact immutable scenario only while every cited source is
 * still current and readable. Private consent reasons stay out.
 */
export function projectRecurringScenario(s: State, a: Actor, scenario: Data): Data {
    requireThat(s.has('recurringScenario:' + scenario.id), 'Scenario not found', 404);
    const stored = get(s, 'recurringScenario', scenario.id);
    rejectProtectedInput(stored);
    const agreementOwner=stored.choices.agreementIds.some((id:string)=>assignedAgreementOwner(s,a,get(s,'agreement',id)));
    const budgetOwner=(stored.snapshot.budgetOwners??[]).some((r:Data)=>{try{scenarioConsentAuthority(s,a,stored,'budget',undefined,r.policy);return true;}catch{return false;}});
    if (!a.owner && !agreementOwner && !budgetOwner) {
        scenarioConsentAuthority(s,a,stored,'finance');
        requirePermission(s,a,'performance.read');requirePermission(s,a,'request.read');
        const fresh=snapshot(s,a,stored.choices);
        requireThat(canonicalValue(fresh)===canonicalValue(stored.snapshot),'Scenario sources changed; prepare a new scenario',409);
    }
    const canConsent=(role:string,agreement?:string,policy?:string)=>{try{scenarioConsentAuthority(s,a,stored,role,agreement,policy);return true;}catch{return false;}};
    return {...pick(stored,'id,choices,snapshot,hash,mode,model,provider,label,preparedBy,at,status'),
        mayApproveFinance:canConsent('finance'),mayApproveAgreements:stored.choices.agreementIds.filter((id:string)=>canConsent('owner',id)),
        mayApproveBudgets:[...new Set<string>((stored.snapshot.budgetOwners??[]).filter((r:Data)=>canConsent('budget',undefined,r.policy)).map((r:Data)=>r.policy))],mayDraft:a.owner,maySend:a.owner};

}

export function visibleRecurringScenarios(s: State, a: Actor): Data {
    const recurringScenario = all(s, 'recurringScenario').flatMap(row => {
        try { return [projectRecurringScenario(s, a, row)]; } catch { return []; }
    });
    const ids=new Set(recurringScenario.map(r=>r.id));
    return { recurringScenario, mayPrepareRecurring:a.owner||allowed(s,a,'procurement.manage')||allowed(s,a,'payable.approve')&&allowed(s,a,'cash.read'),
        recurringNoticeSend:all(s,'recurringNoticeSend').filter(r=>ids.has(r.scenario)).map(r=>pick(r,'id,scenario,hash,draftHash,recipient,status,at,outcomeAt,noticeDeadlines,deliveryVisibility,noticeEffectiveness,erasure')),
        agreementDisposition:all(s,'agreementDisposition').filter(r=>ids.has(r.scenario)),
        recurringDiscoveryNotice:all(s,'recurringDiscoveryNotice').filter(r=>r.recipient===a.id&&r.recipientEmail?.toLowerCase()===a.email.toLowerCase()).flatMap(notice=>{
            const proposal=s.get('agentRun:'+notice.run)?.value.proposals?.find((r:Data)=>r.id===notice.proposal);
            const owned=notice.role==='owner'&&notice.agreementIds.every((id:string)=>assignedAgreementOwner(s,a,get(s,'agreement',id)));
            if(!proposal||!owned&&!canReadRecurringDiscoveryProposal(s,a,proposal))return [];
            return [{...notice,proposalSummary:{kind:proposal.kind,reason:proposal.reason,operationalRisk:proposal.operationalRisk,baseline:proposal.baseline}}];
        }),
        recurringScenarioConsent: all(s, 'recurringScenarioConsent').filter(r=>ids.has(r.scenario)).map(r => pick(r, 'id,scenario,hash,role,agreement,policy,actor,operatorVersion,at')),
        recurringScenarioDraft: all(s, 'recurringScenarioDraft').filter(r=>ids.has(r.scenario)) };
}
