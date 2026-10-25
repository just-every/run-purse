import { erasedSourceFact } from '../../src/purse/erasure-journal.mjs';
import { createHash } from 'node:crypto';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = new Set(['glAccount', 'class', 'costCentre', 'project']);
const sourceKinds = new Set(['request', 'revision', 'invoice', 'order', 'codingExample', 'business', 'policy', 'supplier', 'catalogue', 'audit']);
const safeCoding = value => value && typeof value === 'object' && !Array.isArray(value)
 && Object.entries(value).every(([field, code]) => fields.has(field) && typeof code === 'string' && code.trim().length > 0 && code.length <= 200);

/** Restored reports are retained history; current native governance still controls execution. */
export function validateCodingAgent(all, get, check) {
 const subject = row => {
  check(['request', 'invoice'].includes(row.targetKind), 'coding_agent_target_kind');
  const value = get(row.targetKind, row.target), order = row.targetKind === 'invoice' ? get('order', value.order) : null;
  const request = order ? get('request', order.request) : value, revision = get('revision', request.id + ':' + row.revision);
  check(row.request === request.id && (!order || row.revision === order.revision), 'coding_agent_target');
  return { value, order, request, revision };
 };
 const refs = references => {
  check(Array.isArray(references) && references.length > 0, 'coding_agent_references');
  for (const ref of references) { check(typeof ref.kind === 'string' && typeof ref.id === 'string' && typeof ref.version === 'string', 'coding_agent_reference'); get(ref.kind, ref.id); }
 };
 for (const run of all('agentRun').filter(row => row.agent === 'AGENT-008')) {
  const target = subject(run);
  check(run.workflow === 'coding-policy' && run.mode === 'deterministic v1' && run.model === 'none' && run.provider === 'none' && run.version === 1
   && run.algorithm === 'native-coding-policy-v1' && Number.isFinite(Date.parse(run.at)) && !containsProtectedInput(run), 'coding_agent_execution');
  check(run.sourceValuesErased ? erasedSourceFact(all,'agentRun',run.id,run) : run.inputDigest === digest(run.inputs) && run.outputDigest === digest({ suggestions: run.suggestions, flags: run.flags, outcomes: run.outcomes }), 'coding_agent_digest');
  check(run.inputs.target.kind === run.targetKind && run.inputs.target.id === run.target && run.inputs.target.request === run.request
   && run.inputs.target.revision === run.revision && run.inputs.target.supplier === (target.order?.supplier ?? target.revision.supplier)
   && run.inputs.target.currency === (target.order ? target.value.currency : target.revision.currency) && safeCoding(run.inputs.target.coding), 'coding_agent_inputs');
  refs(run.references);
  check(Array.isArray(run.sources) && JSON.stringify(run.sources) === JSON.stringify(run.inputs.sources), 'coding_agent_sources');
  for (const source of run.sources) {
   check(sourceKinds.has(source.kind) && source.value && run.references.some(ref => ref.kind === source.kind && ref.id === source.id && ref.version === source.version), 'coding_agent_source');
   get(source.kind, source.id);
   if (source.kind === 'supplier') check(Object.keys(source.value).every(field => field === 'status'), 'coding_agent_safe_supplier');
   if (source.kind === 'invoice') check(source.value.kind === 'invoice' && source.value.id === source.id && !Object.hasOwn(source.value, 'source')
    && !Object.hasOwn(source.value, 'document') && safeCoding(source.value.coding), 'coding_agent_safe_invoice');
  }
  check(Array.isArray(run.messages) && run.messages.length === 0 && run.outcomes.length === 1 && run.outcomes[0].approval === 'none'
   && run.outcomes[0].outbound === 'none' && run.outcomes[0].purchasingChange === 'none', 'coding_agent_nonbinding');
  for (const suggestion of run.suggestions) {
   check(fields.has(suggestion.field) && typeof suggestion.value === 'string' && run.inputs.target.lines.some(line => line.id === suggestion.line), 'coding_agent_suggestion');
   refs(suggestion.sources);
   check(suggestion.sources.every(ref => run.references.some(known => known.kind === ref.kind && known.id === ref.id && known.version === ref.version)), 'coding_agent_suggestion_sources');
  }
  for (const flag of run.flags) {
   check(['possible-split-purchase', 'non-preferred-supplier'].includes(flag.code) && flag.severity === 'review', 'coding_agent_flag'); refs(flag.sources);
   check(flag.sources.every(ref => run.references.some(known => known.kind === ref.kind && known.id === ref.id && known.version === ref.version)), 'coding_agent_flag_sources');
   if (flag.code === 'possible-split-purchase') {
    check(flag.requests.length >= 2 && new Set(flag.requests).size === flag.requests.length && flag.requests.includes(run.request)
     && Number.isSafeInteger(flag.thresholdMinor) && flag.thresholdMinor > 0 && flag.combinedMinor > flag.thresholdMinor, 'coding_agent_split');
    const rows = flag.requests.map(id => run.sources.find(source => source.kind === 'request' && source.id === id)?.value);
    check(rows.every(row => row && row.requester === flag.requester && row.supplier === flag.supplier && row.currency === flag.currency
     && row.totalMinor < flag.thresholdMinor && row.totalMinor * 100 >= flag.thresholdMinor * 80)
     && rows.reduce((sum, row) => sum + row.totalMinor, 0) === flag.combinedMinor, 'coding_agent_split_sources');
   }
  }
  check(run.proposals.length === 1, 'coding_agent_proposals');
  for (const proposal of run.proposals) {
   const action = get('proposedAction', proposal.id);
   check(action.run === run.id && action.runVersion === run.version && action.action === 'coding-agent-review' && action.actor === run.actor
    && action.input.id === run.id && action.input.proposal === action.id && JSON.stringify(action.input) === JSON.stringify(proposal.input)
    && JSON.stringify(action.references) === JSON.stringify(run.references) && safeCoding(action.input.coding), 'coding_agent_proposal');
  }
 }
 const sequences = new Set();
 for (const example of all('codingExample')) {
  const run = get('agentRun', example.run), action = get('proposedAction', example.proposal), target = subject(example);
  check(run.agent === 'AGENT-008' && example.targetKind === run.targetKind && example.target === run.target && example.revision === run.revision
   && example.supplier === (target.order?.supplier ?? target.revision.supplier) && example.requester === target.revision.requester
   && action.run === run.id && action.status === 'executed' && action.outcome === example.id && action.executedBy === example.actor
   && Number.isSafeInteger(example.sequence) && example.sequence > 0 && !sequences.has(example.sequence)
   && safeCoding(example.coding) && Object.keys(example.coding).length > 0 && !containsProtectedInput(example)
   && Array.isArray(example.items) && example.items.length > 0 && example.items.every(item => typeof item === 'string')
   && example.correctedFields.every(field => fields.has(field)) && Number.isFinite(Date.parse(example.at)), 'coding_agent_example');
  sequences.add(example.sequence); refs(example.references);
  const review = get('codingReview', example.id), { outcome, purchasingChange, ...copy } = review;
  check(JSON.stringify(copy) === JSON.stringify(example) && outcome === (example.correctedFields.length ? 'corrected' : 'accepted') && purchasingChange === 'none', 'coding_agent_review');
 }
 for (const review of all('codingReview')) get('codingExample', review.id);
 for (const row of all('invoiceCoding')) {
  const example = get('codingExample', row.example), { example: ignored, ...copy } = row;
  check(example.targetKind === 'invoice' && row.id === example.target && JSON.stringify(copy) === JSON.stringify({ ...example, id: example.target }), 'coding_agent_invoice_coding');
 }
}
