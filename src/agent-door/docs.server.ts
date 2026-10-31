import type { AgentDoorOptions } from '../modules/agent-door/index.ts'
import { registry, describeTool } from '../modules/agent-door/registry.ts'
import { capabilitySet, offers } from '../modules/agent-door/capabilities.mjs'
import { pageStyle } from '../modules/agent-door/page-style.ts'
import surface from '../../agent-surface.json'

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

// This is a projection of the same runtime registry, including its reserved
// schema arguments. It never invokes an action or reads installation records.
export function agentDocumentation(options: AgentDoorOptions) {
  const tools = registry(options).map(tool => ({
    ...describeTool(tool), job: tool.name.split('.')[1], scope: tool.scope,
    classes: tool.classes.map(cls => ({ class: cls, evidence: surface.journey
      .filter(step => step.tool === tool.name && step.expect.some(item => item.class === cls))
      .map(step => ({ fixture: './agent-surface.json', step: step.id,
        journey: './tests/agent-door-journey.mjs',
        assertions: ['autonomous', 'held'].map(policy => `BASE-AGENT-006.2.${policy}.${step.id}`),
      })) })),
  }))
  return {
    name: options.name, specialist: options.specialist, endpoint: '/mcp',
    capabilities: capabilitySet(options.capabilities), tools,
    resources: offers(options.capabilities, 'resources') ? [...options.resources ?? []]
      .sort((a, b) => a.uriTemplate.localeCompare(b.uriTemplate))
      .map(({ read: _read, classify: _classify, ...resource }) => resource) : [],
    prompts: offers(options.capabilities, 'prompts') ? [...options.prompts ?? []]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ messages: _messages, ...prompt }) => prompt) : [],
    eventTypes: [] as string[],
    limits: options.limits!,
    errors: [
      ['HeaderMismatch', 'Required transport headers must agree with the request.'],
      ['UnsupportedProtocolVersion', 'Use a supported version returned by discovery.'],
      ['unauthenticated', 'Missing, expired, wrong-audience or revoked authority is refused with HTTP 401.'],
      ['insufficient_scope', 'HTTP 403 identifies the required scope.'],
      ['HTTP 413', 'A body exceeding the byte capacity is refused before execution.'],
      ['rate_limited', 'HTTP 429 carries Retry-After; wait before retrying.'],
      ['capability_not_declared', 'Resources, events and subscriptions are not offered by this edition.'],
      ['policy_unset', 'Complete policy setup at the returned setup URL before acting.'],
      ['policy_unavailable', 'Current company policy cannot be established.'],
      ['agents_paused', 'A current owner has paused agent execution.'],
      ['policy_blocked', 'Company policy refuses the computed classes.'],
      ['approval_required', 'A person must use the supplied URL; modern calls return input_required.'],
      ['approval_rejected', 'The named person declined the saved action.'],
      ['approval_expired', 'The saved approval lapsed.'],
      ['approval_evidence_changed', 'Changed facts require fresh review.'],
      ['self_escalation', 'An agent cannot widen its own sponsoring authority.'],
      ['idempotency_key_required', 'A mutation needs a stable idempotency key.'],
      ['idempotency_conflict', 'The same key cannot name changed arguments.'],
      ['call_in_progress', 'This operation is already claimed; do not duplicate it.'],
      ['decision_busy', 'An overlapping policy admission is still in progress.'],
      ['revision_conflict', 'Reload the current revision before retrying.'],
      ['native_conflict', 'Native purchasing state or the receiving position changed.'],
      ['permission_denied', 'The sponsor lacks current native authority.'],
      ['not_found', 'The record is absent or outside the sponsor’s current projection.'],
      ['protected_input', 'Preparations refuse structured protected fields.'],
      ['invalid_arguments', 'Arguments must satisfy the current tool schema and native validation.'],
      ['output_invalid', 'The native result did not satisfy the declared output schema.'],
    ].map(([code, meaning]) => ({ code, meaning })),
  }
}

export function specialistInstructions(options: AgentDoorOptions): string {
  const docs = agentDocumentation(options)
  return `${docs.name}: tools for the ${docs.specialist} specialist. Act for the sponsoring person under their company policy; people decide approvals at the supplied URL. Documentation: ${options.origin}/docs/agents. Specialist jobs: ${docs.prompts.map(prompt => `${prompt.name}: ${prompt.description}`).join(' ')} Declared tools: ${docs.tools.map(tool => `${tool.name} (${tool.title})`).join('; ')}. Resource templates and event types: none declared.`
}

