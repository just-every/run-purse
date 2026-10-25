import { allowed, requirePermission } from './access';
import { catalogueAllows } from './catalogue-access';
import { currentPrice } from './catalogue';
import { purchaseTypes, requireAgentPolicies } from './agent-governance';
import { budgetScopeMatches, budgetCoding } from './budget-dimensions';
import { rejectProtectedInput } from './protected-input';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const fields = ['glAccount', 'class', 'costCentre', 'project'] as const;
const mode = 'deterministic v1';
const reference = (s: State, kind: string, id: string) => ({ kind, id, version: s.get(kind + ':' + id)!.revision });
const coding = (value: Data): Data => Object.fromEntries(fields.filter(field => typeof value[field] === 'string' && value[field].trim()).map(field => [field, value[field]]));
const itemKey = (line: Data) => String(line.catalogue || line.partNumber || line.description).trim().toLowerCase().replace(/\s+/g, ' ');
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');

function target(s: State, kind: string, id: string) {
    requireThat(['request', 'invoice'].includes(kind), 'Choose a request or invoice');
    const value = get(s, kind, id), order = kind === 'invoice' ? get(s, 'order', value.order) : undefined;
    const request = order ? get(s, 'request', order.request) : value;
    const terms = order ? get(s, 'revision', order.request + ':' + order.revision) : request;
    const lines = order ? order.lines.filter((line: Data) => value.allocations.some((allocation: Data) => allocation.line === line.id)) : value.lines;
    return { kind, value, request, terms, order, lines };
}
function canRead(s: State, a: Actor, subject: ReturnType<typeof target>) {
    return allowed(s, a, subject.kind === 'invoice' ? 'invoice.read' : 'request.read', subject.value)
        && allowed(s, a, 'request.read', subject.terms);
}
function canPrepare(s: State, a: Actor, subject: ReturnType<typeof target>) {
    requireThat(canRead(s, a, subject), 'Coding source outside your scope', 403);
    if (subject.kind === 'invoice') requirePermission(s, a, 'invoice.capture', subject.value);
    else requireThat(allowed(s, a, 'request.edit', subject.request) || allowed(s, a, 'request.approve', subject.request), 'Current requester or approver authority required', 403);
}
function safeTarget(subject: ReturnType<typeof target>) {
    return { kind: subject.kind, id: subject.value.id, request: subject.request.id, revision: subject.terms.revision,
        supplier: subject.order?.supplier ?? subject.request.supplier, requester: subject.terms.requester, currency: subject.value.currency,
        totalMinor: subject.value.totalMinor, coding: coding(subject.terms), lines: subject.lines.map((line: Data) => ({
            id: line.id, item: itemKey(line), description: line.description, category: line.category, ...coding({ ...subject.terms, ...line }) })) };
}
function permittedReference(s: State, a: Actor, ref: Data): boolean {
    const row = s.get(ref.kind + ':' + ref.id)?.value;
    if (!row) return false;
    if (ref.kind === 'agentPolicy') return row.agent === 'AGENT-008';
    if (ref.kind === 'business') return allowed(s, a, 'request.read');
    if (ref.kind === 'supplier') return true;
    if (ref.kind === 'catalogue') return catalogueAllows(s, a, row);
    if (ref.kind === 'policy') return allowed(s, a, 'request.read', row);
    if (ref.kind === 'audit') { const request = s.get('request:' + row.record)?.value; return Boolean(request && allowed(s, a, 'request.read', request)); }
    if (['codingExample', 'codingReview', 'invoiceCoding'].includes(ref.kind)) {
        try { return canRead(s, a, target(s, row.targetKind, row.target)); } catch { return false; }
    }
    const permission = ref.kind === 'invoice' ? 'invoice.read' : ref.kind === 'order' ? 'po.read' : 'request.read';
    return allowed(s, a, permission, row);
}
export function codingAgentRunVisible(s: State, a: Actor, run: Data): boolean {
    if (run.agent !== 'AGENT-008') return false;
    try {
        const subject = target(s, run.targetKind, run.target);
        return canRead(s, a, subject) && run.references.every((ref: Data) => {
            if (ref.kind !== 'policy') return permittedReference(s, a, ref);
            // A split cites only its applicable limit, not the owner's whole policy.
            const source = run.sources.find((row: Data) => row.kind === 'policy' && row.id === ref.id);
            return Boolean(s.has('policy:' + ref.id) && source && source.version === ref.version
                && Object.keys(source.value).length === 2 && Object.keys(source.value).every(field => ['limitMinor', 'currency'].includes(field))
                && run.flags.some((flag: Data) => flag.code === 'possible-split-purchase' && flag.requests.includes(run.request)
                    && flag.sources.some((known: Data) => known.kind === 'policy' && known.id === ref.id))
                && allowed(s, a, 'request.read', subject.request));
        });
    }
    catch { return false; }
}

