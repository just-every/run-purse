# Company agents in Purse

Purse's procurement specialist uses one shared Base door at `/mcp`, with the
2025-11-25 and 2026-07-28 protocols. Discovery, canonical OAuth resource
metadata, signed company policy, person approval pages and `/agents` use the
same runtime. The runtime and `agent-surface.json` declare exactly `tools`,
`policy`, `pause`, `audit` and `idempotency`. Events, resources, prompts and
subscriptions are omitted: discovery does not advertise them, their catalogues
are empty, and calls return typed `capability_not_declared` refusals. Unknown
tools return typed `tool_not_found`. A signed company policy must answer every declared class before
an agent can act. Native sign-in, Origin checks and purchasing grants still
apply to the ordinary application.

The current declaration is deliberately bounded. It supports safe native
record inspection, supplier and catalogue maintenance, request drafts and
submission, independently authorized native decisions, PO conversion and issuance, physical receiving, supplied quotation recording and currency-separated comparison, invoice evidence capture, and editable source-bound preparations and proposed actions. It
**does not cover all native purchasing actions**. Company approval of a
proposal does not execute its proposed purchase. The sponsor must be the current designated approver or delegate for a native decision, and self approval is refused even when company policy is autonomous. Issuance is a separate explicit tool; conversion cannot smuggle an issue flag. There is no supplier send, payment, ledger post, protected-data reveal, erasure in this registry. Member grants, native policies and scoped delegation use the native administration actions and the access class. Target-only card,
provider and connector capabilities are not advertised.

| Tool | Classes | Native clauses |
| --- | --- | --- |
| `purse.suppliers.upsert` | standard | PUR-002, SUPPLIER-003, SUPPLIER-007 |
| `purse.catalogue.upsert` | standard | PUR-003, CATALOG-001 |
| `purse.requests.create` | standard | PUR-004, INTAKE-001 |
| `purse.requests.amend_draft` | standard | PUR-004 |
| `purse.quotes.record` | standard | PUR-005 |
| `purse.quotes.compare` | standard | PUR-005 |
| `purse.requests.submit` | standard | PUR-006 |
| `purse.requests.awaiting_decision` | standard, sensitive | PUR-007, PUR-017 |
| `purse.requests.decide` | standard for return/reject; money and commitment for approval | PUR-007, PUR-006 |
| `purse.orders.convert` | standard | PUR-008 |
| `purse.orders.issue` | money, commitment | PUR-009 |
| `purse.orders.position` | standard | PUR-010, PUR-017 |
| `purse.receipts.record` | standard | PUR-010 |
| `purse.invoices.capture` | standard | PUR-011, INVOICE-003 |
| `purse.preparations.create` | standard | AGENT-001, AGENT-002, AGENT-004, AGENT-009, AGENT-010 |
| `purse.preparations.edit` | standard | AGENT-010 |
| `purse.preparations.propose` | standard | AGENT-010 |
| `purse.business.configure` | standard | PUR-001 |
| `purse.members.set` | access | PUR-001, PUR-017 |
| `purse.policies.set` | access | PUR-006 |
| `purse.delegations.create`, `purse.delegations.revoke` | access | PUR-007 |
| `purse.requests.amend` | standard | PUR-004, PUR-009, PUR-016 |
| `purse.attachments.add` | standard | PUR-004 |
| `purse.overview.read` | sensitive | PUR-012, PUR-016, PUR-017 |
| `purse.files.read` | sensitive | PUR-004, PUR-014, PUR-017 |
| `purse.accounting.export` | sensitive | PUR-011, PUR-017 |
| `purse.preparations.execute` | standard; money and commitment for approval or issuance | PUR-014, PUR-006, PUR-007, PUR-008, PUR-009, PUR-010 |
| `purse.spend.answer` | sensitive | AGENT-011, PUR-014 |
| `purse.coding.prepare` | sensitive | AGENT-008, PUR-014 |
| `purse.agents.prepare` | sensitive | PUR-014, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006 |
| `purse.agents.advance` | sensitive, external when native mail is due | PUR-014, AGENT-003, AGENT-005, AGENT-006, AGENT-010, PO-003 |
| `purse.workspace.snapshot` | standard | PUR-017, AUDIT-001 |
| `purse.records.list`, `purse.records.read` | standard, sensitive | PUR-017, SECURITY-001 |

All mutations require `purchasing:write`; purchasing reads require
`purchasing:read`. Scope
never supplies a missing native purchasing grant. Classification, native targets, revisions and approval summaries enforce the same current native grants before disclosing record facts. Money and commitment facts and summaries retain exact native minor currency units. A receipt carries its current native receiving-position revision. Approval summaries name exact lines and quantities; invoice summaries total their proposed allocations. Issuing any member of a native supplier group classifies the complete group value and summarizes every affected payee and item, retains every affected order and internal change. Mutations call Purse's native
command service and final D1 transaction. The transaction checks the native
operator version and purchasing revision, the exact policy envelope, local
Pause and agent/consent revocation. Native writes also bind the immutable door
operation id to its retained sponsor, agent and admitted policy revision, so
a later policy cannot authorize a previously admitted write. A concurrent change refuses the write.
Native audit retains the agent as preparer and the native person as sponsor;
company approvers are recorded separately from native purchasing decisions.