export function agentDocumentationResponse(request: Request, options: AgentDoorOptions): Response | null {
  const url = new URL(request.url)
  if (url.pathname !== '/docs/agents') return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  const docs = agentDocumentation(options)
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
  if (url.searchParams.get('format') === 'json') return new Response(request.method === 'HEAD' ? null : JSON.stringify(docs), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } })
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const tools = [...new Set(docs.tools.map(tool => tool.job))].map(job => `<section aria-labelledby="job-${escape(job)}"><h2 id="job-${escape(job)}">${escape(job)}</h2>${docs.tools.filter(tool => tool.job === job).map(tool => `<article data-tool="${escape(tool.name)}"><h3>${escape(tool.title)}</h3><p><code>${escape(tool.name)}</code></p><p>${escape(tool.description)}</p><dl class="fields"><div><dt>Scope</dt><dd>${escape(tool.scope)}</dd></div><div><dt>Classes and proof</dt><dd>${tool.classes.map(cls => `<p data-class="${escape(cls.class)}"><strong>${escape(cls.class)}</strong>: ${cls.evidence.map(proof => `${escape(proof.journey)} — fixture ${escape(proof.step)} in ${escape(proof.fixture)}; ${proof.assertions.map(escape).join(', ')}`).join('; ') || 'Unproved'}</p>`).join('')}</dd></div><div><dt>Contract clauses</dt><dd>${tool._meta['com.runeditrun/clauses'].map(escape).join(', ')}</dd></div></dl><details><summary>Input and output schemas</summary><pre>${escape(JSON.stringify({ input: tool.inputSchema, output: tool.outputSchema }, null, 2))}</pre></details></article>`).join('')}</section>`).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent documentation · ${escape(docs.name)}</title><style nonce="${nonce}">${pageStyle}article{margin-block:24px}article+article{padding-top:24px}code{font-size:inherit;overflow-wrap:anywhere}dd p{margin-top:0}</style><link rel="stylesheet" href="/rer-theme.css"></head><body><a class="skip" href="#main">Skip to content</a><header><a href="/app">${escape(docs.name)}</a><nav aria-label="Main"><a href="/agents">Agents</a><a href="?format=json">Registry JSON</a></nav></header><main id="main"><h1>Agent documentation</h1><p>Specialist: <strong>${escape(docs.specialist)}</strong>. Endpoint: <code>${escape(docs.endpoint)}</code>.</p><p>Generated from the live action registry. Current native grants and company policy govern every action. Prompts provide instructions; they grant no authority and execute no purchasing.</p><nav aria-label="Documentation"><a href="#jobs">Specialist jobs</a><a href="#resources">Resources and events</a><a href="#capacity">Capacity</a><a href="#errors">Errors</a></nav><section id="jobs"><h2>Specialist jobs</h2>${docs.prompts.map(prompt => `<article data-prompt="${escape(prompt.name)}"><h3>${escape(prompt.title)}</h3><p><code>${escape(prompt.name)}</code></p><p>${escape(prompt.description)}</p></article>`).join('')}<p>Retrieve instructions with the MCP prompts list and get methods. Prompt arguments are unused. Preparation stays editable and separate from submission, approval, issuance, supplier sending and payment.</p></section>${tools}<section id="resources"><h2>Resources and events</h2><p>Resource templates: ${docs.resources.length ? docs.resources.map(resource => escape(resource.uriTemplate)).join(', ') : 'none declared'}.</p><p>Event types: none declared. Subscriptions are undeclared. Internal visibility readers and changed-record URIs do not establish a public resource or event family.</p><p>Full stranger-agent completion and conformance across every BASE-AGENT-001–012 duty remain unproved. The broader purchasing registry, provider spend and unscoped lifecycle families remain outside this declaration. Existing account, prerequisite and gate-loop holds remain unchanged.</p></section><section id="capacity"><h2>Capacity</h2><dl class="fields"><div><dt>Requests per minute</dt><dd data-limit="requestsPerMinute">${docs.limits.requestsPerMinute} per agent</dd></div><div><dt>Maximum body bytes</dt><dd data-limit="maxBodyBytes">${docs.limits.maxBodyBytes}</dd></div></dl><p>These installation limits protect request rate and size. Company policy controls business volume. Paid-provider spend caps are not enforced; these tools incur no provider spend.</p></section><section id="errors"><h2>Errors</h2><p>Transport failures use HTTP and JSON-RPC errors. Tool refusals carry a stable code in the result error metadata. Foreign origins are refused with HTTP 403. A successful prompt read never completes an approval.</p><dl class="fields">${docs.errors.map(error => `<div><dt><code>${escape(error.code)}</code></dt><dd>${escape(error.meaning)}</dd></div>`).join('')}</dl></section></main></body></html>`
  return new Response(request.method === 'HEAD' ? null : html, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'none'; style-src 'self' 'nonce-${nonce}'; font-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` } })
}