function history(s: State, a: Actor, subject: ReturnType<typeof target>, sources: Data[]) {
    const supplier = subject.order?.supplier ?? subject.request.supplier;
    const examples: Data[] = [];
    for (const invoice of all(s, 'invoice').filter(row => row.id !== subject.value.id && row.order)) {
        const order = s.get('order:' + invoice.order)?.value;
        if (!order || order.supplier !== supplier) continue;
        const old = target(s, 'invoice', invoice.id);
        if (!canRead(s, a, old) || !allowed(s, a, 'po.read', order)) continue;
        const ref = reference(s, 'invoice', invoice.id), orderRef = reference(s, 'order', order.id), termsRef = reference(s, 'revision', old.terms.id);
        const source = { ...ref, value: { reference: invoice.reference, at: invoice.at, ...safeTarget(old) } };
        sources.push(source, { ...orderRef, value: { request: order.request, revision: order.revision } }, { ...termsRef, value: { request: order.request, ...coding(old.terms) } });
        for (const line of old.lines) examples.push({ supplier, item: itemKey(line), requester: old.terms.requester,
            coding: coding({ ...old.terms, ...line }), sequence: invoice.entrySequence ?? 0, correction: false, sources: [ref, orderRef, termsRef] });
    }
    const recent = [...new Map(all(s, 'codingExample').sort((a, b) => a.sequence - b.sequence)
        .map(row => [row.targetKind + ':' + row.target, row])).values()];
    for (const example of recent.filter(row => row.supplier === supplier && !(row.targetKind === subject.kind && row.target === subject.value.id))) {
        if (!permittedReference(s, a, { kind: 'codingExample', id: example.id }) || !example.references.every((ref: Data) => permittedReference(s, a, ref))) continue;
        const ref = reference(s, 'codingExample', example.id);
        sources.push({ ...ref, value: { targetKind: example.targetKind, target: example.target, supplier: example.supplier,
            requester: example.requester, items: example.items, coding: example.coding, sequence: example.sequence, correctedFields: example.correctedFields, at: example.at } });
        for (const item of example.items) examples.push({ ...example, item, correction: true, sources: [ref, ...example.references.filter((ref: Data) => ref.kind === example.targetKind && ref.id === example.target)] });
    }
    return examples;
}
function suggest(s: State, subject: ReturnType<typeof target>, examples: Data[]) {
    const business = get(s, 'business', 'main');
    const businessCodes = (field: string, value: string) => value && (field !== 'project' || business.projects.includes(value))
        && (field !== 'costCentre' || business.costCentres.includes(value));
    return subject.lines.flatMap((line: Data) => fields.flatMap(field => {
        const candidates = examples.filter(example => businessCodes(field, example.coding[field]));
        candidates.sort((a, b) => Number(b.correction) - Number(a.correction)
            || Number(b.item === itemKey(line)) - Number(a.item === itemKey(line))
            || Number(b.requester === subject.terms.requester) - Number(a.requester === subject.terms.requester)
            || b.sequence - a.sequence || JSON.stringify(a.sources).localeCompare(JSON.stringify(b.sources)));
        if (!candidates.length) return [];
        const best = candidates[0], matching = candidates.filter(example => example.coding[field] === best.coding[field] && example.correction === best.correction).slice(0, 5);
        const refs = [...new Map(matching.flatMap(example => example.sources).map((ref: Data) => [ref.kind + ':' + ref.id, ref])).values()];
        return [{ line: line.id, field, value: best.coding[field], basis: best.correction ? 'Recent human coding examples take precedence over invoice history' : 'Recorded coding on past supplier invoices', sources: refs }];
    }));
}
function policyFlags(s: State, a: Actor, subject: ReturnType<typeof target>, sources: Data[]) {
    const request = subject.request, flags: Data[] = [], business = get(s, 'business', 'main');
    const add = (kind: string, row: Data, value: Data) => { const ref = reference(s, kind, row.id); sources.push({ ...ref, value }); return ref; };
    add('business', business, { timezone: business.timezone ?? 'America/New_York', costCentres: business.costCentres, projects: business.projects });
    const submitted = (row: Data) => all(s, 'audit').filter(event => event.action === 'submit' && event.record === row.id && event.revision === row.revision)
        .sort((a, b) => b.at.localeCompare(a.at))[0];
    const day = (at: string) => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: business.timezone ?? 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)).map(part => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
    const event = submitted(request);
    if (event && !request.imported && ['pending', 'approved'].includes(request.status)) {
        const peers = all(s, 'request').filter(peer => peer.id !== request.id && !peer.imported && ['pending', 'approved'].includes(peer.status)
            && peer.requester === request.requester && peer.supplier === request.supplier && peer.currency === request.currency
            && allowed(s, a, 'request.read', peer) && submitted(peer) && day(submitted(peer)!.at) === day(event.at));
        for (const policy of all(s, 'policy').filter(policy => policy.active && policy.limitMinor > 0
            && [request, ...peers].some(row => row.lines.every((line: Data) => budgetScopeMatches(policy, row, budgetCoding(row, line)))))) {
            const near = [request, ...peers].filter(row => row.totalMinor < policy.limitMinor && row.totalMinor * 100 >= policy.limitMinor * 80
                && row.lines.every((line: Data) => budgetScopeMatches(policy, row, budgetCoding(row, line))));
            if (!near.some(row => row.id === request.id) || near.length < 2 || near.reduce((sum, row) => sum + row.totalMinor, 0) <= policy.limitMinor) continue;
            const refs = [add('policy', policy, { limitMinor: policy.limitMinor, currency: policy.currency })];
            for (const row of near) { refs.push(add('request', row, safeTarget(target(s, 'request', row.id)))); const audit = submitted(row)!; refs.push(add('audit', audit, { action: audit.action, record: audit.record, revision: audit.revision, at: audit.at })); }
            flags.push({ code: 'possible-split-purchase', severity: 'review', requester: request.requester, supplier: request.supplier,
                date: day(event.at), timezone: business.timezone ?? 'America/New_York', currency: request.currency, thresholdMinor: policy.limitMinor,
                combinedMinor: near.reduce((sum, row) => sum + row.totalMinor, 0), requests: near.map(row => row.id), sources: refs,
                reason: 'Same requester and supplier submitted multiple purchases at 80% to below an approval limit on the same local day; their combined amount exceeds the limit. Approver review required; intent is not established.' });
        }
    }
    const supplierId = subject.order?.supplier ?? request.supplier, supplier = s.get('supplier:' + supplierId)?.value;
    if (supplier && supplier.status !== 'preferred') {
        const categories = new Set(subject.lines.map((line: Data) => line.category));
        const preferred = all(s, 'catalogue').filter(item => item.approved && currentPrice(item) && item.currency === subject.value.currency && categories.has(item.category)
            && catalogueAllows(s, a, item) && s.get('supplier:' + item.supplier)?.value.status === 'preferred');
        if (preferred.length) {
            const refs = [add('supplier', supplier, { status: supplier.status })];
            for (const item of preferred) { refs.push(add('catalogue', item, { supplier: item.supplier, category: item.category, currency: item.currency, approved: item.approved })); const other = get(s, 'supplier', item.supplier); refs.push(add('supplier', other, { status: other.status })); }
            flags.push({ code: 'non-preferred-supplier', severity: 'review', supplier: supplierId, alternatives: [...new Set(preferred.map(item => item.supplier))], sources: refs,
                reason: 'Approved catalog items in this purchase category are available from a preferred supplier; suitability requires human review.' });
        }
    }
    return flags;
}

