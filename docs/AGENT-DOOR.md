# Company agents in Purse

Purse's procurement specialist uses one shared Base door at `/mcp`, with the
2025-11-25 and 2026-07-28 protocols. Discovery, canonical OAuth resource
metadata, signed company policy, person approval pages and `/agents` use the
same runtime. A signed company policy must answer every declared class before
an agent can act. Native sign-in, Origin checks and purchasing grants still
apply to the ordinary application.

The current declaration is deliberately bounded. It supports safe native
record inspection, supplier and catalogue maintenance, request drafts and
submission, and editable source-bound preparations and proposed actions. It
**does not cover all native purchasing actions**. Company approval of a
proposal does not execute its proposed purchase. There is no delegated native
approval, PO conversion/issue, receiving, invoice capture, supplier send,
payment, ledger post, protected-data reveal, erasure or grant administration in
this registry. Those remain their existing native doors. Target-only card,
provider and connector capabilities are not advertised.

| Tool | Classes | Native clauses |
| --- | --- | --- |
| `purse.suppliers.upsert` | standard | PUR-002, SUPPLIER-003, SUPPLIER-007 |
| `purse.catalogue.upsert` | standard | PUR-003, CATALOG-001 |
| `purse.requests.create` | standard | PUR-004, INTAKE-001 |
| `purse.requests.amend_draft` | standard | PUR-004 |
| `purse.requests.submit` | standard | PUR-006 |
| `purse.preparations.create` | standard | AGENT-001, AGENT-002, AGENT-004, AGENT-009, AGENT-010 |
| `purse.preparations.edit` | standard | AGENT-010 |
| `purse.preparations.propose` | standard | AGENT-010 |
| `purse.workspace.snapshot` | standard | PUR-017, AUDIT-001 |
| `purse.records.list`, `purse.records.read` | standard, sensitive | PUR-017, SECURITY-001 |
| `purse.events.list` (Base transport) | standard | BASE-AGENT-010 |

All mutations require `purchasing:write`; purchasing reads require
`purchasing:read`. The inherited event reader requires `events:read`. Scope
never supplies a missing native purchasing grant. Mutations call Purse's native
command service and final D1 transaction. The transaction checks the native
operator version and purchasing revision, the exact policy envelope, local
Pause and agent/consent revocation. A concurrent change refuses the write.
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
approval or review can retain them. The native conformance fixture additionally
proves one-effect replay, changed-argument conflict and stale native versions.

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