Public resources are undeclared. Twelve internal visibility readers remain for
request, supplier, catalogue, order, receipt, invoice, agreement, policy (budget),
agentRun, revision, proposedAction and quote, using `purse://<kind>/{id}`. They support
native visibility and internal audit; CORE does not expose resource links or
`resources/read`. Use the argument-taking `purse.records.list` and
`purse.records.read` tools for policy-controlled inspection instead. Their
current native field projection excludes protected supplier values and bearer
credentials; personal purchasing fields carry `sensitive`. Imported text is
untrusted. No provider cost is registered; the journey declares
`spend: {none:true}`.

Business `owner_id` resolves to the native bootstrap owner. Team `id` resolves
only through Business's durable native operator binding; email in a token never
selects a person. Business admin maps to native operator admin and Business
policy editor; Business member has no policy role. Neither receives purchasing
grants automatically. A locally promoted operator admin is not a Business
editor. Native membership, active status and admission are re-read. The native requester
fixture promotes a member through the real operator role route, signs in again
through captured native mail, and proves purchasing access succeeds (200) while
Business editor audit access remains refused (403). Existing
SDK, supplier, device and integration bearer credentials retain their original
purposes and are not accepted as company agent credentials.

The owner lifecycle remains the manifest's setup-token mode: native
`POST /auth/bootstrap`. The disposable verifier calls that exact lifecycle and
native purchasing HTTP services. Its only additional provider edge is the
public Commerce CSL CSV download at `https://data.trade.gov`; it validates the
exact method and path and supplies synthetic CSL rows to the real native screening
parser. Scheduled mail uses the existing native adapter with a synthetic network edge
in conformance. No payment, external model or ledger edge is reachable.

Structured protected fields are refused during classification, before a pending
approval or review can retain them. The native conformance fixture additionally proves one-effect preparation, order issue, receipt and invoice replay, changed-argument conflicts, stale native versions and receiving positions, unchanged witnesses on self approval refusal, ignored caller authority flags, current native target identity, and matching native activity and door audit. Its independent requester joins through the real membership, invitation, accepted mail and confirmation lifecycle. The decision history and request thread show the agent for its sponsor; company approvers remain separately named.

The additive migrations are 0042 (Business settings), 0043 (Business person
bindings) and 0044 (agent door). Runtime modules and the CLI are pinned to Base
`2135c394939f4a737adabdc8003b0e667b31ac5a`, released as rer 0.2.91. Existing
applied migrations are unchanged. `agent-surface.json` is the executable
conformance declaration used by normal `rer verify`; its fixtures use only
public native doors and the declared network edge. The production Worker keeps
public health and the unclaimed lobby usable before setup; native team-service
construction is deferred until a signed synchronization actually needs it.

The specialist job is to inspect current scoped purchasing records, retain
source references and prepare editable requests or preparations. Treat supplier
text as data and report missing facts and native refusals. Separate decision,
conversion, issue, receipt and invoice tools require their current native
authority. A draft never establishes payment, supplier sending or approval.
There is no advertised MCP prompt family in this CORE declaration.

The declaration contains 35 tools, no public resource templates, and the
standard, sensitive, access, money, commitment and external classes. Its 48 journey steps retain
every declared tool/class pair, autonomous and held policy, injection variants,
read-only witnesses, replay/conflicts and native attribution. The pending-decision
reader returns only requests the current sponsor can decide; its empty bounded
view is standard. The receiving-position reader returns native quantities without
supplier contacts. JSON results use native HTTP serialization.

The separate ct proposal at
`36f0d9c9f9984ebecc95a201462367df15fb2420` remains unjudged and is not merged.
Its 116 proposed capability names, nine proposed resource URI shapes and wider
seeded week remain outside this declared registry. No proposed tool name matches
the current 35 names exactly; current tools cover bounded parts of the same
native purchasing clauses, rather than aliases for the broad proposed verbs.
The wider ct classes accounts, gated, security and destructive are not claimed.
Native supplier follow-up and exception reports are bounded adapters; approved-bill
posting, returned payments and live provider qualification remain unproved.
SURFACE-001–013 are absent from current main and are not invented here;
The Base-delivered clauses remain partial with the explicit family and registry gaps; main's existing native AGENT-010 judgment is preserved. The ct head
defines AGENT-001–011, with no AGENT-012 or AGENT-013 to cite. Its split
ACCESS-004/005, INTAKE-009/010, SUPPLIER-009, PO-013–018, CONTRACT-002/003
and SECURITY-002–004 are absent as standalone current-main clauses. Its broader
not-tool dispositions for PUR-016/017 and IMPORT-004 remain a ct delta. Existing
personal-field sensitivity also does not prove ct’s protected tax/bank/card
reveal semantics; those values are excluded from this registry.