/** Only native coded facts participate. Descriptions are item keys, never instructions. */
export async function codingAgent(s: State, a: Actor, op: string, input: Data): Promise<Data | undefined> {
    if (!['coding-agent-run', 'coding-agent-review'].includes(op)) return;
    rejectProtectedInput(input);
    if (op === 'coding-agent-review') return review(s, a, input);
    const subject = target(s, input.kind, text(input.id, 'Coding target', 200));
    canPrepare(s, a, subject);
    const governance = requireAgentPolicies(s, 'AGENT-008', purchaseTypes(subject.terms));
    const sources: Data[] = [{ ...reference(s, subject.kind, subject.value.id), value: safeTarget(subject) }];
    if (subject.order) sources.push({ ...reference(s, 'order', subject.order.id), value: { request: subject.order.request, revision: subject.order.revision } },
        { ...reference(s, 'revision', subject.terms.id), value: { request: subject.request.id, ...coding(subject.terms) } });
    const examples = history(s, a, subject, sources), suggestions = suggest(s, subject, examples), flags = policyFlags(s, a, subject, sources);
    const uniqueSources = [...new Map(sources.map(source => [source.kind + ':' + source.id, source])).values()];
    const references = [...uniqueSources.map(({ kind, id, version }) => ({ kind, id, version })), ...governance.map(row => reference(s, 'agentPolicy', row.id))];
    const id = uid(), proposalId = uid(), at = new Date().toISOString();
    const inputs = { target: safeTarget(subject), sources: uniqueSources, governance: governance.map(row => ({ id: row.id, version: row.version, purchaseType: row.purchaseType })),
        rules: 'Source facts only. Human review records coding examples; ordinary purchasing authority governs any request change. No model, outbound message, approval, terms, bank change or money action.' };
    const proposalInput = { id, proposal: proposalId, coding: Object.fromEntries(fields.flatMap(field => {
        const values = [...new Set(suggestions.filter((row: Data) => row.field === field).map((row: Data) => row.value))]; return values.length === 1 ? [[field, values[0]]] : [];
    })), reason: 'Human reviewed these source-backed coding suggestions' };
    const outcomes = [{ status: 'suggestions-produced', approval: 'none', outbound: 'none', purchasingChange: 'none' }];
    const run = { id, agent: 'AGENT-008', workflow: 'coding-policy', actor: a.id, operatorVersion: a.version, targetKind: subject.kind, target: subject.value.id,
        request: subject.request.id, revision: subject.terms.revision, version: 1, at, mode, model: 'none', provider: 'none', algorithm: 'native-coding-policy-v1',
        inputs, sources: uniqueSources, references, suggestions, flags, messages: [], proposals: [{ id: proposalId, action: 'coding-agent-review', input: proposalInput }], outcomes,
        limitations: ['Non-PO invoice intake is unavailable; repeated non-PO supplier spend cannot be assessed from current native invoice records.', 'Possible splits use exact supplier, requester, currency and recorded local submission day; flags do not establish intent.'],
        inputDigest: await digest(inputs), outputDigest: await digest({ suggestions, flags, outcomes }) };
    rejectProtectedInput(run);
    put(s, 'agentRun', id, run);
    put(s, 'proposedAction', proposalId, { id: proposalId, run: id, runVersion: 1, actor: a.id, action: 'coding-agent-review', status: 'proposed', references, input: proposalInput });
    audit(s, a, op, subject.request.id, { run: id, targetKind: subject.kind, target: subject.value.id });
    return run;
}

