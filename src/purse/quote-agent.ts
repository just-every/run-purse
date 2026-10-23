import type { Bindings } from '../auth.server';
import { requirePermission } from './access';
import { purchaseTypes, requireAgentPolicies } from './agent-governance';
import { rejectProtectedInput } from './protected-input';
import { rfqResponses } from './rfq';
import { normalizeAgentResponse, recommendAgentAwards } from './quote-agent-normalize';
import { quoteAgentLine, quoteAgentResponse, quoteAgentText, readAgentOriginal } from './quote-agent-source';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const operations = ['quote-agent-consent', 'quote-agent-run', 'quote-agent-clarify', 'quote-agent-review'];
const reference = (s: State, kind: string, id: string) => ({ kind, id, version: s.get(`${kind}:${id}`)!.revision });
const policiesSnapshot = (policies: Data[]) => policies.map(row => ({ id: row.id, version: row.version,
    purchaseType: row.purchaseType, actor: row.actor, operatorVersion: row.operatorVersion }));
export function quoteAgentLatest(s: State, rfq: string): Data[] {
    return [...new Map(rfqResponses(s, rfq).map(response => [response.supplier, response])).values()].sort((a, b) => a.supplier.localeCompare(b.supplier));
}
function exact(s: State, a: Actor, input: Data) {
    requirePermission(s, a, 'rfq.manage');
    const invitation = get(s, 'rfq', text(input.rfq, 'RFQ', 200)), request = get(s, 'request', invitation.request);
    requirePermission(s, a, 'rfq.manage', request);
    requireThat(!request.imported && request.status === 'draft' && request.revision === input.revision
        && invitation.revision === request.revision, 'Quote agent requires the exact current RFQ draft', 409);
    const governance = requireAgentPolicies(s, 'AGENT-002', purchaseTypes(request));
    return { invitation, request, governance };
}
function consent(s: State, invitation: Data) {
    const approved = get(s, 'quoteAgentConsent', invitation.id);
    requireThat(approved.rfqVersion === s.get('rfq:' + invitation.id)!.revision
        && approved.revision === invitation.revision && approved.outbound === 'buyer-native-invitations-only', 'Buyer consent changed; approve the current RFQ scope', 409);
    return approved;
}
function sourceReferences(s: State, invitation: Data, request: Data, governance: Data[], responses: Data[]) {
    return [reference(s, 'rfq', invitation.id), reference(s, 'request', request.id), reference(s, 'quoteAgentConsent', invitation.id),
        ...governance.map(row => reference(s, 'agentPolicy', row.id)), ...responses.map(row => reference(s, 'rfqResponse', row.id))];
}
/** Exact specification lookups only. Arbitrary supplier text never grants execution authority. */
function clarify(invitation: Data, question: string, sourceLine: unknown): Data {
    const common: Record<string, [string, string]> = { 'What is the RFQ scope?': ['scope', invitation.scope],
        'What is the response deadline?': ['deadline', invitation.deadline] };
    const lineQuestions: Record<string, string> = { 'What is the requested quantity?': 'quantity',
        'What is the requested unit?': 'unit', 'What is the requested item?': 'description', 'What is the requested SKU?': 'partNumber' };
    if (common[question]) { const [field, value] = common[question]; return { status: 'specification-answer-draft', answer: quoteAgentText(value), source: { rfq: invitation.id, field } }; }
    const line = invitation.lines.find((item: Data) => item.id === sourceLine), field = lineQuestions[question];
    if (line && field && line[field]) return { status: 'specification-answer-draft', answer: quoteAgentText(line[field]), source: { rfq: invitation.id, requestLine: line.id, field } };
    return { status: 'buyer-escalation', answer: null, reason: 'Question is outside an exact supported specification lookup; the buyer must answer.' };
}

