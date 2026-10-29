import { allowed, requirePermission } from './access';
import { purchaseTypes, requireAgentPolicies } from './agent-governance';
import { rejectProtectedInput } from './protected-input';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
const ref = (s: State, kind: string, id: string) => ({ kind, id, version: s.get(kind + ':' + id)!.revision });
const lineFact = (line: Data) => ({ line: line.id, partNumber: typeof line.partNumber === 'string' ? line.partNumber : '', unit: line.unit, unitMinor: line.unitMinor });
const nativeGoods = (row: Data) => !row.imported && !row.adoption && row.purchaseType !== 'travel' && !row.poDetails?.blanket && !row.recurring && row.lines.every((line: Data) => !line.service);
const sameItem = (target: Data, source: Data) => typeof target.partNumber === 'string' && target.partNumber.trim().length > 0
    && typeof target.unit === 'string' && target.unit.trim().length > 0 && target.partNumber === source.partNumber && target.unit === source.unit;

function subject(s: State, a: Actor, id: string) {
    const request = get(s, 'request', id);
    requirePermission(s, a, 'procurement.manage', request);
    requirePermission(s, a, 'request.read', request);
    return request;
}
function sourceAllowed(s: State, a: Actor, kind: string, row: Data, revision: Data): boolean {
    return allowed(s, a, kind === 'order' ? 'po.read' : 'request.read', row) && allowed(s, a, 'request.read', revision)
        && (kind !== 'quote' || !row.rfq || allowed(s, a, 'rfq.read', get(s, 'rfq', row.rfq)));
}
/** Only selected, minimal purchasing facts enter a run. Free-form source text is never interpreted or copied. */
export async function previewPriceBenchmark(s: State, a: Actor, input: Data) {
    rejectProtectedInput(input);
    const request = subject(s, a, text(input.request, 'Request', 200));
    requireThat(nativeGoods(request), 'Benchmarking supports ordinary native goods requests only', 409);
    requireThat(request.revision === input.revision, 'Stale request revision; review again', 409);
    const policies = requireAgentPolicies(s, 'AGENT-009', purchaseTypes(request));
    requireThat(policies.every(policy => {
        const authority = s.get('nativeBenchmarkAuthority:' + policy.id)?.value;
        return authority?.version === policy.version && authority?.actor === policy.actor && authority?.operatorVersion === policy.operatorVersion;
    }), 'Current owner must enable benchmarking in this installation', 409);
    const target = { request: request.id, revision: request.revision, currency: request.currency, lines: request.lines.map(lineFact) };
    const sources: Data[] = [];
    for (const kind of ['order', 'quote']) for (const row of all(s, kind)) {
        if (kind === 'order' && !row.issuedAt || row.sourceValuesErased || row.erasure) continue;
        const revision = s.get('revision:' + row.request + ':' + row.revision)?.value;
        if (!revision || !nativeGoods(revision) || !sourceAllowed(s, a, kind, row, revision)) continue;
        if (kind === 'order' && row.request === request.id && row.revision === request.revision) continue;
        for (const line of row.lines) {
            // Description similarity cannot qualify an item. The buyer reviews exact identifiers and units below.
            if (!target.lines.some((wanted: Data) => sameItem(wanted, line) && row.currency === target.currency)) continue;
            sources.push({ kind, id: row.id, version: s.get(kind + ':' + row.id)!.revision, request: row.request, revision: row.revision,
                revisionVersion: s.get('revision:' + revision.id)!.revision, supplier: row.supplier,
                ...(kind === 'order' ? { number: row.number } : {}), ...lineFact(line), currency: row.currency,
                at: kind === 'order' ? row.issuedAt : row.at, dateBasis: kind === 'order' ? 'PO issuance' : 'Quotation recorded',
                missing: kind === 'quote' ? [...(row.missing ?? []), 'Current quotation validity not verified'] : [] });
        }
    }
    sources.sort((x, y) => JSON.stringify([x.kind, x.id, x.line]).localeCompare(JSON.stringify([y.kind, y.id, y.line])));
    const governance = policies.map(policy => ({ ...ref(s, 'agentPolicy', policy.id), policyVersion: policy.version }));
    const review = { actor: a.id, operatorVersion: a.version, target, targetVersion: s.get('request:' + request.id)!.revision,
        revisionVersion: s.get('revision:' + request.id + ':' + request.revision)!.revision, sources, governance };
    rejectProtectedInput(review);
    return { ...review, fingerprint: await digest(review) };
}

/** History remains readable under current source scope; it cannot be edited or executed as an action. */
export function priceBenchmarkVisible(s: State, a: Actor, run: Data): boolean {
    if (run.agent !== 'AGENT-009') return false;
    try {
        subject(s, a, run.request);
        const target = get(s, 'revision', run.request + ':' + run.revision);
        return allowed(s, a, 'request.read', target) && run.sources.every((source: Data) => {
            const row = get(s, source.kind, source.id), revision = get(s, 'revision', source.request + ':' + source.revision);
            return sourceAllowed(s, a, source.kind, row, revision);
        });
    } catch { return false; }
}