async function review(s: State, a: Actor, input: Data) {
    const run = get(s, 'agentRun', input.id);
    requireThat(run.agent === 'AGENT-008', 'Coding agent record required', 409);
    const subject = target(s, run.targetKind, run.target);
    canPrepare(s, a, subject);
    if (subject.kind === 'request') requirePermission(s, a, 'request.edit', subject.request);
    requireAgentPolicies(s, 'AGENT-008', purchaseTypes(subject.terms));
    requireThat(codingAgentRunVisible(s, a, run), 'Coding sources outside your current scope', 403);
    const proposal = get(s, 'proposedAction', input.proposal);
    requireThat(proposal.run === run.id && proposal.runVersion === run.version && proposal.action === 'coding-agent-review' && proposal.status === 'proposed'
        && run.proposals.some((row: Data) => row.id === proposal.id && JSON.stringify(row.input) === JSON.stringify(proposal.input)), 'Current coding ProposedAction required', 409);
    requireThat(run.references.every((ref: Data) => s.get(ref.kind + ':' + ref.id)?.revision === ref.version), 'Coding sources or controls changed; prepare again', 409);
    requireThat(input.coding && typeof input.coding === 'object' && !Array.isArray(input.coding)
        && Object.keys(input.coding).length > 0 && Object.keys(input.coding).every(field => fields.includes(field as typeof fields[number])), 'Choose supported coding fields');
    const chosen = Object.fromEntries(Object.entries(input.coding).map(([field, value]) => [field, text(value, 'Chosen coding', 200)]));
    const business = get(s, 'business', 'main');
    requireThat((!chosen.costCentre || business.costCentres.includes(chosen.costCentre)) && (!chosen.project || business.projects.includes(chosen.project)), 'Choose configured department and project');
    const proposedScope = { ...subject.terms, ...chosen, lines: subject.lines.map((line: Data) => ({ ...line, ...chosen })) };
    requirePermission(s, a, subject.kind === 'invoice' ? 'invoice.capture' : 'request.edit', proposedScope);
    const id = uid(), at = new Date().toISOString(), sequence = all(s, 'codingExample').reduce((max, row) => Math.max(max, row.sequence), 0) + 1;
    const correctedFields = Object.keys(chosen).filter(field => !run.suggestions.filter((row: Data) => row.field === field).length
        || run.suggestions.some((row: Data) => row.field === field && row.value !== chosen[field]));
    const example = { id, run: run.id, proposal: proposal.id, targetKind: run.targetKind, target: run.target, request: subject.request.id,
        revision: subject.terms.revision, supplier: subject.order?.supplier ?? subject.request.supplier, requester: subject.terms.requester,
        items: [...new Set(subject.lines.map(itemKey))], coding: chosen, correctedFields, sequence, actor: a.id, operatorVersion: a.version, at,
        mode, model: 'none', provider: 'none', reason: text(input.reason, 'Coding review reason'), references: run.references.filter((ref: Data) => ['request', 'revision', 'invoice', 'order'].includes(ref.kind)) };
    rejectProtectedInput(example);
    put(s, 'codingExample', id, example);
    put(s, 'codingReview', id, { ...example, outcome: correctedFields.length ? 'corrected' : 'accepted', purchasingChange: 'none' });
    if (subject.kind === 'invoice') put(s, 'invoiceCoding', subject.value.id, { ...example, id: subject.value.id, example: id });
    put(s, 'proposedAction', proposal.id, { ...proposal, status: 'executed', executedBy: a.id, at, outcome: id });
    audit(s, a, 'coding-agent-review', subject.request.id, { run: run.id, example: id, outcome: correctedFields.length ? 'corrected' : 'accepted' });
    return get(s, 'codingReview', id);
}

export function visibleCodingAgent(s: State, a: Actor): Data {
    const runs = all(s, 'agentRun').filter(run => codingAgentRunVisible(s, a, run)), runIds = new Set(runs.map(run => run.id));
    return { codingRun: runs, codingExample: all(s, 'codingExample').filter(row => runIds.has(row.run)),
        codingReview: all(s, 'codingReview').filter(row => runIds.has(row.run)), invoiceCoding: all(s, 'invoiceCoding').filter(row => runIds.has(row.run)) };
}