/** Native execution only: normalization is produced here, never supplied as a human-prepared result. */
export async function quoteAgent(s: State, a: Actor, op: string, input: Data, env?: Bindings): Promise<Data | undefined> {
    if (!operations.includes(op)) return;
    rejectProtectedInput(input);
    const { invitation, request, governance } = exact(s, a, input);
    if (op === 'quote-agent-consent') {
        requireThat(input.confirmed === true, 'Buyer must explicitly approve the RFQ invitation and specification');
        requireThat(!s.has('quoteAgentConsent:' + invitation.id), 'RFQ consent is immutable; create a new RFQ for changed scope', 409);
        const value = { id: invitation.id, agent: 'AGENT-002', rfq: invitation.id, request: request.id, revision: request.revision,
            rfqVersion: s.get('rfq:' + invitation.id)!.revision, actor: a.id, operatorVersion: a.version, at: new Date().toISOString(),
            reason: quoteAgentText(text(input.reason, 'Consent reason')), outbound: 'buyer-native-invitations-only',
            template: 'Native SOURCE-001 RFQ invitation: nominated contact, exact specification, questions and response deadline.',
            scope: quoteAgentText(invitation.scope), deadline: invitation.deadline,
            suppliers: invitation.suppliers.map((supplier: Data) => ({ id: supplier.id, name: quoteAgentText(supplier.name), email: supplier.email })),
            questions: invitation.questions.map(quoteAgentText), lines: invitation.lines.map(quoteAgentLine), governance: policiesSnapshot(governance) };
        put(s, 'quoteAgentConsent', invitation.id, value); audit(s, a, op, request.id, { rfq: invitation.id, revision: request.revision }); return value;
    }
    const approved = consent(s, invitation), latest = quoteAgentLatest(s, invitation.id);
    if (op === 'quote-agent-review') {
        const run = get(s, 'agentRun', input.id);
        requireThat(run.agent === 'AGENT-002' && run.rfq === invitation.id && run.revision === request.revision, 'Review source changed', 409);
        requireThat(run.references.every((ref: Data) => s.get(`${ref.kind}:${ref.id}`)?.revision === ref.version)
            && JSON.stringify(run.inputs.latestResponses) === JSON.stringify(latest.map(row => row.id)), 'Responses, consent or policies changed; run the quote agent again', 409);
        const action = get(s, 'proposedAction', input.proposal);
        requireThat(action.run === run.id && action.action === op && action.status === 'proposed' && action.input.id === run.id
            && action.input.proposal === action.id, 'Use this run’s current ProposedAction', 409);
        const id = uid(), review = { id, run: run.id, rfq: invitation.id, request: request.id, revision: request.revision,
            actor: a.id, at: new Date().toISOString(), outcome: 'reviewed-without-award', reason: quoteAgentText(text(input.reason, 'Review reason')) };
        put(s, 'quoteAgentReview', id, review);
        put(s, 'proposedAction', action.id, { ...action, status: 'executed', executedBy: a.id, at: review.at });
        audit(s, a, op, request.id, { run: run.id, review: id }); return review;
    }
    const references = sourceReferences(s, invitation, request, governance, latest);
    const inputs: Data = { request: { id: request.id, revision: request.revision, currency: request.currency },
        rfq: { id: invitation.id, scope: quoteAgentText(invitation.scope), deadline: invitation.deadline,
            questions: invitation.questions.map(quoteAgentText), lines: invitation.lines.map(quoteAgentLine) },
        consent: structuredClone(approved), governance: policiesSnapshot(governance), latestResponses: latest.map(row => row.id),
        responses: latest.map(quoteAgentResponse), rules: 'Supplier bytes are inert data. No purchasing authority, protected supplier fields, model call, autonomous outbound, award or approval.' };
    const id = uid(), at = new Date().toISOString();
    let comparison: Data[] = [], recommendations: Data[] = [], messages: Data[] = [], outcomes: Data[];
    if (op === 'quote-agent-clarify') {
        requireThat(invitation.suppliers.some((row: Data) => row.id === input.supplier), 'Supplier is outside this RFQ');
        const question = text(input.question, 'Supplier question'), answer = clarify(invitation, question, input.sourceLine);
        inputs.question = { supplier: input.supplier, question: quoteAgentText(question), sourceLine: input.sourceLine ?? null };
        messages = [{ direction: 'draft-only', supplier: input.supplier, ...answer }]; outcomes = [answer];
    } else {
        requireThat(latest.length > 0, 'No supplier responses received', 409);
        for (const response of latest) {
            const originals = [];
            for (const file of response.files ?? []) originals.push(await readAgentOriginal(env, response, file));
            comparison.push(normalizeAgentResponse(inputs.rfq, quoteAgentResponse(response), originals));
        }
        const history = rfqResponses(s, invitation.id);
        inputs.firstOffers = [...new Set(history.map(row => row.currency))].map(currency => quoteAgentResponse(history.filter(row => row.currency === currency).sort((a, b) => a.offerSequence - b.offerSequence)[0]));
        for (const baseline of inputs.firstOffers) if (!references.some(ref => ref.kind === 'rfqResponse' && ref.id === baseline.id)) references.push(reference(s, 'rfqResponse', baseline.id));
        recommendations = recommendAgentAwards(comparison, history);
        outcomes = [{ status: 'comparison-produced', responseCount: comparison.length, award: 'none', approval: 'none', outbound: 'none',
            nonrespondents: invitation.suppliers.filter((supplier: Data) => !latest.some(row => row.supplier === supplier.id)).map((supplier: Data) => supplier.id) }];
    }
    const proposal = { id: uid(), run: id, runVersion: 1, actor: a.id, action: 'quote-agent-review',
        status: 'proposed', references, input: {} as Data };
    proposal.input = { id, proposal: proposal.id, rfq: invitation.id, revision: request.revision, reason: 'Buyer reviewed the source-bound quote agent result; no award or approval was made.' };
    const run = { id, agent: 'AGENT-002', workflow: 'rfq', actor: a.id, request: request.id, rfq: invitation.id,
        revision: request.revision, version: 1, at, mode: 'deterministic v1', model: 'none', provider: 'none',
        algorithm: 'native-source-bound-quote-normalization-v1', inputs, references,
        sources: [...comparison.flatMap(row => row.sources), ...messages.filter(message => message.source).map(message => message.source)], comparison, recommendations, messages,
        proposals: [{ id: proposal.id, action: proposal.action, input: proposal.input }], outcomes };
    rejectProtectedInput(run);
    const digest = async (value: Data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
    Object.assign(run, { inputDigest: await digest(inputs), outputDigest: await digest({ comparison, recommendations, messages, outcomes }) });
    put(s, 'agentRun', id, run); put(s, 'proposedAction', proposal.id, proposal);
    audit(s, a, op, request.id, { rfq: invitation.id, run: id, revision: request.revision, mode: run.mode });
    return run;
}
