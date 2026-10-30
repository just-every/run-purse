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
submission, independently authorized native decisions, PO conversion and issuance, physical receiving, invoice evidence capture, and editable source-bound preparations and proposed actions. It
**does not cover all native purchasing actions**. Company approval of a
proposal does not execute its proposed purchase. The sponsor must be the current designated approver or delegate for a native decision, and self approval is refused even when company policy is autonomous. Issuance is a separate explicit tool; conversion cannot smuggle an issue flag. There is no supplier send, payment, ledger post, protected-data reveal, erasure or grant administration in this registry. Those remain their existing native doors. Target-only card,
provider and connector capabilities are not advertised.

| Tool | Classes | Native clauses |
| --- | --- | --- |
| `purse.suppliers.upsert` | standard | PUR-002, SUPPLIER-003, SUPPLIER-007 |
| `purse.catalogue.upsert` | standard | PUR-003, CATALOG-001 |
| `purse.requests.create` | standard | PUR-004, INTAKE-001 |
| `purse.requests.amend_draft` | standard | PUR-004 |
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

Public resources are undeclared. Eleven internal visibility readers remain for
request, supplier, catalogue, order, receipt, invoice, agreement, policy (budget),
agentRun, revision and proposedAction, using `purse://<kind>/{id}`. They support
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
exact method/path and supplies synthetic CSL rows to the real native screening
parser. No payments, OAuth, models, ledger or supplier-mail edge is reachable
from the declared tools. Existing native mail adapters remain unchanged.

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

The declaration contains 18 tools, no public resource templates, and the
standard, sensitive, money and commitment classes. Its 23 journey steps retain
every declared tool/class pair, autonomous and held policy, injection variants,
read-only witnesses, replay/conflicts and native attribution. The pending-decision
reader returns only requests the current sponsor can decide; its empty bounded
view is standard. The receiving-position reader returns native quantities without
supplier contacts. JSON results use native HTTP serialization.

The separate ct proposal at
`36f0d9c9f9984ebecc95a201462367df15fb2420` remains unjudged and is not merged.
Its 116 proposed capability names, nine proposed resource URI shapes and wider
seeded week remain outside this declared registry. No proposed tool name matches
the current 18 names exactly; current tools cover bounded parts of the same
native purchasing clauses, rather than aliases for the broad proposed verbs.
The ct classes external, accounts, gated, access, security and destructive are
not claimed. Its supplier chase, invoice-exception resolution, approved-bill
posting and returned-payment journey remain unproved through this door.
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
delegation of existing scheduled agents, queued continuation, owner-native
administration and provider spend remain unscoped by Base's first subset. CORE
does not prove or refuse those families as a whole. Native bootstrap, named
approvals, owner-bound credentials, current authority and consent revocation
remain mandatory. Existing native agent jobs retain their governance and human
consent until their own company-door adapters and journeys exist. The omitted
resource family does not claim the former resource admission/projection races
proved. Provider spend caps are unenforced.