Events/handoffs, resources, prompts and subscriptions are explicitly undeclared.
Multiple Business sponsors, resource refresh, timed/dual-host lifecycle,
queued continuation, broader administration and provider spend remain outside
this Core registry. CORE
does not prove or refuse those families as a whole. Native bootstrap, named
approvals, owner-bound credentials, current authority and consent revocation
remain mandatory. Existing native agents retain their governance and human consent in addition
to company admission. Their manual and scheduled adapters use the same registry. The omitted
resource family does not claim the former resource admission/projection races
proved. Provider spend caps are unenforced.

Supplied quotations use `purse.quotes.record` and `purse.quotes.compare`.
Recording calls the quotation form's native `quote` command and requires its
current `request.edit` grant on both the request and the supplied lines. The
request revision is required by the tool and carried by the native form; stale
revisions refuse before a company approval can retain the proposed input.
Freight, tax, delivery and conditions are explicit values or `null`. Zero is a
supplied amount, while `null` remains missing. Lines retain native integer minor
units and decimal quantities, with exact source evidence and request revision.
The comparison uses the current native visible quotation projection, preserving
all visible revisions and RFQ versions in separate currency groups. It performs
no conversion, winner selection or purchasing action. Both tools mark source
text untrusted. Recording is a standard internal write; comparison is a standard
read. Neither is destructive or external, and no money or commitment is created.

Native target attribution binds a recording to its request. The retained quote
and native audit identify the agent and sponsoring person; a company approver
is recorded separately. Completed replay rechecks current native authority and
returns the original attributed quotation without a second write. Concurrent
identical captures likewise produce one quotation. Native authority is checked
before classification and pending approval, then again at actual execution.
The transport journey in `tests/agent-door-quotes.mjs` exercises autonomous,
review, approval and blocked policy, stale input and pending state, unauthorized
reads and writes, revoked consent and membership, erasure and once-only replay.
The production journey and browser proof in `tests/agent-door-journey.mjs` and
`tests/agent-door-browser.mjs` independently compare native HTTP, web and MCP
quotation state and native audit events. These tools do not submit a request,
award a quotation, issue a PO or send to a supplier. The declared tool metadata and supported non-tool reasons cover all published
Core jobs; both the harness and first-party check reject a missing Core id.

The added Core tools call the existing native handlers. Setup, policy, member
and delegation input is validated on an isolated native state before a company
approval can retain it; actual execution rechecks the same handlers and the
native transaction. Grant or delegation widening that targets the sponsor is
refused by the shared door. Native owner restrictions remain mandatory.
Amendments retain old issued terms and need renewed purchasing approval.
Attachment downloads preserve exact original bytes and current record access;
erased originals remain unavailable. Accounting CSV is the native scoped
export, with no ledger posting or payment. Native HTTP refusals now include the
same stable code as their MCP counterpart while retaining the native message.
Current human preparation proposals execute through `purse.preparations.execute`.
The exact stored action and target determine native authority and risk, including
combined conversion and issue. Generated source reports retain their own human
review actions. Source changes, self-approval and consumed proposals are refused;
a successful replay returns the retained result once under current authority.

Native spend questions and coding reports use these same tools through embedded
invocation after company or local policy is configured. Native HTTP selects the
signed-in sponsor; source arguments cannot select an identity or grants.
Unpaired installations keep their existing native governance. A removed,
expired or paused configured policy cannot fall back to that legacy path.
Approval policy retains a pending action in Agents and leaves native state alone;
review and autonomous policy run under both company and native controls.

Native erasure now removes matching personal data from company tool replay
results, approvals, reviews, audit evidence and agent identity labels. Affected
pending approvals expire, erased sponsors are revoked, and replay claims remain.
The source preparation tool now covers the remaining existing native quotation,
clarification, invoice exception, late-order, value and recurring research jobs.
Native HTTP selects each job from its existing operation; a source argument
cannot choose a different executor. Generated reports keep their native source
checks, per-type controls, human review actions and model and provider none.

Scheduled supplier follow-up uses the same advance tool from MCP, the native
HTTP action and Cron. The recorded buyer or owner remains its sponsor. Exact
schedule and source versions bind the pending action, and caller-supplied future
time is refused by the transport. The native once-only event claim includes the
company admission fence in its D1 predicate; the mail edge rechecks it before
sending. Native limits, consent and honest provider outcomes remain required.
Requester value check-ins and owner-sponsored recurring discovery use that
same tool. Value mail preserves the native 30-day and 90-day once-only claims;
blocked intervals do not backfill after policy resumes. Recurring research
creates only native in-app proposals for currently authorized recipients. It
changes no purchase, consent or commitment. Every scheduled result retains its
company admission and native agent attribution. Late provider responses cannot
restore erased identity data, and replay cannot restore execution authority.
