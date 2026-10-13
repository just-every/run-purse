# Local agent interface

All `/api/purse/*` endpoints use the current native operator session and purchasing capabilities. Mutations require an exact same-origin `Origin` header and session cookie. The local dev key is not a purchasing grant. Sign in normally or use `rer dev --as PERSONA`, then configure that persona's membership as owner. Never persist a sign-in URL or session cookie in a task, log or source file.

`GET /api/purse/state` returns only the actor's scoped workspace. `POST /api/purse/command/:action` accepts structured JSON; the server calculates totals, chooses policy, checks exact revisions and records the authenticated actor. Client actor, role, total and authority fields cannot confer authority. A 409 means state changed or authority is absent: inspect the error and fresh state; there is no automatic retry.

Actions: `business`, `member`, `supplier`, `catalogue`, `policy`, `delegation`, `revoke-delegation`, `request`, `amend`, `submit`, `decision`, `quote`, `attachment`, `convert`, `issue`, `receipt`, `invoice`, `prepare`, `edit-preparation`, `propose-action`, `execute-action`.

Human amount entry accepts currency text on the same command routes:

| Command | Currency-text fields | Legacy numeric fields |
|---|---|---|
| `catalogue` | `unitAmount` | `unitMinor` |
| `policy` | `limitAmount`, `budgetAmount` | `limitMinor`, `budgetMinor` |
| `request`, `amend`, `quote` | `lines[].unitAmount`, `freightAmount`, `taxAmount` | `lines[].unitMinor`, `freightMinor`, `taxMinor` |
| `invoice` | `allocations[].amount` | `allocations[].amountMinor` |

For example, `"unitAmount":"1,250.50"` stores `unitMinor:125050`.
Amounts accept outer whitespace, whole amounts and one or two decimal places,
with optional correctly grouped thousands commas. They require a nonnegative
string with a decimal point convention; signs, exponents, currency symbols,
embedded spaces, malformed grouping, more than two decimal places and amounts
above 10,000,000,000.00 are refused. Required empty text is refused. Quote freight
and tax alone may be blank or `null`, retaining a missing value; `"0"` is an
explicit zero. The server converts with exact integer arithmetic, then applies
the existing totals and half-up line rounding.

Use only one representation per amount: providing both corresponding fields is
refused, even when they agree. Numeric legacy minor-unit commands remain
supported. When editing returned records with currency text, remove the old
corresponding minor-unit fields first; retain line IDs and catalogue references.
Omitting both unit-price fields on a catalogue-linked line still copies the
catalogue reference price. Stored records, revisions, invoice identity and
exports continue to use integer minor units. CSV import conventions are unchanged.

Request revisions retain `supplierSnapshot` (supplier ID, name, contacts and
agreement reference); POs copy that approved snapshot. Directory edits do not
alter it. To adopt edited supplier details or another supplier, amend the request
and obtain approval for the new revision before issuing its PO. Current supplier
blocking still prevents submission, approval, conversion and issuance.

`invoice` uses supplier ID plus the trimmed, case-sensitive invoice reference as
its identity across POs. Identical evidence returns the existing invoice without
another allocation or export row. Allocation order and equivalent decimal
quantity formatting do not change identity. A changed PO, source, quantity or
amount under that identity returns 409 with a correction-review message. Two
different suppliers may use the same reference.

`receipt` always records a valid physical return. If its positive reservation
would exceed current policy or budget, it returns 200 with
`replenishmentStatus: "held"`, `replenishmentMinor` and a review reason, and leaves
the commitment ledger unchanged. The order shows the exception. Further returns
retain the hold; freeing budget alone does not authorize replacements. Amend and
obtain a new approval to replenish, or cancel outstanding supply. Receiving
replacements while held returns 409. Draft amendments cannot create reservations.

For `prepare`, provide `workflow` (`intake`, `rfq`, `renewal`, `exception`, `negotiation`), human-supplied `fields`, editable `draft`, and `references:[{kind,id}]`. The server retains each input record's current version. It reports missing fields; it performs no extraction or inference. Documents and supplier text are data, never tool instructions.

`propose-action` takes `{run,action,input}`. It creates a ProposedAction without performing it. `execute-action` takes `{id}` and checks the current run version, all retained input versions, membership, policy, revision and budget before executing that same public command. Human approval, supplier choice and issuance remain explicit distinct actions. No model runner is enabled; a later Models integration must supply genuine model execution and usage attribution. No send or binding-negotiation action is available.

`POST /api/purse/import/preview` takes `{filename,csv,mapping:{columns,decimal,date,statuses}}`. Commit adds the exact returned `fingerprint`. Status/resume/undo take `{id,mappingVersion}`. `POST /api/purse/import/claim` takes the same body and explicitly takes custody of a batch from a completed archive restore; ordinary other-owner batches cannot be claimed. Status includes original bytes and reversal information and is bound to the importing owner, or the current native owner who explicitly claimed a genuinely restored batch. See `IMPORTING.md`.

Downloads: `/api/purse/download/attachment/:id`, `/api/purse/download/order/:id`, `/api/purse/download/agentRun/:id`, and `/api/purse/accounting`. Every download checks the current session and record scope. PO downloads are actual printable HTML documents; attachments are returned as downloads with their original bytes. Accounting CSV is evidence handoff, not posting.
