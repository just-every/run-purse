# Company agents in Purse

Purse's procurement specialist uses one shared Base door at `/mcp`, with the
2025-11-25 and 2026-07-28 protocols. Discovery, canonical OAuth resource
metadata, signed company policy, person approval pages and `/agents` use the
same runtime. A signed company policy must answer every declared class before
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
| `purse.events.list` (Base transport) | standard | BASE-AGENT-010 |

All mutations require `purchasing:write`; purchasing reads require
`purchasing:read`. The inherited event reader requires `events:read`. Scope
never supplies a missing native purchasing grant. Classification, native targets, revisions and approval summaries enforce the same current native grants before disclosing record facts. Money and commitment facts and summaries retain exact native minor currency units. A receipt carries its current native receiving-position revision. Approval summaries name exact lines and quantities; invoice summaries total their proposed allocations. Issuing any member of a native supplier group classifies the complete group value and summarizes every affected payee and item, returns every order link and emits every order change. Mutations call Purse's native
command service and final D1 transaction. The transaction checks the native
operator version and purchasing revision, the exact policy envelope, local
Pause and agent/consent revocation. Native writes also bind the immutable door
operation id to its retained sponsor, agent and admitted policy revision, so
a later policy cannot authorize a previously admitted write. A concurrent change refuses the write.
Native audit retains the agent as preparer and the native person as sponsor;
company approvers are recorded separately from native purchasing decisions.

Resource templates are `purse://<kind>/{id}` for request, supplier, catalogue,
order, receipt, invoice, agreement, policy (budget), agentRun, revision and
proposedAction. They read the same current field and record projection as the
native workspace. Unknown and restricted records return the same absence.
Imported text is untrusted. Protected supplier values and bearer credentials
are excluded; personal purchasing fields carry `sensitive`. No provider cost
is registered, and the journey declares `spend: {none:true}`.

Business `owner_id` resolves to the native bootstrap owner. Team `id` resolves
only through Business's durable native operator binding; email in a token never
selects a person. Business admin maps to native operator admin and Business
policy editor; Business member has no policy role. Neither receives purchasing
grants automatically. A locally promoted operator admin is not a Business
editor. Native membership, active status and admission are re-read. Existing
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
`f96363bf919ea3e7ed1837daba6894810a50e4a6`, released as rer 0.2.86. Existing
applied migrations are unchanged. `agent-surface.json` is the executable
conformance declaration used by normal `rer verify`; its fixtures use only
public native doors and the declared network edge.

Specialist events/handoffs, subscriptions, multiple Business sponsors,
resource refresh, delegated existing scheduled agents, queued continuation and
provider spend are not declared. Base 0.2.86 still exposes its built-in event
reader and runs event assertions. This is inherited transport behavior, not a
claim that Purse's specialist event family or the wider ct seeded week is
complete. Native agent jobs retain their existing evidence and human consent
requirements until their own company-door adapters and journeys are added.

The declaration contains 19 tools including Base's inherited event reader, 11
resource templates, and the standard, sensitive, money and commitment classes.
The pending-decision reader returns only requests the current sponsor can decide;
its empty bounded view is standard. The receiving-position reader returns native
quantities without supplier contacts. Other purchasing records retain their
normal native field projection and computed sensitivity. JSON outputs use the
same serialization as the native HTTP door, including omission of optional
undefined view fields.

The separate ct proposal at
`36f0d9c9f9984ebecc95a201462367df15fb2420` remains unjudged and is not merged.
Its 116 planned capability names, nine proposed resource URI shapes and wider
seeded week are not a claim of this declared subset. In particular supplier
communications, paid providers, ledger posting, broad access/security changes
and the existing scheduled specialist executors need their own current-authority,
network-edge and conformance journeys. Existing native work keeps its native
governance; this adoption does not claim company policy covers those executors.
Base 0.2.86 still advertises resource subscriptions without a seed capability
selector; that inherited advertisement cannot establish an undeclared family.

Base 0.2.86's resource adapter omits originating consent and operation identity
from the resource context and returns the classified snapshot after a fresh
presence check. Atomic policy/consent and changed-field-projection races at that
shared resource boundary remain pending Base qualification. The seed does not
claim those races proved by its sequential resource journey.
