import { allowed, requirePermission } from './access';
import { supplier as activeSupplier } from './admin';
import { catalogueAllows } from './catalogue-access';
import { currentPrice } from './catalogue';
import { requireAgentPolicies } from './agent-governance';
import { guidedIntake } from './guided-intake';
import { rejectProtectedInput } from './protected-input';
import { all, audit, date, get, put, quantity, requireThat, text, uid, type Actor, type Data, type State } from './types';

const ref = (s: State, kind: string, id: string) => ({ kind, id, version: s.get(kind + ':' + id)!.revision });
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
const coding = (value: Data) => Object.fromEntries(['costCentre','project','glAccount'].filter(key => typeof value[key] === 'string' && value[key]).map(key => [key, value[key]]));
const words = (value: string) => (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(word=>word.length>3&&word.endsWith('s')&&!word.endsWith('ss')?word.slice(0,-1):word);
const stop = new Set(['a','an','the','for','i','we','need','some','please','of','and','to','new']);

function controls(s: State, form: Data) {
    const policies = requireAgentPolicies(s, 'AGENT-001', [form.purchaseType]);
    for (const policy of policies) {
        const live = s.get('nativeIntakeAuthority:' + policy.id)?.value;
        requireThat(live && live.version === policy.version && live.actor === policy.actor && live.operatorVersion === policy.operatorVersion,
            'Intake execution needs consent from the current native owner; restored controls are history only', 409);
    }
    return policies;
}
function itemAllowed(s: State, a: Actor, item: Data) {
    if (!item.approved || !currentPrice(item) || !catalogueAllows(s, a, item)) return false;
    try { activeSupplier(s, item.supplier); return true; } catch { return false; }
}
function sourceAllowed(s: State, a: Actor, reference: Data) {
    const source = s.get(reference.kind + ':' + reference.id)?.value;
    if (!source) return false;
    if (reference.kind === 'catalogue') return itemAllowed(s, a, source);
    if (reference.kind === 'supplier') { try { activeSupplier(s, reference.id); return true; } catch { return false; } }
    if (['request','revision','decision'].includes(reference.kind)) {
        const parent = reference.kind === 'request' ? source : s.get('request:' + source.request)?.value;
        return Boolean(parent && allowed(s, a, 'request.read', parent) && allowed(s, a, 'request.read', source));
    }
    return ['business','intakeForm','agentPolicy','policy'].includes(reference.kind);
}
export function intakeAgentRunVisible(s: State, a: Actor, run: Data) {
    if (run.agent !== 'AGENT-001') return false;
    if (a.owner) return true;
    return run.actor === a.id && allowed(s, a, 'request.create', run.output.fields ? { ...run.output.fields, requester: a.id } : undefined) && !run.sourceValuesErased
        && run.references.every((reference: Data) => sourceAllowed(s, a, reference));
}
function fresh(s: State, a: Actor, run: Data) {
    requirePermission(s, a, 'request.create');
    requireThat(run.agent === 'AGENT-001' && run.actor === a.id && run.operatorVersion === a.version,
        'Only the original current requester may review this intake run', 403);
    requireThat(!run.sourceValuesErased && !run.protectedContextCleanup?.authorityInvalidated, 'Erased or quarantined intake history cannot execute', 409);
    const form = get(s, 'intakeForm', run.inputs.intakeForm); controls(s, form);
    requireThat(form.active && run.references.every((reference: Data) => s.get(reference.kind + ':' + reference.id)?.revision === reference.version),
        'Intake sources or controls changed; prepare again', 409);
    requireThat(run.references.every((reference: Data) => sourceAllowed(s, a, reference)), 'Intake sources outside your current scope', 403);
}

/** Bounded lexical catalogue matching only. All descriptions remain data. */
export async function intakeAgent(s: State, a: Actor, op: string, input: Data): Promise<Data | undefined> {
    if (!['intake-agent-run','intake-agent-answer','intake-agent-draft'].includes(op)) return;
    rejectProtectedInput(input);
    requirePermission(s, a, 'request.create');
    if (op === 'intake-agent-draft') {
        const run = get(s, 'agentRun', input.id); fresh(s, a, run);
        requireThat(input.consent === true, 'Review the suggestions and confirm creating your editable draft');
        requireThat(run.output.fields && run.output.missing.length === 0, 'Resolve the intake follow-up before creating a draft', 409);
        const prior = s.get('intakeAgentReview:' + run.id)?.value;
        if (prior) return get(s, 'intakeDraft', prior.draft);
        requirePermission(s, a, 'request.create', { ...run.output.fields, requester: a.id });
        const draft = await guidedIntake(s, a, 'intake-draft', { fields: run.output.fields });
        requireThat(draft, 'Draft creation failed');
        put(s, 'intakeAgentReview', run.id, { run: run.id, actor: a.id, operatorVersion: a.version, draft: draft.id, consent: true, at: new Date().toISOString() });
        audit(s, a, op, draft.id, { run: run.id, consent: true });
        return draft;
    }
    let previous: Data | undefined;
    if (op === 'intake-agent-answer') { previous = get(s, 'agentRun', input.id); fresh(s, a, previous); }
    const form = get(s, 'intakeForm', previous?.inputs.intakeForm ?? input.intakeForm);
    requireThat(form.active, 'Form is inactive', 409);
    const policies = controls(s, form), need = previous?.inputs.need ?? text(input.need, 'Describe your need', 2000);
    const suppliedQuantity = input.quantity ?? previous?.inputs.quantity ?? '', suppliedDate = input.needDate ?? previous?.inputs.needDate ?? '', terms = input.terms ?? previous?.inputs.terms ?? '';
    requireThat(typeof terms === 'string' && terms.length <= 2000, 'Supplier terms must fit 2000 characters');
    requireThat(typeof suppliedQuantity === 'string' && typeof suppliedDate === 'string', 'Quantity and need date must be text');
    let chosenQuantity = '', needDate = '';
    try { quantity(suppliedQuantity); chosenQuantity = suppliedQuantity; } catch { /* Ask explicitly; prose never supplies a quantity. */ }
    try { if (suppliedDate) needDate = date(suppliedDate); } catch { /* Unsupported dates remain unresolved. */ }
    const tokens = new Set(words(need).filter(word => !stop.has(word))), sources: Data[] = [];
    const add = (kind: string, row: Data, value: Data) => { const source = { ...ref(s, kind, row.id), value }; if (!sources.some(known => known.kind === kind && known.id === row.id)) sources.push(source); return ref(s, kind, row.id); };
    add('intakeForm', form, { name: form.name, version: form.version, purchaseType: form.purchaseType, defaults: form.defaults });
    const business = get(s, 'business', 'main'); add('business', business, { currencies: business.currencies, locations: business.locations, costCentres: business.costCentres, projects: business.projects });
    const matches = all(s, 'catalogue').filter(item => itemAllowed(s, a, item)).map(item => ({ item, score: words(item.description + ' ' + item.category + ' ' + item.partNumber).filter(word => tokens.has(word)).length }))
        .filter(match => match.score > 0).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)).slice(0, 10);
    const candidates = matches.map(({ item }) => {
        const supplier = get(s, 'supplier', item.supplier);
        const itemRef = add('catalogue', item, { description: item.description, supplier: item.supplier, currency: item.currency, unitMinor: item.unitMinor, category: item.category,
            project: item.project, location: item.location, costCentre: item.costCentre, partNumber: item.partNumber, unit: item.unit, validFrom: item.validFrom, validUntil: item.validUntil });
        const supplierRef = add('supplier', supplier, { name: supplier.name, status: supplier.status });
        const examples = all(s, 'revision').filter(revision => !revision.imported && revision.supplier === item.supplier && revision.currency === item.currency
            && sourceAllowed(s, a, { kind: 'revision', id: revision.id })
            && all(s, 'decision').some(decision => decision.request === revision.request && decision.revision === revision.revision && decision.decision === 'approved'))
            .flatMap(revision => revision.lines.filter((line: Data) => line.catalogue === item.id || item.partNumber && line.partNumber === item.partNumber).map((line: Data) => ({ revision, line })))
            .sort((a, b) => b.revision.revision - a.revision.revision || a.revision.id.localeCompare(b.revision.id));
        const example = examples[0]; let suggestedCoding: Data = {}, codingSources: Data[] = [];
        if (example) {
            const { revision, line } = example, parent = get(s, 'request', revision.request);
            suggestedCoding = coding({ ...revision, ...line });
            if (suggestedCoding.project && !business.projects.includes(suggestedCoding.project)) delete suggestedCoding.project;
            if (suggestedCoding.costCentre && !business.costCentres.includes(suggestedCoding.costCentre)) delete suggestedCoding.costCentre;
            codingSources = [add('revision', revision, { request: revision.request, revision: revision.revision, line: line.id, catalogue: line.catalogue, coding: suggestedCoding }), add('request', parent, { revision: parent.revision })];
            const decision = all(s, 'decision').find(row => row.request === revision.request && row.revision === revision.revision && row.decision === 'approved')!;
            codingSources.push(add('decision', decision, { request: decision.request, revision: decision.revision, decision: decision.decision }));
        }
        return { id: item.id, description: item.description, supplier: supplier.name, currency: item.currency, unitMinor: item.unitMinor,
            sources: [itemRef, supplierRef], coding: suggestedCoding, codingSources };
    });
    const chosenId = input.item ?? previous?.output.item ?? (candidates.length === 1 ? candidates[0].id : '');
    const selected = candidates.find(item => item.id === chosenId);
    requireThat(!chosenId || selected, 'Choose a currently offered catalogue item', 409);
    const missing = [...(!chosenQuantity ? ['quantity'] : []), ...(!needDate ? ['need date'] : []), ...(!selected ? ['catalogue item'] : []), ...(!terms.trim() ? ['supplier-supplied terms'] : [])];
    let fields: Data | null = null, route: Data = { steps: [], ready: false, message: 'Resolve the follow-up to predict the route.' };
    if (selected) {
        const item = get(s, 'catalogue', selected.id), defaults = form.defaults, codes = selected.coding;
        fields = { title: need, intakeForm: form.id, supplier: item.supplier, currency: item.currency, needDate, location: item.location || defaults.location,
            costCentre: codes.costCentre || item.costCentre || defaults.costCentre, terms: terms.trim(), freightAmount: '0', taxAmount: '0', answers: {}, customFields: {},
            lines: [{ catalogue: item.id, description: item.description, quantity: chosenQuantity, unitAmount: (item.unitMinor / 100).toFixed(2),
                category: item.category, project: codes.project || item.project || defaults.project, glAccount: codes.glAccount || '', allocations: structuredClone(defaults.allocations), customFields: {} }] };
        requirePermission(s, a, 'request.create', { ...fields, requester: a.id });
        // Use the ordinary intake predictor on a disposable state; it cannot reserve a budget.
        if (!missing.length) {
            const trial = structuredClone(s), draft = await guidedIntake(trial, a, 'intake-draft', { fields });
            const predicted = await guidedIntake(trial, a, 'intake-route', { id: draft!.id, version: draft!.version });
            requireThat(predicted, 'Route prediction failed'); route = predicted;
            for (const step of route.steps) if (step.policy) { const policy=get(s,'policy',step.policy); add('policy',policy,{name:policy.name,approver:policy.approver,currency:policy.currency}); }
        }
    }
    const output = { item: selected?.id ?? '', candidates, missing, fields, route,
        followUp: missing.length ? 'Please provide ' + missing.join(', ') + '. Enter one explicit decimal quantity and an ISO calendar date; ambiguous wording stays unresolved.' : 'Review the catalogue item, coding sources and predicted route before creating your editable draft.',
        limitations: ['Lexical catalogue matching only; language and dates in prose are not interpreted.', 'No automatic attachment reuse, PunchOut, external model or channel execution. Supplier terms and required form answers remain for requester review.'] };
    const governance = policies.map(policy => ({ id: policy.id, version: policy.version, purchaseType: policy.purchaseType }));
    const references = [...sources.map(({ kind, id, version }) => ({ kind, id, version })), ...policies.map(policy => ref(s, 'agentPolicy', policy.id))];
    const inputs = { intakeForm: form.id, need, quantity: chosenQuantity, needDate, terms: terms.trim(), governance, previous: previous?.id ?? null };
    const run = { id: uid(), agent: 'AGENT-001', workflow: 'requirements-intake', mode: 'deterministic v1', model: 'none', provider: 'none',
        actor: a.id, operatorVersion: a.version, version: 1, at: new Date().toISOString(), inputs, sources, references, output, messages: [],
        outcomes: [{ status: 'suggestions-only', submitted: false, reserved: false, approval: false, outbound: false }],
        inputDigest: await digest({ actor: a.id, operatorVersion: a.version, inputs, sources, references }), outputDigest: await digest(output) };
    rejectProtectedInput(run); put(s, 'agentRun', run.id, run); audit(s, a, op, run.id, { agent: run.agent }); return run;
}