export async function priceBenchmark(s: State, a: Actor, op: string, input: Data): Promise<Data | undefined> {
    if (op !== 'price-benchmark-run') return;
    const preview = await previewPriceBenchmark(s, a, input);
    requireThat(input.fingerprint === preview.fingerprint, 'Benchmark sources or controls changed; review again', 409);
    requireThat(input.reviewed === true, 'Buyer must review the exact item, unit and currency mappings');
    const reason = text(input.reason, 'Mapping review reason');
    requireThat(Array.isArray(input.mappings) && input.mappings.length > 0 && input.mappings.length <= 100, 'Choose 1–100 comparable source lines');
    const mappings: Data[] = [], sources: Data[] = [];
    for (const mapping of input.mappings) {
        const wanted = preview.target.lines.find((line: Data) => line.line === mapping.targetLine);
        const source = preview.sources.find(row => row.kind === mapping.kind && row.id === mapping.id && row.line === mapping.line);
        requireThat(wanted && source && sameItem(wanted, source) && source.currency === preview.target.currency, 'Source is unavailable or item, unit and currency are incomparable', 409);
        requireThat(!mappings.some(row => row.targetLine === wanted.line && row.kind === source.kind && row.id === source.id && row.line === source.line), 'Duplicate source mapping');
        mappings.push({ targetLine: wanted.line, kind: source.kind, id: source.id, line: source.line });
        if (!sources.some(row => row.kind === source.kind && row.id === source.id && row.line === source.line)) sources.push(source);
    }
    mappings.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    const results = preview.target.lines.map((wanted: Data) => {
        const selected = mappings.filter(mapping => mapping.targetLine === wanted.line).map(mapping => sources.find(source => source.kind === mapping.kind && source.id === mapping.id && source.line === mapping.line)!);
        const targetMinor = selected.length ? Math.min(wanted.unitMinor, ...selected.map(source => source.unitMinor)) : null;
        return { ...wanted, currency: preview.target.currency, targetMinor, differenceMinor: targetMinor === null ? null : wanted.unitMinor - targetMinor,
            calculation: 'Minimum of requested unit price and buyer-reviewed comparable recorded unit prices; integer minor units, no currency conversion',
            arguments: selected.length ? 'These exact recorded comparable prices support asking the supplier to match the lowest price. Historical purchases and recorded quotations do not prove a currently available offer.' : 'No reviewed comparable evidence; no target proposed',
            citations: selected, missing: ['Qualified current PunchOut price unavailable', 'Freight, tax, volume breaks and current availability not compared',
                ...(!selected.some(source => source.kind === 'order') ? ['No reviewed historical PO'] : []),
                ...(!selected.some(source => source.kind === 'quote') ? ['No reviewed recorded quotation'] : [])] };
    });
    const inputs = { target: preview.target, mappings, sources, governance: preview.governance, fingerprint: preview.fingerprint,
        reviewed: true, reason, actor: a.id, operatorVersion: a.version };
    const inputDigest = await digest(inputs);
    const existing = all(s, 'agentRun').find(run => run.agent === 'AGENT-009' && run.inputDigest === inputDigest);
    if (existing) { requireThat(priceBenchmarkVisible(s, a, existing), 'Benchmark sources outside your current scope', 403); return existing; }
    const references = [...new Map([{ kind: 'request', id: preview.target.request, version: preview.targetVersion },
        { kind: 'revision', id: preview.target.request + ':' + preview.target.revision, version: preview.revisionVersion },
        ...preview.governance.map(({kind,id,version}) => ({kind,id,version})), ...sources.flatMap(source => [
            { kind: source.kind, id: source.id, version: source.version },
            { kind: 'revision', id: source.request + ':' + source.revision, version: source.revisionVersion }])].map(reference => [reference.kind + ':' + reference.id, reference])).values()];
    const outcomes = [{ status: 'nonbinding-brief', purchasingChange: 'none', outbound: 'none', offer: 'none' }];
    const id = uid(), run = { id, agent: 'AGENT-009', workflow: 'price-benchmark', request: preview.target.request, revision: preview.target.revision,
        actor: a.id, operatorVersion: a.version, version: 1, at: new Date().toISOString(), mode: 'deterministic v1', model: 'none', provider: 'none',
        algorithm: 'native-price-benchmark-v1', inputs, sources, references, results, messages: [], proposals: [], outcomes,
        inputDigest, outputDigest: await digest({ results, outcomes }) };
    rejectProtectedInput(run);
    put(s, 'agentRun', id, run);
    audit(s, a, op, run.request, { run: id, revision: run.revision });
    return run;
}
