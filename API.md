# Local agent interface

Except INTAKE-007’s dedicated bearer create-request door and INTAKE-008’s read-only PO-data door below, `/api/purse/*` endpoints use the current native operator session and purchasing capabilities. Mutations require an exact same-origin `Origin` header and session cookie. The local dev key is not a purchasing grant. Sign in normally or use `rer dev --as PERSONA`, then configure that persona's membership as owner. Never persist a sign-in URL or session cookie in a task, log or source file.

`GET /api/purse/state` returns only the actor's scoped workspace. Its `people` list carries active members' names, emails and capabilities to owners, approvers, buyers and receivers (a requester sees only their own), so the request thread can name requesters and deciders. `POST /api/purse/command/:action` accepts structured JSON; the server calculates totals, chooses policy, checks exact revisions and records the authenticated actor. Client actor, role, total and authority fields cannot confer authority. A 409 means state changed or authority is absent: inspect the error and fresh state; there is no automatic retry.

Actions: `business`, `member`, `supplier`, `catalogue`, `stockroom-item`, `stockroom-count`, `policy`, `delegation`, `revoke-delegation`, `request`, `amend`, `submit`, `decision`, `quote`, `attachment`, `convert`, `issue`, `close-order`, `reopen-order`, `receipt`, `invoice`, `prepare`, `edit-preparation`, `propose-action`, `execute-action`.

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

## Stockroom replenishment (STOCK-001)

A buyer configures `stockroom-item` with `{name,catalogue,location,costCentre,project,reorderPoint,replenishTo,needDate,terms}`; the catalog item must be approved and its supplier preferred. `stockroom-count` takes `{id,count,needDate?}`. Counts and reorder quantities use decimal strings with up to three places; counts may be zero. Below the reorder point, the command creates a normal request draft for `replenishTo - count` at the current catalog price. Repeated counts reuse the outstanding request until fulfillment or cancellation. The native owner reviews and submits it through the ordinary `submit` door; no count submits or approves a request.

Pier remains the warehouse inventory system. A Pier operator can send a replenishment need through the same authenticated `POST /api/purse/command/request` door: supply a title, preferred supplier ID, currency, needDate, configured location and costCentre, supplier terms, and `lines:[{catalogue,quantity,project}]`. This creates a draft under the current requester's identity, for human review and submission. It uses a current native session and same-origin request; scoped connector keys remain API-001's unfinished work.

## Manual PO closure (PO-010)

`close-order` takes `{id,version,reason,line?,quantity?}`. The `version` is the order's `closureVersion` (zero before any closure). Omit line and quantity to close every outstanding balance, select a line to close it, or include its quantity to close part of that line. A buyer and a reason are required. Closure retains supplier issuance, records local closed quantities separately from cancellations, releases the remaining commitment and removes closed quantities from receiving and overdue eligibility; it sends no supplier message. New invoice evidence exceeding a closed balance is saved with `status:"exception"` and a visible closed-balance reason. MATCH-002's broader assignment/resolution workflow remains unfinished.

`reopen-order` takes `{id,version,reason,closure?}`. Omit `closure` to reopen all active balances or choose one ID from `data.orderClosure`. It rechecks native buyer access, current exact-revision approval, supplier eligibility and available budget. It reserves only the newly reopened remainder; stale or competing commands return 409 without changes. Both events retain actor, time and reason in audit history. Reopen existing balances before amending a request.

## Restricted-party screening (SUPPLIER-007)

`supplier` saves an optional `address` and screens new suppliers and changes to name or address against OFAC SDN primary names, aliases and addresses in the Commerce Department’s public Consolidated Screening List (CSL). It retains each result, the matched entry IDs, the CSL source’s Last-Modified date and SHA-256. A possible match saves the supplier as `pending_review`; requesting active or preferred status cannot bypass the hold. An unavailable, empty or malformed list refuses the save without writes.

`screen-supplier` takes `{id}` to fetch a fresh list and retain another result. `review-screening` is owner-only and takes `{id,screening,decision:"clear"|"confirmed",reason}` against the latest pending result. Clearing records a reasoned false-positive review and activates the requested status; confirming blocks the supplier. A name or address edit or rescreen creates a new review when it matches. Supplier details and screening evidence supplied by clients cannot override retained results.

Imported historical supplier status is retained as source evidence, but the supplier stays pending until screened; unscreened legacy suppliers also cannot enter native purchasing. Screening and compliance review are available on Suppliers. This name/address candidate check identifies possible matches for human review; it is not a legal determination.

## Supplier performance (SUPPLIER-005)

Buyer state includes `supplierScorecards`, each with delivery, quality, invoice accuracy, acknowledgment, currency-separated issued PO and invoice evidence figures, and issues. Every measure includes the exact contributing PO, receipt, invoice, communication or issue records. Unknown promises and acknowledgments are explicit and excluded from the measured denominator. Delivery compares each accepted receipt's recorded UTC date with the current recorded supplier promise. Invoice accuracy counts exception invoices once, even with multiple discrepant allocations. Issued PO face values exclude superseded amendments; invoice evidence is not a paid or approved-bill total.

`supplier-order-evidence` takes `{order,version,promisedDate,acknowledgedAt?,source}`. A buyer records actual supplier communication on an issued native PO, with an ISO acknowledgment timestamp including its time zone when known. Acknowledgments must fall between issuance and now. The exact current version is required (zero initially); edits retain the full prior history. Issuance alone does not create an acknowledgment.

`supplier-issue` takes `{supplier,order,category,description}`, with category `late`, `damaged`, `wrong-item` or `billing`. `resolve-supplier-issue` takes `{id,reason}` and retains the resolving buyer and time. The Suppliers page exposes every figure's source rows, communication history, issue creation and reasoned resolution. Only buyers can read scorecards or edit these records. Complete archive restore retains and validates communication and issue links.

## CATALOG-001 catalog and bundle requests

Buyer commands `catalogue` and `catalogue-bundle` maintain items and bundles. An item accepts `partNumber`, `unit`, optional inclusive `validFrom`/`validUntil` dates, category/project/location/costCentre defaults, and `requiredAttachments` (exact filenames uploaded to the request before submission). Price dates use America/New_York. Bundles hold `items: [{catalogue, quantity}]`, with ordinary decimal quantities.

Both accept `access: {departments: [], locations: [], entities: [], roles: []}`. Empty dimensions are unrestricted; any value within each restricted dimension must match and all dimensions must match. Only the owner can set a saved active member's `catalogue-grant` (`email`, `departments`, `locations`, `entities`); roles come from current purchasing membership. Entity labels here govern catalog access; they do not create legal entities or ledger mappings. Buyers may maintain all records; `requestable` states whether the current actor may request them. Non-buyers receive only currently available items and bundles whose every component they can access.

`request-bundle` accepts `bundle`, optional `title`, `needDate`, `location`, `costCentre`, optional `project` (otherwise each item's default), and `terms`. It atomically returns `{bundle, requests}` with one native draft per supplier/currency. It does not submit or approve. The ordinary `request`, `amend` and `submit` doors enforce catalog access; a buyer amending someone else's draft uses that requester's current grants. Body-supplied roles or locations never grant membership.

## SUPPLIER-003 duplicates and merges

A buyer calls `supplier-duplicates` with the supplier fields and optional `matching: {tin, bankRouting, bankAccount}` companion inputs. It returns possible matches/reasons and a review fingerprint, never sensitive values or their HMACs. A new `supplier` with matches requires that current `duplicateFingerprint` plus `duplicateReason`. Blank matching fields preserve existing matching-only evidence. Only keyed match evidence is retained; ordinary supplier state exposes `matchingOnly` booleans. The private matching key is generated during business setup, or initialized explicitly through `supplier-matching-setup` for an upgraded workspace. It travels only in the owner's private archive.

`preview-supplier-merge` accepts `source` and `target`; `merge-suppliers` requires those IDs, the returned current `fingerprint`, and `reason`. Both need the current buyer capability and refuse active compliance/blocking holds. The source remains as a nonpurchasable alias, both histories appear in buyer-only `supplierFamilies`, and original approved/issued identities and all source links remain intact. Source drafts and approvals need a normal amendment/reapproval to the surviving supplier. Issued receiving/invoice history remains usable, and invoice-reference checks cover the whole family.

CSV import accepts sensitive matching columns and redacts their stored original cells under the named SUPPLIER-003/PUR-013 custody exception; see IMPORTING.md. Full values, HMACs and original sensitive-file digests never enter ordinary state or documents; file digests remain in owner-bound import custody.


## Supplier document expiry (SUPPLIER-004)

Buyer commands `supplier-document` and `review-supplier-document` retain typed supplier evidence, an inclusive expiry date in America/New_York, required-for-new-PO status, whole-day reminder offsets and an optional compliance refresh cycle. `supplier-document` takes `{supplier,type,attachment,expires,required,reminderDays,refreshEveryDays?,version}` (plus `id` to edit); types are `insurance`, `w9`, `license`, `security-review` and `agreement`. Existing documents require their exact current version. `review-supplier-document` takes `{id,version,attachment,expires}`. Every prior metadata/attachment version stays in history; a schedule-only edit does not restart the compliance cycle.

Hourly cron processes due reminders, or a buyer can POST `{}` to `/api/purse/supplier-reminders`. The latest due expiry offset is processed once per document version, and a due compliance cycle requests refresh. Supplier and configured owner outcomes are retained separately. Provider acceptance is not mailbox delivery; development mail is silently suppressed. An interrupted or uncertain attempt is retained without an automatic resend. New conversion and issuance check required lapses; existing issued receipts and invoice evidence remain usable. Supplier status, screening and manual blocks are retained independently.

Compliance attachments use the ordinary `attachment` command with `kind:"supplier"` and `privateSupplierDocument:true`, stored atomically with the bytes. Only buyers/owners receive their metadata or downloads; `supplier-document` accepts only this private evidence. The public refresh branch, `GET/POST /api/purse/supplier-refresh/:token`, reads no previous data and consumes a version-bound seven-day link on one successful upload. Its submission remains pending until `review-supplier-document` includes the `submission` ID. A document review invalidates prior-version links. Links are installation authority excluded from portable archives.

A buyer POSTs `{id: documentId}` to `/api/purse/supplier-document-refresh` to explicitly request a new link. The response includes that buyer's private `refreshUrl` for sharing with the supplier; ordinary state and archives never contain the token. The surviving supplier's current first contact receives family document reminders after a merge; original document/file ownership remains intact. The Suppliers page exposes private uploads, refresh requests, pending reviews and history.


## Native supplier tax review (SUPPLIER-006)

The current native owner records `supplier-tax-review` on Suppliers after downloading and personally reviewing a private W-9 accepted through the supplier-document door. State exposes owner-only `supplierTax` views containing the exact `basis`, current decision `version` and available evidence descriptors. Submit `{supplier,version,basis,document,documentVersion,attachment,sha256,reviewed:true,eligibility,box,backupWithholding,reason}`. Eligibility is `eligible`, `ineligible` or `unknown`; an eligible decision requires a listed NEC or MISC box, and every other decision requires `box:null`. Backup withholding is `required`, `not-required` or `unknown`. Unknown never implies ineligible or not required. Structured TIN, bank and credential fields are refused; keep protected values in the private original, never the reason.

Every decision is retained with its actor, time, reason, exact W-9 version and SHA-256 original digest. A stale version, changed W-9 set, changed supplier identity or changed family refuses a captured review without writes. A merge preserves both histories and requires a fresh review of the surviving family; it never selects the favorable decision. New or withdrawn evidence makes the current result unknown until a new review. A pending supplier W-9 replacement also holds tax eligibility at unknown: the buyer must review the replacement before the owner can record a fresh tax judgment. Owner-only audit reads and CSV retain each tax decision and its binding; other purchasing roles receive no tax review data or audit snapshots.

Portable archives validate the full evidence graph and preserve decisions and originals as history. Current review authority is installation-local, excluded from archives and fenced by the reviewer's active native owner identity. A restored review remains unknown until the current owner reviews the original again. Erasure withdraws affected originals, anonymizes personal review history and retains the digest; an older backup cannot bypass the supplied later erasure journal. These judgments do not verify a TIN, qualify a bank, determine tax or legal eligibility, total payments, set ledger fields or file returns. The full payment and provider duties remain in the contract Gap.

## PO-003 supplier chasing

A buyer saves `order-chase-policy` with `{order,version,enabled,cadenceDays,maxChases,escalateTo}`. Versions start at zero on creation; a saved policy starts a new attempt limit and retains prior configuration. The escalation address must be an active buyer or the configuring owner's own address. Cadence days are elapsed 24-hour periods; delivery dates are inclusive in America/New_York. The hourly schedule checks missing acknowledgments and overdue current buyer-recorded supplier promises (otherwise the PO need date). `POST /api/purse/order-chases` processes currently due attempts as a buyer, using the real clock; it never changes the policy or resets its limit.

Attempt IDs are deterministic and retained before the real provider call. Each outcome is recorded, including suppressed local, rejected, unavailable and uncertain attempts; no claimed attempt is silently repeated. The final configured attempt triggers one buyer escalation. Chases use the immutable approved order contact and refuse adopted history, superseded/amended or closed POs, zero outstanding balances and current surviving-supplier/compliance holds. Native closure under PO-010 stops an active chase.

Scoped state exposes `orderChaseEvent` and `orderChaseEvidence` only for the actor's visible orders; buyer configuration remains in buyer-only `orderChasePolicy`. Replies and promises are explicitly labelled buyer-recorded evidence; issuance never implies acknowledgment. Policy versions, event evidence and outcomes survive portable archives. PO-001 and PO-002 inherit live acknowledgment and reply integration before shipping.

## PO-009 document profiles and PDF downloads

The owner saves a `po-profile` command before new PO conversion for each location
(and optionally each line category). Its version guards concurrent edits. The
Settings screen supplies legal name, PNG/JPEG bill-to logo, labelled bill-to and
ship-to names/addresses/attention, buyer contact, shipping terms, field labels,
printed purchase terms and original PDF terms/certificate. Each uploaded file is
at most 1 MB; this command alone accepts the combined three-file JSON envelope
(up to 4.1 MB). Ordinary commands retain their existing envelope limit.

`GET /api/purse/order-pdf/:id` downloads the real PDF using the same current
native-session record scope as `GET /api/purse/download/order/:id` (HTML). Both
use the immutable profile and supplier snapshot at conversion. The PDF appends
and embeds original terms/certificate bytes; HTML offers the same originals.
Profile edits affect future conversions only. Configured state-based certificate
selection is not tax validation. Deposit/prepayment text is not a deposit posting.
A missing profile refuses new conversion with the Settings repair path; historical
fields never recorded are labelled honestly.

## RECEIVE-001 responsible receiving

Buyers save `receipt-rule` with `{id?, version, order? , location, purchaseType, receiver, active, reason}`. Without a PO, select a location and/or the single shared line category (`*` is any). Scope is immutable; updating the same scope requires its current ID/version. PO > location+category > category > location > requester. A current receiver uses `reassign-receipt` for a PO and another active receiver. Reasons and history are retained. Explicit assignments restrict physical receipt writes; the owner can override with an audited reason. The default requester can record their own receipt, while existing receiver-capability members retain unassigned-PO receiving.

Scoped order state supplies `receiverAssignment`, `mayReceive` and `receiptVersion`. UI receipt submissions include `receiptVersion`; a changed order, assignment, membership or receipt position refuses stale confirmation. `GET /app?receipt=ID` only opens the signed-in PO. `receipt` remains the partial/full POST command. Invoice state supplies a live `receiptMatch`: Held for receipt, Matching exception or Ready for matching. Recording receipt clears only the receiving shortfall.

The hourly scheduler and buyer-only `POST /api/purse/receipt-prompts` process due dates and waiting invoices, claiming each order/receiver/reason/local day once. The installation timezone is set in business Settings and defaults to America/New_York. Mail contains PO number, due date and signed-in link only; `receiptPromptEvent` keeps actual provider results and an honest outcome. Closed/fully received/superseded orders are ineligible. Future tracking, channels, deposits and card payment inherit the obligations named in CONTRACT.md.

## SOURCE-002 quote reading and confirmation

`quote-extract` takes `{request,revision,attachment}` for a visible editable native draft. It reads original PDF/text/email bytes into a review, with source quotations/page/line and fixed match-confidence scores; missing fields remain blank. It refuses unsupported content explicitly. The requester may act on their own draft; buyers (including the owner) may act on visible drafts. Submitted/approved revisions cannot be changed by quote review.

For scans, images and any layout, `quote-reading-instructions` takes the same input and returns a source descriptor (attachment ID/revision/SHA-256/size/name/type/private URL), reading instructions, JSON schema and template. The person downloads the existing scoped original and gives it to their chosen reader; Purse neither sends it nor stores provider keys. `quote-reading-propose` accepts that exact descriptor, request/revision, declared reader `{provider,model,runReference}` and `fields`. Header fields are currency, freightAmount, taxAmount, leadTime, validity; each item has description, quantity, unitAmount, unit. A supplied field is `{value,confidence,page,excerpt}`; a missing field is `{value:null,confidence:0,page:null,excerpt:null}`. Reader execution and quotations are declared, not verified. This operation stores immutable proposed data only.

`quote-reading-edit` takes `{id,request,revision,version,changes:[{line?,field,value}]}` and retains every original/corrected value and actor. `quote-reading-confirm` requires exact source/request/review versions, a reason and one mapping per quoted line (`{id,requestLine}` or new-line category/project/unit). It creates the next draft through the ordinary request validation and does not submit, approve or issue anything. Unmatched lines and coding remain; confirmed header tax is apportioned across revised line values using the existing cent allocation. Originals, proposal, corrections, provenance and confirmed lead-time/validity survive archives and later amendments. Every scoped read/export retains the source links, and restore validates original digests. Limits and confidence semantics are stated in CONTRACT.md.


## INVOICE-002 private invoice reading

All reading commands require the current owner/buyer. `invoice-source` takes `{order,document:{name,mediaType,base64}}` and stages an exact original (up to 1 MB) without an invoice. `invoice-extract` and `invoice-reading-instructions` take `{source:id}`. The latter returns a private descriptor, schema and external-reader template; `invoice-reading-propose` takes that exact descriptor, declared reader and structured fields. Money remains decimal text, missing fields null with zero confidence. Each supplied field has confidence/page/quotation; remit keeps only safe payee/postal value and the original/page link. Raw bank/TIN fields or quotations are refused.

`invoice-reading-edit` takes `{id,version,changes:[{line?,field,value}]}`. `invoice-reading-confirm` takes `{id,version,reviewed:true,reason,lines:[{id,orderLine}],remit?:{bankRouting,bankAccount}}`. It requires complete exact reconciliation and current PO identity and records invoice evidence through INVOICE-003. Bank values are transient. Original/read/event state is buyer-only; originals from both current and earlier invoice doors now require owner/buyer download access. No reading grants approval or verification.


## SOURCE-001 supplier RFQs

Owner/buyer `rfq-create` takes `{request,revision,scope,suppliers:[id],questions:[text],deadline,reminderAt}`. Times are ISO instants with an explicit offset/UTC; deadline is within 30 days and reminder precedes it by at least an hour. Buyer POST `/api/purse/rfq/send` or `/api/purse/rfq/reissue` takes `{rfq,supplier}` and returns the current private response URL and actual outcome. Reissue revokes the old hash in the same transaction; expiry is exactly the RFQ deadline. Ordinary state never exposes tokens.

The no-account `/api/purse/rfq-link/:token` GET exposes only requirements/questions. POST accepts the native multipart form or JSON with enabled currency, explicit freight/tax, lead time, validity, conditions, one answer per question, exact source line IDs/descriptions/quantities/units/SKUs and unit prices. Up to three original files may each contain 10 MB (10,000,000 bytes), retained in private R2 storage; the bounded upload envelope allows 40.5 MB for base64 JSON overhead and quotation fields. Every response appends a new version; source text never runs as instructions. Responses and originals are owner/buyer-only; original downloads use `/api/purse/rfq-original/:response/:file`.

`rfq-award` takes `{rfq,revision,firstResponse,response,reason}`. Baseline is the first recorded offer in the awarded currency; the winner must be that supplier's latest exact response. The two may be the same offer. An immutable award and its real source quotes enter a new draft requiring ordinary approval. The hourly scheduler durably claims each before-deadline reminder once, records nonresponse and closes link authority at the deadline. Link capabilities are installation-local and excluded from archives; retained offers, files, histories and awards remain portable.


## INTAKE-004 email request intake

The owner saves `email-intake-config` with `{address}` and configures that exact receiving address in Resend. Point its signed `email.received` webhook at `/api/purse/email-intake/inbound`; supply the installation's private `EMAIL_INTAKE_WEBHOOK_SECRET` and `MAIL_API_KEY` deployment inputs. Saving the address does not configure or verify the provider mailbox. Raw signed bytes are checked before hydration at Resend's fixed API origin; attachment bytes come only from its validated CDN URLs. Provider email ID is the durable replay boundary, including uncertain attempts.

A current native requester or owner sender receives a link to `/app?intake=ID`, requiring native sign-in. The draft title is the subject; original body and attachments remain source evidence. No supplier, coding, amount or authority is invented. Other senders are held for the owner. Provider-reported From is not verified employee authorship. The owner assigns held mail using `email-intake-assign` `{id,version,requesterEmail,reason}`; only that current requester edits it with `email-intake-edit` `{id,version,title,body}` and completes it with `email-intake-complete` `{id,version,request:{ordinary request fields}}`. Completion creates one ordinary editable request draft, retaining the email source link; submission and approval remain separate ordinary actions.

`GET /api/purse/email-intake/:id` and `/api/purse/email-intake/:id/files/:file` require the owner or the currently assigned requester. File ID `original` downloads the exact hydrated provider JSON, honestly labelled as such rather than SMTP MIME. Up to three attachments of 10 MB each (30 MB decoded total), 500 kB combined text/HTML and 2 MB hydration JSON are accepted without truncation. Original metadata, bytes, holds, source/request links and provider receipts are portable; archived principal IDs never grant a current session. The owner reads stored/uncertain receipts at `/api/purse/email-intake-receipts`; uncertain ingestion and send attempts are not silently replayed. Draft-link mail records the actual adapter outcome, never mailbox delivery. Tests fake only the provider network edge; no provider sandbox or mailbox delivery is claimed.

## Integration purchase-request tokens (INTAKE-007)

In Settings, the native owner creates a named integration and binds it to one active native requester. Copy the secret once and keep it in the calling installation’s private configuration. Management uses native owner sessions and exact same-origin mutations: `GET /api/purse/integration-tokens` lists metadata and active native requesters; `POST /api/purse/integration-tokens` takes `{name,requesterEmail}`; `POST /api/purse/integration-tokens/:id/rotate` and `/revoke` take `{}`. Creation and rotation return `{token,integration}` once. Lists never return secrets or digests. Rotation ends the prior secret immediately; revocation ends the integration. To bind a different requester, revoke and create another integration.

`POST /api/purse/integration/requests` accepts `Authorization: Bearer <private token>` and `Idempotency-Key: <caller request identity>`, with the ordinary complete `request` JSON body described above. It returns `{request,duplicate:false}` for a new draft, or `{request,duplicate:true}` with the immutable original creation response for an identical replay. Key scope is the integration, surviving token rotation. Identity uses the exact UTF-8 JSON bytes: retain the same serialization when retrying. A changed body under the same key returns 409. Keys are 1–200 visible ASCII characters; bodies are limited to 1,600,000 bytes without truncation. Missing/invalid/revoked bearers return 401; inactive native/requester bindings return 403. The supplied cookie, requester/role/status/total fields and source prose cannot grant authority. No browser Origin is needed for a server caller; a supplied Origin must match this installation and cross-site browser calls are refused. Never put secrets in URLs or logs.

Linen ASSET-005 and Pier STOCK-001 can create ordinary drafts through this door. The bound requester reviews the draft in Requests and explicitly submits through the normal approval policy, as with INTAKE-004. The token cannot read records or originals, submit, approve, issue a PO, send mail, pay, execute preparations or manage credentials. Request validation is the same as the native request command; other requesters cannot see this requester’s draft. Only the digest is stored. Each draft records the token label and requester. Owner create/rotate/revoke, integration request creation and every refused use are audited with outcome/reason and recognized integration/requester where known, without bearer material; invalid or rotated secrets are recorded anonymously. Archives retain request/revision lineage and audit evidence, exclude token and replay-response tables, and require fresh owner issuance after restore. API-001 remains partial for broader API keys, PO reads, webhooks and provider automation.

## Purchasing search (SEARCH-001)

Open **Search** in the purchasing workspace, or `/app?search=1`. Search uses current native sessions and membership; create-request integration tokens cannot read it. `GET /api/purse/search/meta` returns the current search actor. `GET /api/purse/search` accepts:

- `q`: number fragments, case/punctuation-independent supplier or DBA, or readable text token prefixes. Multiple text tokens all match. `$1,234.56` or decimal currency text selects an exact integer minor-unit amount.
- `kind`: `request`, `order`, `invoice`, `receipt`, `supplier`, `catalogue`, `quoteReading`, `invoiceReading`, or `supplierDocument` (current supplier agreements); `id` selects an exact record inside that kind.
- `amountMin`, `amountMax`: inclusive decimal currency bounds; `currency` selects one three-letter currency. Unfiltered currencies remain labelled separate rows.
- `dateFrom`, `dateTo`: inclusive `YYYY-MM-DD` bounds; `requester`: exact native ID or email; `status`: exact recorded status; `coding`: category/project/location/cost-center text.
- `limit`: 1–100 (default 25); `offset`: 0–100000.

The response is `{results,total,limit,offset}`. Each result carries its exact kind/ID, title, available number/supplier/currency/amount/date/status, a source excerpt and a URL that opens a read-only record under a fresh scope check. Readable invoice text and originals remain owner/buyer-only. Search follows current own-request/staff and catalog grants; missing department/entity/native-app/key-based capabilities retain the obligations in CONTRACT.md before shipping. Protected bank/TIN/remit values, matching hashes and original file bytes are excluded from search. Complete archives retain the scoped projection, validate its source/owner links and rebuild derived full-text lookup before the search workspace is ready.

The reproducible 100,000-record native search journey is `node tests/browser-search-scale.mjs`; it uses actual RER install/setup/archive import and both 1440/390 widths. On this Mac, set `PURSE_CHROMIUM_EXECUTABLE_PATH` to a current `chrome-headless-shell` before running it. Run browser journeys under the fleet's heavy-slot launcher; `PURSE_EVIDENCE` selects private screenshots.

## Agreement terms and renewals (CONTRACT-001 round A, partial)

Owners use `agreement` with `{version:0, confirmed:true, name, reference, supplier, currency, parties, startDate, endDate, autoRenew, noticeDays, paymentTerms, reminderDays:[30,7], remindersEnabled:true, reason, clm:null, signature:null}`. A correction supplies `id` and the exact current `version`; each explicit confirmation retains the prior terms and reason. The confirming owner becomes the reminder owner. Buyer/owner state includes the agreement register; other current purchasing roles receive no agreement records. `ACCESS-001` carries future role scopes. Dates are calendar dates in the installation timezone; the notice deadline subtracts `noticeDays` calendar days from `endDate`. Reminder offsets are positive days before that deadline. Hourly Cron claims the most recently due configured offset once per agreement/deadline/offset, never bursts missed earlier offsets, never sends at/after the deadline, and records outcomes without retrying an uncertain attempt. Pausing or disabling auto-renewal stops further reminders. Active native owner authority is checked before each send; historical owners gain no authority on restore.

Optional `clm` is `{provider,reference,url}`; optional `signature` adds `{status,source}`. Reference URLs must be HTTPS without credentials. Signature statuses are `not-recorded`, `draft`, `sent`, `signed`, `declined`, `void`, always labelled owner-recorded and not provider-verified. A pasted URL causes no provider lookup or send.

`agreement-invoice` takes `{agreement,invoice,reason}`. It immutably attributes an issued native invoice once, requiring the same supplier family and currency. The register and reminder snapshot sum exact invoice allocations and drill to the invoice source, line amounts and PO. These are owner-attributed invoice evidence totals, not paid spend, verified compliance or savings. Attributed currency cannot change. Search indexes only agreement name/reference/supplier/currency/date metadata, never parties, payment terms, signature evidence or URLs. Complete archives retain terms/history, source attributions, reminder claims/outcomes and search. Agreement values, PDF reading and agreement savings remain unbuilt and are explicitly unavailable. Their full CONTRACT-001 requirements, including REPORT-003 first-offer/award/invoice source evidence before value/extraction ships, remain round B.


## Native blanket invoice draw-down (PO-005, partial)

Request/amend accepts `poDetails.blanket: {validFrom, validThrough}` with inclusive
YYYY-MM-DD dates; omit or use null for ordinary purchasing. The approved total is
the cap, including supplied freight/tax. Issuance checks the installation's current
calendar date. An issued purchase retains its blanket basis and currency; changes
to cap or validity require ordinary amendment and renewed approval.

Every unique invoice evidence record consumes the cap once across the request's
issued revisions, including held evidence. Receipts retain their physical meaning
and do not release invoice-consumed authority again. Scoped order state includes
`blanketPosition` with current cap, billed evidence, remaining cap and excess.
Invoice dates outside validity and amounts above the current cap are risk flags;
recording evidence is permitted, while unresolved flags refuse cash-planning approval.
HTML/PDF retain the approved cap/validity and numbered changes. Release draw-downs,
recurring generation and structured service matching are not implemented.

## Structured protected input boundary (SECURITY-001 slice)

Native `prepare`, `edit-preparation` and `propose-action` refuse structured keys
for TIN/EIN/SSN/tax ID, bank account/routing numbers, connector/client secrets,
API/access/refresh tokens and matching material, including nested objects/arrays
and case/punctuation variants. `execute-action` rechecks stored proposed inputs.
A refusal returns a generic 400 with no-store and preserves product records;
only a digit-free `protected-input-refused` audit event is committed under the
current native session and revision fence. Rejected values never enter the
preparation, proposed-action, draft download or refusal audit.

This boundary does not redact arbitrary source prose or clean historical stored
context. The native storage/reveal slice below adds recoverable storage and exact masks; installation key rotation and complete default/include archive protection remain SECURITY-001 gaps.
In particular, current default archives still carry the legacy supplier matching
root alongside fingerprints. The approved policy in CONTRACT and ACCEPTANCE is
the target; this bounded guard does not establish archive confidentiality.


## Native protected supplier values (SECURITY-001, partial)

`GET /api/purse/supplier-protected/:supplier` returns the current global revision,
role masks and bank status. Stored bank values say "Recorded, not verified – not active for
payment"; absent values say "Not recorded", and excluded restored values say "Not restored – re-enter". Current native owners and buyers see last four; other current native
roles see only On file for TIN/account and no routing value. Ordinary native state
uses the same protected masks; exports and other supplier projections do not
receive suffixes. No protected values appear in command responses.

The current native owner posts `/store` on that path with
`{revision,values:{tin?,bankAccount?,bankRouting?},reason,evidence}`. TIN/routing
are nine digit strings; account is 4–17 digits. Bank account and routing change
together. Reason and evidence reference are required and encrypted with the value.
AES-256-GCM binds each ciphertext to business, exact supplier row, field and key
ID. The separate installation-local table and SUPPLIER-003 fingerprints update
in one native owner/session/revision-fenced transaction. New writes to merged
aliases are refused; reveal reads only the exact historical supplier row.

POST `/reveal` takes `{revision,field,reason}` and returns only that one field
with no-store after a current-owner fence and a completed native email step-up
within ten minutes. Request `/auth/step-up` with action `export` and confirm its
email link in the same session before revealing. Development sign-in alone is
not reauthentication. Stale or concurrent operations return 409. Recognized
refusals and successful operations retain fixed-vocabulary audit events without
input digits. Authentication/origin refusals remain at the native perimeter.

`rer setup` provisions managed `PROTECTED_DATA_KEY`; owner deployments supply it
as a Worker secret. Never put it in arguments, records, R2, archives or logs. An
absent or mismatched key returns 503 without plaintext fallback. Keep the original
installation key privately: this slice has no rotation or recovery workflow and
key loss requires reentry. Default archives exclude the ciphertext table and
restore returns "Not restored – re-enter". **Legacy matching roots still travel
in default archives**, and encrypted owner-include archives are unbuilt; do not
claim complete SECURITY-001 archive confidentiality or clause completion.


### Protected supplier web flow

In Suppliers, open an existing supplier and use **Protected tax and bank values**. The current native owner stores TIN/account/routing with a private reason and evidence reference; blank inputs keep the stored fields and account/routing change together. Submitted private inputs clear after each attempt. Storage uses the dedicated protected HTTP door; ordinary supplier saves never receive these values. The panel shows role masks and the recorded/unverified/not-active bank label.

**Request native reauthentication** requests the existing native email challenge. Confirm its link in the same browser, then return to the supplier and reveal one field with a private reason. A request alone or development sign-in grants no reveal proof; local mail remains suppressed. **Hide protected value**, leaving the supplier/workspace, or hiding the document clears the displayed value. Buyers have masks only. These controls preserve current HTTP authorization and revision fences; they do not implement rotation, encrypted owner-include archives, connector-secret lifecycle or complete refusal auditing.

## Request again (INTAKE-001 native slice)

`request-again-preview` takes `{kind:"request"|"order",id}` under the current
native requester session and the source record’s ordinary read scope. It is
read-only and returns an editable `draft`, `flags`, unit-price `changes`, source
attachment metadata and a `fingerprint`. Catalog lines use the current approved,
in-date price and current requester access. Unavailable lines and inactive
projects are omitted; unavailable supplier or header coding needs replacement.

`request-again` takes the same source, `fingerprint`, reviewed `draft` and optional
`attachments:[id]` chosen from that review. It rechecks eligibility, source and
exact file bytes, then uses the ordinary request and attachment validators in
one transaction. A stale review returns 409 without creating anything. Catalog
prices are selected on the server; replace the catalog selection to change the
item. Custom lines remain editable. Every new line, request and chosen attachment
has a new identity; bytes and filenames of selected files are preserved.

The result is a requester-owned draft with no policy or approval. Submit it
separately under current policy. Source email-intake linkage, integration authority,
quotes, receipts, invoices and commitments are not copied. Current active category fields and split coding copy as well. Inactive field choices and split coding are flagged and excluded; the new draft must satisfy current required fields and files before submission.

### Protected evidence and recovery

`GET /api/purse/invoice-evidence` is owner-only and returns the current revision,
pending legacy invoices and migration receipts. `POST .../migrate` takes
`{revision}`. Original hashes stay unchanged; retained-input checks, unavailable
sources and failed checks have distinct labels. New evidence uses an independent
key. `POST .../reenter` takes `{revision,invoice,remit:{bankRouting,bankAccount},reason,evidence}`
with native reauthentication within ten minutes. It discards the bank input;
only a matching original changes the evidence state. Missing legacy keys return
503. These states never verify a bank or remove invoice holds.

Owner-only `/api/purse/protected-keys` reports key availability and rotation
progress. POST `/rotate` requires `{revision,reason}` and fresh native proof;
all old envelopes are authenticated, reencrypted and checked before one commit.
Keep the previous Worker secret until this succeeds. POST `/recover` also needs
`acknowledge:"discard-unreadable-and-reenter"`; it discards only unreadable values
and records key loss. There is no escrow.

The owner may download a separate passphrase-encrypted include supplement using
POST `/api/purse/protected-archive/export` with
`{revision,passphrase,reason,evidence,include:"protected-values-and-matching"}`
and fresh native proof. Keep it with the ordinary `rer export` archive. Restore
ordinary data first; POST `/restore` takes the same private inputs plus `archive`.
It validates every supplier and protected field before an atomic restore under
the destination key. Wrong passphrases change no domain values. Installation
keys, connector credentials and reveal grants are never included. The default
archive excludes all protected ciphertext, matching roots and fingerprints.

POST `/api/purse/integration-tokens/:id/delete` deletes an active or revoked
credential and replay authority, preserving purchasing history and audit.
Secrets are shown only on creation/rotation; later reads return metadata.

`protected-context-cleanup` takes `{confirmed:true,reason}` from the current
native owner. It removes historical structured protected fields, cancels affected
pending actions and records counts without removed values. Unsafe immutable
reports are explicitly quarantined. Reads withhold unsafe structured fields
before cleanup; exports and restores refuse unsafe context. Free text remains
source data and is not claimed to be universally redacted.

## Native releases, service value receiving and recurring series (PO-005)

`blanket-release` takes `{order,revision,reference,amountMinor,needDate,reason}`
(or currency text `amount`) under current scoped procurement permission. It
irrevocably records a release against the exact issued blanket revision. Open
release amounts earmark parent authority; unreleased invoices consume unallocated
authority, and all uninvoiced balances remain committed. Invoice input optionally
names `release`; source identity includes that choice. Evidence exceeding the
release balance, a closed release or the current amended parent cap is held.
`close-blanket-release` takes `{id,revision,reason}` and releases only unused
earmarked authority. No supplier message or payment is sent.

A request line may include `service:{mode:"amount"|"percentage"|"milestone"}`.
Milestone mode supplies `milestones:[{id?,name,valueMinor}]`; positive values must
sum to the exact line total. The exact terms survive approval, PO documents and
amendments. `service-receipt` takes `{order,line,receiptVersion,reason}` and either
incremental `valueMinor`/`valueAmount`, cumulative decimal-string `percentage`
(0–100, two decimal places), or an approved `milestone` identity. Current receiver
assignment and native-session fences apply. Returns use `event:"return"` and a
value for amount/percentage lines. A milestone is accepted once. Amounts are the
matching authority; free-text reasons never establish completion. Matching
allocates received value to fitting invoice evidence in retained entry order;
an oversized exception does not consume value needed by a smaller fitting bill.
Receipt changes immediately recompute matching without approving payment.

`recurring-series` requires a current native owner and
`{order,agreement,nextDate,endDate,maxOrders,reason}`. The exact current issued
ordinary/service template is frozen, the cadence is monthly in the business
calendar, and 1–120 additional orders are explicitly bounded by the end date.
`recurring-authorize` takes `{id,version,reason}` from the current designated
independent approver or permitted delegate. A series stays pending until that
explicit authorization. Generated decisions retain this standing authorization
and the exact source version; they never claim a fresh human interaction.

Hourly Cron handles one due order per active series per invocation, atomically
claiming the domain revision and current native owner/source-approver/series-
approver identities. Each occurrence has a fresh request, lines, PO number and
budget commitment, a frozen PO profile/terms/originals, and source-exact history.
The anchored calendar day clamps to a short month's last day. Before generation,
current authority/policy, agreement supplier/currency/start/end/notice deadline,
known remaining agreement value, available budget, supplier blocking/screening
and required-document lapse are checked. Failure pauses the series with its
reason and an owner decision request in Orders. Retained order exposure and
attributed invoice evidence consume agreement value once. A delayed tick checks
the scheduled occurrence date and does not skip or silently drop a due order.

`recurring-disposition` takes `{id,version,disposition,reason}` from the same
current native owner: `pause`, `continue`, `amend` or `end`. Continue requests a
fresh check and bypasses no condition. Amend pauses the series for the ordinary
request amendment and renewed approval flow; a new exact template requires a new
series and independent consent. Scheduled generation records issuance only and
sends no supplier PO. Restored history grants no historical owner or approval
authority; stale native bindings cause a pause. Scoped native state includes
`releasePosition`, value receipt positions, `recurringSeries` and `recurringEvent`.

Personal-data erasure uses a separate current-native-owner door. `GET
/api/purse/erasure` lists inactive members, current or historically nominated
supplier contacts, and value-free field receipts. `POST /api/purse/erasure/preview`
takes `{revision,kind:"member"|"contact",id,email?}` and returns an exact inventory,
`review` ID and `fingerprint`. `execute` requires the same subject, revision,
review and fingerprint, `consent:true`, and native reauthentication within ten
minutes. An authority, source or revision change refuses the operation. The
transaction anonymizes purchasing, revision/policy/audit and source copies,
retires matching import custody, ends the departed identity's credentials and
records Base's redaction checkpoint. Original downloads return 410. `resume`
with `{revision,id}` finishes an interrupted blob deletion; archives remain
blocked until the receipt is complete. No financial retention expiry runs
automatically. TIN/bank values remain encrypted with existing owner-only reveal;
private reason/evidence metadata is scrubbed. Invoice evidence hashes, state and
attestations remain, with “source values since erased” and exact journal proof.

## Reviewed imported PO custody (IMPORT-003 native door)

`adopt-order-preview` is current-native-owner-only and takes
`{id,policy,budget?,location,costCentre,receiver}`. It returns a no-write review fingerprint,
original number, exact opening ordered/received/billed positions, remaining
commitment and unapplied deposit. `adopt-order` adds
`{fingerprint,reviewed:true,reason}`. Source/mapping/receiver/budget changes refuse
stale review. Adoption creates a distinct native operational request/revision with
status `adopted`; no decision, native PO issuance or supplier message is created.
The PO stays `imported:true`, keeps its source number and has `issuedAt:null`.

Receiving and invoice evidence accept explicitly adopted POs. Existing scope,
receiver position and risk checks still apply. `invoice-source` may take
`{order,invoice}` for an adopted historical bill with a retained private original;
it stages those same bytes through the ordinary source-bound invoice reading.
Confirmation must reconcile the exact imported identity, amount, quantities and
available original digest. Historical approval cannot set native `approvedBy`.
New cash-planning approval requires this current confirmation and resolved current
risk/matching checks. Missing historical document dates stay explicitly unknown
until source confirmation supplies the actual date.

`invoice` and `invoice-reading-confirm` accept optional `depositAppliedAmount`
(currency text) for an adopted imported prepaid balance. Stored allocations and
`grossMinor` retain gross evidence, `depositAppliedMinor` records its once-only
credit, and `totalMinor` is net due. Credit cannot exceed current unapplied deposit
or gross invoice value; exact repeated evidence remains idempotent. The existing
cash view and spend report include adopted remaining commitments, bill balances
and source deposit credits once, with original-number sources and separate
currencies. This neither creates a native deposit nor posts or pays anything.


When the source PO names a budget, `budget` must identify that exact imported
`budget` row. Owner review transfers its amount to the selected policy budget
once, preserving the policy's native approver and limits. Subsequent adoptions
reuse that source mapping; a source cannot fund two policy budgets. Insufficient
imported capacity refuses the whole adoption before writes.


`propose-adopted-cancellation` takes `{id,revision,reason}` from the current
native owner. It creates an exact native amendment draft; ordinary submit,
independent non-self decision, conversion and issuance remain mandatory. Issuance
records approved cancellation quantities and releases the old remainder once,
retaining received liabilities, bills and deposits. It sends no supplier message.

`replace-adopted-remainder` takes the current adopted order `{id,revision}`,
`reviewedDisposition:true`, `reason` and ordinary complete new-request fields.
Each `lines[]` supplies `sourceLine` in original outstanding-line order; the server
sets its quantity to that source remainder and creates fresh native line IDs.
This is the explicit supplier/currency disposition: old received goods, invoices,
liabilities and unapplied prepaid credits stay with the original supplier and
currency. After independent native approval, issuance atomically cancels the old
unreceived quantity and commits the separately numbered replacement. Changed
source receipt, invoice, payable or commitment positions require a fresh proposal.
The current approver and issuing buyer must cover both scopes. No historical
approval or supplier send is fabricated.


## Category intake forms and unfinished drafts (INTAKE-001)

`intake-form` requires unrestricted native `intake.admin` permission and
`consent:true`. It takes `{id?,version?,name,purchaseType,active,questions,
headerFields,lineFields,requiredFiles,defaults}`. Purchase types are `goods`,
`software`, `services`, `contractors` and `equipment`. Each field is
`{id,label,type:"text"|"choice"|"number"|"date"|"boolean",options?,inactiveOptions?,required,active,when?:{field,equals}}`;
a condition names an earlier choice in the same field list. The form permits
30 fields per list, 50 choices per choice, and 10 required filename fragments.
Required files are exact retained uploads whose filenames contain the configured
fragment. Definitions for protected tax, bank or credential fields are refused;
those values retain their dedicated native owner storage/reveal boundary.

Native number values use finite decimal text without exponent notation and with
magnitude at most the safe integer limit; dates use valid `YYYY-MM-DD` calendar
dates, and yes or no values use `"Yes"` or `"No"`. Zero and `"No"` satisfy a
required field. A Purse list retains every value in `options`; its explicitly
inactive values appear in `inactiveOptions` and cannot be selected or submitted.
Changing definitions never rewrites an approved revision. Applying a current
form discards obsolete or hidden field keys from an unfinished draft. Request-again review
omits obsolete values and asks for replacements under the current definition.

PO-backed invoice capture copies header values, line values, the exact form
snapshot and the issued source revision from the PO. Caller-supplied replacement
custom values are refused. Source confirmation, private original access,
duplicate and unresolved-risk holds retain their ordinary checks. A later field
change needs a new request revision and fresh purchase approval; previous bills
keep their issued values. Native line `glAccount` values remain on the purchasing
revision and PO. Guided line coding exposes the GL account under the existing
coding disclosure.

REPORT-001 returns namespaced custom dimensions from permitted retained purchase
snapshots, including fields no longer present on the current revision. Its
filters, choices, grouping and drill-through use current record access, retain
issued bill values and keep currency totals separate. Ledger-origin lists,
connection mappings and posting, broader custom-field defaults, materiality,
non-PO and allocation fields and incumbent imports remain unqualified under
CODING-002. This native path makes no provider or payment claim.

Defaults set configured `currency`, `location`, `costCentre`, `project`,
`category` and optional `allocations:[{costCentre,project,basisPoints}]`.
Line shares sum to 10,000 basis points. Amounts are calculated from each net
line total with largest-remainder cent allocation, including current-price
copies and permitted buyer conversion edits. Every split department/project
must fit the current complete authority grant; policies must cover every split
project. Splits do not duplicate the request's existing policy reservation.
Full CODING-001 accounting/budget distribution and CODING-002 reporting/provider
mapping retain their separate contract obligations.

`intake-draft` takes `{id?,version?,fields,proposal?,emailIntake?,emailIntakeVersion?}`.
It saves arbitrary incomplete answers and lines, up to 100 kB and 100 lines,
under the current requester only. It never creates a submitted request.
`fields` is a whitelist of ordinary purchasing inputs plus `intakeForm`,
`answers`, header `customFields`, and line `customFields`/`allocations`.
`intake-draft-file` takes `{id,version,name,mediaType,base64}` for an exact private
file of up to 1 MB. Both commands return the new version. State lists only the
current requester's unfinished drafts; current native sessions on another
device see the same saved values/files. A stale version returns 409.

`intake-route` takes `{id,version}` and validates a clone of those current
fields through the ordinary request validator. It returns the predicted policy
name/approver and a new-supplier review step where applicable, or the missing
input preventing prediction. It creates no request, approval or reservation.
`intake-complete` takes `{id,version,consent:true}` and atomically creates one
ordinary draft with its uploaded files. Ordinary `submit` remains a separate
explicit action, checks current required questions/fields/files and routing,
and retains the category definition, answers, splits and file IDs on the exact
request revision. Copy review and PO conversion preserve category values.

An optional supplier `proposal` contains `name`, `contactEmail`, `reason`,
`consent:true`, and optional `contactName`, `website`, `phone`, `address`,
`category`. Existing name/email-domain matches are refused for register review.
The supplier is `proposed`, while contact and justification details remain
private to its requester and unrestricted procurement staff. The request may
submit and obtain purchase approval/reservation while the supplier is pending;
conversion and issue refuse it. Existing supplier management and screening
remain the buyer's explicit activation door, and a proposer cannot activate
their own proposal. No invitation or supplier message is sent by intake.
SUPPLIER-008 retains full onboarding, configurable vendor chains, TIN/website
matching, provider imports, notifications and automatic post-activation actions.

For an assigned email source, the draft also binds the exact
`emailIntakeVersion`. Only its assigned current requester can save or complete
it. A changed source must be reviewed and saved against its new version before
completion. Completion calls the existing email-intake command in the same
transaction, preserving private originals, one source/request link, durable
provider replay and the existing draft-link mail outcome. It never resends mail
or treats source text as authority. Portable archives validate the new records,
revision snapshots, exact split arithmetic, files, consent and email links;
archived principal IDs never create a session or grant another account access
to a private unfinished draft.

## Native ordered approvals, corrections and dated budgets (partial clauses)

The owner or an administrator with the existing policy-management grant configures
`approvalSteps:[{email,minMinor?,minAmount?,costCentre?,dependsOn?}]` (up to 20
additional stages). The primary remains `approver`. Conditions select steps
by current total, department and optional `purchaseType` (the explicit purchase
type, or the first line category in lowercase for legacy requests). A stage can
instead name `emails:[email,...]` and `mode:"any"` or `mode:"all"`. Any selects
one decider from the pool; all opens a separate parallel review for every named
person and waits for each approval. Subsequent stages wait for the whole stage.
Pool members who requested the purchase are excluded. Current scope and native
authority still apply to every decision and to issuance. The existing SCIM
handoff runs only when no eligible pool peer remains.

State returns `approvalPreview` before submission and the retained route after
submission, including rule reasons and deciding members. It returns the viewer's
`approvalStep` and the current `approvalAttempt`. A pool or parallel `decision`
command must include both as `chainStep` and `approvalAttempt`, alongside the
exact `id`, `revision`, decision and reason. The first committed decision wins;
a stale step action reports the deciding member and time, and queues withdraw
that member's completed work. Resubmission after return or rejection creates a new exact revision and renews
all decisions, retaining the earlier route and policy evidence; prior submission
actions cannot decide the renewed pool. Each decision and its route,
policy version and immutable policy snapshot are available in scoped AUDIT-001
reads and CSV, and remain portable.

Settings accepts one stage per line in Additional approvers: comma-separated
emails, followed by `| any or all | amount | purchase type | department`. These conditions
are optional; a bare email retains the existing additional threshold behavior. `editRules` maps a purchase type or `*` to
`{allowed:[field],material:[field]}`. Allowed fields are `glAccount`, `costCentre`,
`location`, `class`, `project`, `needDate`, `shipTo`, `supplier` and `notes`.
The default material fields are GL account, department, project and supplier.
APPROVAL-001 retains manager hierarchy, remaining conditional dimensions, per-allocation rules, scheduled escalation and channel qualification.

`approver-edit` takes `{id,revision,changes:{field:value,lines?:[{id,field:value}]},reason}`
from the current non-self step holder. It creates an attributed exact revision,
records differences and policy context, and carries or renews affected decisions.
Quantity, price and line additions are refused. Current delegation and per-step
SCIM custody still apply. Consistent active supplier changes are supported;
differing line suppliers require the unbuilt supplier-group conversion path.
Material coding moves release the old allocations and reserve the new ones in
one transaction. Existing session, membership, scope and version fences apply.

Per ct’s 22 October ruling, only edited-field before/after values reach the
requester and every earlier approver across a lost read grant. They appear in
`data.approvalEditNotice` without private record detail. This grants no new
purchase read or decision authority. Private prior revisions and whole-policy
snapshots remain withheld, including command responses, embedded value reports,
and audit reads/exports. Material changes still renew the affected approvals.

A policy’s `budgetPeriod:{from,through}` selects inclusive request need dates
for a month, quarter or fiscal year of at most 366 days. Optional `location`,
`glAccount` and `budgetFields:{form,header:{field:value},line:{field:value}}` select
native coding and form fields in combination with department/project/category.
Native field selectors bind the exact form and header/line scope; no ledger
dimension sync is implied. An allocation's explicit location/GL overrides its
line and header defaults. Each share consumes its selected dated budget. A used
period or coding selector cannot be relabelled; create another policy. Historical
purchases retain their recorded budget identity. Ambiguous current mappings refuse
rather than choosing a budget by identifier. Cross-period amendment dispositions remain unbuilt and refuse.
`overBudget:"block"|"owner"` and `budgetOwner` select refusal or an independent
budget-owner step for each allocation’s overage. Reservation waits for every
required owner’s exact decision. A later increase requires new budget authority.
Ordered policies reserve at submit; legacy single-approver timing is unchanged.

`data.periodBudgets` and `/api/purse/spend-report` expose complete permitted
amount, reserved, committed, recorded actual and available. Under ct’s ruling,
hidden purchases are summed in an anonymous source row (`hidden:true`) labelled
“Other purchases you cannot see,” with no identifiers or drill-through. No grant
on a budget means no figures. Received-but-unbilled value remains committed;
recorded invoices, imported deposit/net-credit evidence and approved travel
reports consume exposure once. Invoice identifiers keep their invoice-read gate.
This is not a claim of matched/synced bills, payment or card settlement.
Report filters and groupings include GL and the permitted native custom field
keys returned in `customDimensions`. Cross-period dispositions, native deposits,
matched/synced bills and provider-funded/settled cards remain BUDGET-001 gaps.

## Buyer conversion revisions

`convert` accepts `{id,revision,issue?,conversionEdits?:{lines,charges?,supplier?,reason}}`.
Each edited existing line may supply `unitMinor`, `quantity`, `unit`, `partNumber`
and a consistent supplier. An active purchasable supplier is required; a pending
supplier is refused. Units/SKUs are labels, never implicit multipliers. Charges
are distinct `{kind:"freight"|"tax"|"other",description,amountMinor}` entries;
existing header freight/tax inputs remain supported. Every configured buyer cap
applies above each approved line and the total. Zero-limit increases refuse.
Split amounts rescale with the remainder on the first allocation; supplied tax
uses line-value largest-remainder allocation.

A within-limit/current-route/in-budget edit writes a new exact buyer-attributed
request revision and explicit carried decision links. Source revisions and
original decisions never change. `issue:true` issues in the same transaction;
the web edited-conversion form uses it. Omitting `issue` prepares the document
for a separate `issue` call. Use the returned revision, not the source revision.
An over-limit edit, changed threshold route or budget overage returns a pending
request with `conversionRouted:true` and creates no PO. The exact current chain
and every required budget owner must approve before conversion/issue resumes.
The current issued face and earlier invoices govern remaining balances and risk.

`need-date-edit` accepts `{id,revision,line?,needDate,reason}` from the approved
requester or a scoped approver. It creates an exact nonmaterial revision and
carries approvals. Issued documents retain their number and immutable earlier
faces, with receiving custody carried. The result honestly records supplier
change-order delivery as pending at creation; a buyer explicitly sends that exact
issued revision through the change-order door below. Supplier groups, notification
execution and Slack/Teams transports/qualification remain PO-012 gaps.

## Explicit supplier change orders

`POST /api/purse/order-send` accepts `{order,revision,recipient,consent:true,reason}`
from a current scoped buyer for an exact issued native approved amendment or
cancellation. It freezes the numbered change content, PDF and applicable original
terms/certificate, claims one send attempt, then invokes the configured native mail
adapter. It reports provider acceptance, suppression, refusal or uncertainty;
provider acceptance is never called mailbox delivery. An uncertain attempt cannot
be silently retried. This does not send initial POs or adopted historical POs.

`GET /api/purse/order-send/:order` gives scoped PO readers the safe current outcome
and exact acknowledged revision. `POST /api/purse/order-send/:order/revoke` lets a
current scoped buyer withdraw link access. The random, hashed, seven-day supplier
link reads only that exact approved change and its PDF/originals, and accepts a
reasoned acknowledgment. Supplier-stated identity remains unverified. Expiry,
withdrawal, superseding revisions and source erasure refuse the link; archives
retain private send/acknowledgment evidence without restoring bearer authority.
No automatic outbound action is added to date editing.

## Travel pre-approvals and returned Coaster reports

The private native travel mutations also have command equivalents named with the `travel-` prefix:

- `POST /api/purse/travel/per-diem`: `{destination:{city,state,country},departureDate,returnDate}`.
- `POST /api/purse/travel/request`: ordinary `title,currency,location,costCentre,project`
  plus `travel:{traveler,travelerEmail,purpose,origin,destinations,departureDate,returnDate,costs}`.
  Each destination has `city,state,country` and optional `county` and an explicit
  `standardConus:true` selection; known nonstandard-area conflicts refuse that selection.
  `costs` accepts currency-text `airfareAmount`, `lodgingAmount`,
  `groundTransportAmount`, `mealsIncidentalsAmount`, `registrationAmount` and
  `otherAmount` (or their integer `Minor` counterparts). Omitted meals use the
  official FY2025–2027 GSA CONUS rate for exact city/county matches or an explicitly
  selected standard area. Unmatched/ambiguous destinations or years need
  an explicit estimate. No supplier or purchase order is fabricated.
- `POST /api/purse/travel/submit` and `/decision` use exact native request revisions
  and existing ordered approval decisions. Final approval returns
  `travel.approvalReference` for the booking tool and Coaster item custom field
  `purse_reference`. Booking happens outside Purse. An optional owner-configured
  `internationalTravelReviewer` on the policy adds an independent final step when
  any destination country is outside the US; omitted settings preserve the current
  value and an empty string clears it.
- `POST /api/purse/travel/amend`: the current `{id,revision,reason}` and full new
  travel request fields. Date/estimate changes release old reservation authority
  and need fresh approval; generic purchase/date-edit doors refuse travel.
- `GET /api/purse/travel/references`: the active signed-in traveler's approved destinations, dates, category caps, currency, references, revisions and statuses, including assistant-created trips. This grants no request, policy, budget, approval or original-document access.
- `POST /api/purse/travel/release-policy`: `{id,revision,version,enabled,days,timezone,confirmed,acceptLateActual,reason}`.
  Default OFF. The current native owner explicitly consents to one approved trip
  revision and 1–3650 business-calendar days after return, acknowledging that a
  late report may consume budget after funds were freed. The real Cron releases
  once at or after the due date in the explicitly consented timezone; owner, rule version, trip revision or timezone changes pause it for renewed consent.
- `POST /api/purse/travel/expense-return`: `{id,revision,original,sourceUrl,confirmed:true,closed:true,reason}`.
  `original` is the exact JSON from an authenticated local Coaster
  `GET /api/coaster/claims/:id`, with its current frozen revision/items/decisions.
  Every item must reference this approval; traveler, currency, totals and an
  independent current approval must agree. The amount cannot exceed the approved
  trip. `sourceUrl` is provenance, never automatically fetched. Purse parses the
  supplied report and retains its bytes; it does not independently attest Coaster.

Under the ct 23 October ruling, the current native owner or finance with scoped request-read and payable-approval permissions may review the source and explicitly close its final report. It moves reported spend to
recorded actual, releases the remainder and links the current approved report on
the request; only the native owner can read the retained original. A report after
a timed release records actual without a second reservation release, retaining
the earlier release and the remaining estimate as separate facts. Retained native
approval evidence allows later financial facts after an approver's departure; it
does not restore that person's purchase authority.
An exact replay cannot repeat either movement; conflicting or wrong-reference
reports refuse. Archives preserve the financial/source links and custody audit,
without restoring another principal’s authority. Timed-release consent and approved traveler booking terms follow the ct 23 October boundary. No automatic
report fetch, settlement or
outbound booking/payment is performed. INTAKE-002/003, API-001 and IMPORT-001
inherit these rules when adding travel doors; ERASURE-001 inherits the new
traveler and original-report personal fields. Its current reviewed erasure door
withdraws affected originals, scrubs traveler/assistant identity, and preserves
anonymous financial facts, original hashes and an explicit unverified withdrawal
state across archives. Withdrawn originals and their source links are not offered
in the travel record.

## Read-only PO-data tokens (INTAKE-008)

The native owner uses **Settings → Integration tokens → Create read-only PO token** or `POST /api/purse/integration-tokens` with `{name,scope:"read-purchase-orders",suppliers:["native-supplier-id"],expiresDays:7}`. One or more explicit supplier IDs are required (maximum 100); no wildcard or merge-family expansion. Default expiry is seven days; choose 1–30 days. Issuance and rotation return the secret once, hash-only storage and metadata-only lists use the existing INTAKE-007 lifecycle. Rotation retains mapping and original expiry; revoke/delete ends access immediately. Credentials remain outside archives.

Locket AGENT-001 calls `GET /api/purse/integration/orders/:id` with `Authorization: Bearer <private token>`. It returns `{order:{id,number,revision,supplier,currency,status,needDate,issuedAt,totalMinor,freightMinor,taxMinor,otherMinor,lines,bills}}` for an exactly mapped supplier. Lines include ID, description, part number, quantity/unit and minor-unit price/amount/tax. Bills include ID/reference/currency/amount/status/date/due date and the last authenticated Pantry `paymentStatus` plus `paymentStatusAt` when available. Otherwise status is `unknown` with an explicit AP-001/AP-002 absence reason. Captured invoice status is not payment approval. No original, attachment, comments, request, approval, payment detail or credential data is returned; native workspace/source/credential doors remain inaccessible to the bearer.

Every read response is no-store. Missing/invalid/expired/revoked tokens return 401; create-draft tokens return 403; missing/out-of-map POs both return 404. Reads are limited to 60 per token per minute with durable atomic accounting (including refused record probes); excess reads return 429. All successes and refusals enter AUDIT-001 with recognized token ID, record/outcome and no bearer material; invalid or rotated secrets remain anonymous. Server callers need no Origin; a supplied Origin must be exact, cross-site browser requests are refused. The read token cannot create drafts or mutate records; INTAKE-007 is unchanged. API-001's broader API and webhook/provider duties remain partial.

## Pantry native bill connector (SYNC-004, partial)

The native owner connects one Pantry installation in **Settings → Pantry accounting**, confirms its USD book currency (no conversion), and privately supplies an owner-created Pantry integration credential with `contacts:write`, `bills:write`, `payments:read` and `post`. Purse stores AES-256-GCM ciphertext under the installation protected-data key in an archive-excluded table; metadata reads never return a credential, ciphertext or key identifier. Replacing the credential rotates local use; local revoke/delete stops subsequent connector calls. Also revoke the original credential in Pantry to end its provider authority. Configuration is not provider qualification.

All `/api/purse/pantry` doors require the current native owner; mutations require the normal exact Origin and session. `GET /api/purse/pantry` returns connection metadata, owner-confirmed origin/currency and retained sync history. `POST /connection` takes `{origin,currency,token,generation,confirmed:true}`; `POST /connection/revoke` and `/connection/delete` take `{}`. HTTPS origins are required, with loopback HTTP permitted only in local mode. Credentials are never forwarded across redirects. A restored archive retains source/external identities and payment history but requires fresh connection consent and credentials.

`GET /options` reads Pantry's current account/vendor mappings. `POST /preview` takes `{invoice,payableVersion,accountId,vendorId?}` and returns an exact source-bound posting plan and fingerprint. Only USD native PO invoice evidence is supported. It must have current cash-planning approval, received quantities, no discrepancy or unresolved risk, the confirmed book currency and no imported/deposit balances. Cash-planning approval alone does not post: the owner separately reviews and explicitly approves the exact bill/account/vendor mapping, then `POST /sync` takes that input plus `{fingerprint,confirmed:true,reason}`. Nothing posts automatically. The vendor is explicitly mapped or created under the immutable Purse supplier ID; an unrelated same-name vendor requires explicit mapping. Native supplier IDs and invoice IDs form stable provider idempotency keys. An exact existing vendor/reference/date/due/line/account/amount bill is adopted; a different bill or changed retained source is held for reconciliation, never silently overwritten or duplicated. A held or uncertain attempt requires explicit owner re-sync; no automatic retry occurs.

`POST /refresh` with `{invoice}` reads the retained Pantry bill and its active, unreversed payment allocations. It never initiates a payment. Partial/full payments and reversals update AP-003 outstanding cash once; source approval and original terms remain intact. Returned dates must reconcile with the confirmed terms. A zero balance settled without sufficient payment evidence is labelled `settled-without-payment`, not Paid. Reconciliation status remains unknown in this slice. The result includes a native Pantry bill link. Attempts/outcomes and returned payment IDs/status enter AUDIT-001 read/CSV without credentials. INTAKE-008 may read only the resulting payment-status label and return timestamp, never payment records; absent AP-001/AP-002 provider status stays unknown.

SYNC-004 remains partial: Pantry INTEG-001's structured PO/source provenance and scoped 1099 writes are absent; credit transport, non-PO/report qualification, independent date/term correction and reconciliation qualification remain gaps. The conservative default is native-owner-only connection and exact posting consent, owner-confirmed book currency and no automatic outbound or original-document transfer, pending ct approval.


## Recurring-spend scenarios (AGENT-006)

In **Preparation → Recurring spend scenarios**, procurement and finance members prepare deterministic v1 proposals within their current purchasing and agreement scope. No model or provider runs. `recurring-scenario-discover` accepts `{from,to,limit?}` and retains source-cited conditional consolidation, renegotiation and cancellation review. The hourly native Cron also discovers inside each agreement's recorded reminder lead window through its notice deadline, deduplicates the exact source and window, and creates in-app notices for current assigned agreement owners and independent scoped finance approvers. It creates no consent, draft, supplier message or purchasing change.

The native owner confirms agreement terms and can select an active member using `ownerMember` (email). An explicit selection resolves an active native account and is audited and atomically fenced. Omitting it on a correction preserves the current assignee. Existing explicitly enabled renewal email reminders follow the active assigned owner, with term-only content unless current procurement authority permits attributed invoice evidence. Assigned members see safe current terms; assignment gives no invoice, private original, signature or general purchasing read grant. Optional `renewalTermMonths` and `renewalIncreaseCapBps` retain the recorded renewal interval and price-increase cap; null means unrecorded.

`recurring-scenario-prepare` takes `{kind:consolidate|renegotiate|cancel,agreementIds,from,to,reason,operationalRisk,assumptions:[{agreement,order,proposedMinor,proposedCommitmentMinor,expectedDate,reason}],renewalAssumptions?:[{agreement,proposedMinor,reason}],evidence?:[{kind,id}]}`. An orderless assumption retains null issued-PO amounts. Adopted lineages are refused. Safe source revisions and exact arithmetic are hashed immutably. Approved bills stay unchanged. Renewal forecasts use recorded value, auto-renewal, explicit renewal months or the inclusive recorded term duration, and the recorded increase cap. Their label is "forecast from recorded terms; not issued, not realized". A missing recorded value or term remains unknown; no numeric assumption can fill an unknown baseline. Optional renewal assumptions give the proposed total over the scenario period, separately from issued obligations and commitments.

`recurring-scenario-approve` takes `{id,hash,role:finance|owner|budget,agreement?,policy?,confirmed:true,reason}`. Finance has current payable approval and cash access to every linked purchase and is independent of affected agreement and budget owners. Every current assigned agreement owner consents to the exact hash. A changed commitment also requires each affected budget's configured `budgetOwner`, or its policy approver when no separate owner is recorded, under current approval scope. Captured commitment allocations identify the affected budgets. State gives the curated exact scenario to those affected owners and source-authorized finance; originals, protected fields and private consent reasons are excluded.

The native owner requests `recurring-scenario-draft` with `{id,hash}` only after all same-hash consents. Current sources, grants and native identity versions are rechecked. The resulting nonbinding text cites recorded notice terms and its SHA-256 is `draftHash`. A person sends it with `POST /api/purse/order-send/recurring-notice` and `{id,hash,draftHash,recipient,reason,consent:true}`. This PO-004 native send boundary requires current native owner authority, exact-draft and recipient consent, unchanged sources and current consent identities, then claims once before the existing native mail adapter. Replays are refused; an uncertain outcome is investigated, never automatically retried. The attempt and provider outcome are retained against every agreement's notice deadline. Mailbox delivery and notice effectiveness are never claimed.

After an accepted human notice attempt, `agreement-disposition` takes `{agreement,version,scenario,hash,disposition:non-renewal|cancellation,confirmed:true,reason}` for an approved cancellation scenario. It records the native owner's separate agreement decision and a confirmed non-renewing agreement revision. It changes no PO or recurring series. The person separately ends the series through `recurring-disposition` and records outstanding PO cancellation through the authorized native receiving door. All actions enter AUDIT-001. Archives retain source-exact forecasts, consents, proposals, attempts and decisions without restoring native identity or execution authority. Notice recipient and actor fields are included in owner-reviewed erasure. Personal source values erased from scenarios, drafts and proposal runs retain their original hashes with sealed evidence for the anonymous retained facts. Archive validation still recomputes the monetary arithmetic. Erased scenarios are labelled historical and cannot approve, draft, send or authorize a disposition.


### Native supplier invoice approval

`POST /api/purse/command/supplier-invoice-rule` accepts
`{order, revision, version, enabled, consent: true, reason}`. Only the current
native owner can consent. The version starts at zero and fences updates. The
rule is bound to the current acknowledged PO, supplier link, frozen PDF and
invoice-access consent version. Renew invoice access as the current owner before
consenting again after an authority change. No supplier bearer can set a rule.

Native AP source confirmation and reasoned risk review automatically approve
exact three-way matched supplier submissions under that live rule. Approval
requires a confirmed private original, exact PO prices, accepted quantity,
proportionate approved freight and tax, and no unresolved INVOICE-003 flag.
Cash-planning approval alone does not grant payment approval. Capture replay
never makes a second approval. Owner, issuing buyer and approval-chain authority
are checked again in the atomic commit.

`POST /api/purse/command/supplier-invoice-schedule` accepts
`{invoice, version: 0, date, reason}` under current scoped `payable.approve`.
It records one audited native payment-date instruction, with no outbound call.
Unapproved, held, erased, withdrawn or stale evidence refuses scheduling. A
second schedule is refused. Approved and scheduled statuses are projected only
to the supplier link that submitted the invoice; Paid still requires the existing
exact accounting payment evidence. Original source documents and internal risk
and consent records stay private. Archives retain history without supplier bearer
or native identity authority.

### Internal purchasing comments

Native sessions read a thread with
`GET /api/purse/comments/:kind/:record`. The parent kind is `request` (including
travel), `order`, `invoice` (including its matching discrepancies), `supplier`
or `agreement`. Every read, change and attachment download checks current parent
visibility. Current assigned agreement owners may use their thread without
reading private agreement originals. Reassignment withdraws that thread access.

`comment-add` takes `{kind,record,attempt,body,mentions:[],file?}` through the
ordinary command door. Choose native member IDs returned by the thread picker;
a mention never grants record access. Repeating an author's exact capture is
inert, while changing its content under the same capture is refused.
`comment-edit` takes `{id,version,body,mentions:[],file?}` and `comment-delete`
takes `{id,version}`. Only the current author with current record visibility
may change a comment. Each version, actor, timestamp and file reference remains
in internal history and audit exports. A file is `{name,mediaType,base64}` with
at most 1 MB of decoded bytes; comment text is bounded to 10,000 characters and
each version may mention up to 20 distinct current members.

`GET /api/purse/comments/notices` returns the current member's mention notices
and up to 20 recent active comments in their present record scope. An inaccessible
mention includes only who mentioned the member, the time and a no-access
message. The Overview dashboard shows recent comments and mentions with links
back to their current records. Search matches current active comment text through
its parent result, using the same protected-identifier exclusions as document
text. Its derived index is excluded from archives and rebuilt from restored
history before search.

Comments cannot change approval state, queue position or age. They never enter
supplier messages, supplier links or PO documents. Complete archives retain
comment history and files without restoring identity authority; reviewed erasure
anonymizes authors and withdraws affected originals. External mention delivery,
provider reply binding and live supplier-inbox qualification remain unavailable.

## Native budget review

The current native owner uses `POST /api/purse/budget-import/columns` to read
CSV column names and `POST /api/purse/budget-import/preview` to review a complete
`{csv, mapping}`. Neither endpoint writes state. Mapping explicitly names
`columns`, `budgets`, `owners` and `dimensions`; dimensions map source department,
location, project and GL values to the selected existing dated policy. A source
owner label maps to a current active member. Alert thresholds are whole
percentages separated by semicolons in the mapped source column.

`POST /api/purse/command/budget-import-commit` takes that same input, the preview's
`fingerprint` and `review`, and `consent: true`. A changed source, mapping, state
or native session requires a fresh preview. The signed review is not portable
authority. Commit changes budget amounts and native alert custody, preserving
policy approval authority. An unchanged import performs no writes. Audit retains
source and mapping digests, amounts and assignments; it retains no CSV original.
Current scoped state reads expose only permitted budget positions and alerts.

## Private saved spend reports

REPORT-002 currently saves native REPORT-001 definitions, with each definition
private to its creating native member. The current `report.read` permission is
required on every list, open and download. Read-only auditors can read reports
but cannot change saved definitions. No sharing or scheduled delivery is implied.

- `GET /api/purse/saved-reports` lists currently usable private definitions and
  `maySave`. A definition whose filter is unavailable in the current scope is
  omitted; opening that definition directly is refused.
- `POST /api/purse/saved-reports` with `{name,filters}` saves the last applied
  filters. Supported keys are `from`, `through`, `groupBy`, `department`,
  `project`, `location`, `supplier`, `category`, `glAccount` and the native form
  dimension keys advertised by the current spend report. Dates are inclusive.
  Unavailable filter values and unsupported fields are refused.
- The same POST with `{id,version,name,filters}` replaces a private definition;
  `{id,version,remove:true}` removes it. A stale version returns 409.
- `GET /api/purse/saved-reports/:id/view` returns `{definition,report}` freshly
  computed from current records. The final native-session and revision fence
  also covers downloads at the same path ending in `csv` or `xlsx`.

XLSX contains Rows, Groups and Totals sheets. CSV contains the same tables in a
single header with a `recordType` column identifying Rows, Groups or Totals.
Amounts are exact integer minor units; unlike currencies are never combined.
Allocation shares and current native form dimensions are retained. XLSX text
cells are literal strings. CSV prefixes text that a spreadsheet might execute
with an apostrophe; numeric amounts remain numeric. Neither format includes
protected tax or bank data, source originals, contact fields or credentials.

Definitions contain no cached rows or access grants. Archives preserve their
private native-actor binding and audit provenance, exclude native sessions,
and do not automatically rebind definitions to a newly created identity.
Restoring a definition cannot restore revoked authority. Erasure anonymizes its
native actor and personal values through the existing reviewed erasure door.
Weekly and monthly email scheduling, received matching attachments, scoped
OData under API-001, the authorized scheduled Google Sheets connection and full
CODING-001 and CODING-002 qualification remain REPORT-002 gaps.

## Native cross-team reviews (INTAKE-005)

Category forms in Settings accept `reviews: [{type, reviewer, stage}]` through
`intake-form`. The supported teams are `security`, `privacy`, `it`, `legal` and
`finance`. Each form names at most one current member per team and a stage from
1 to 5. Equal stages run in parallel; earlier stages must approve first. All
active forms matching a request's purchase type or line categories apply,
including a request created without a category form. Publishing remains under
unrestricted `intake.admin` permission; assigning a reviewer grants no record
access or purchase-approval permission.

Submission opens reviews for the exact revision and current form versions.
`data.request[].crossTeamReviews` includes current and historical reviews,
completion and the caller's `mayReview` controls under current request-read
scope. `cross-review-record` accepts `{id, revision, version, decision, body,
file?}`. Decisions are `question`, `approved` or `rejected`; questions leave the
review unresolved. Only the assigned active native member with current request
access can respond. Each event retains notes, actor, time and optional file.
Files are limited to 1 MB each and ten per review, and use the ordinary scoped
attachment download door. Questions and decisions append to the audit, including
its CSV export; they never create a purchase decision or send external messages.

Approval, conversion and issuance require every current review to approve.
Amendments and approver edits require fresh reviews for the new revision, even
when a purchase decision may otherwise carry. Changed form versions also
invalidate earlier review authority. Disabling a form or removing reviews cannot
release the reviews already opened for the same submitted revision. Current membership, request scope and native
identity are checked again before purchase authority is used. The independent
purchase-approval policy remains required after the reviews finish.

Archives retain validated review history and files, but exclude installation
review authority. Restored approvals are historical; revise and submit under
current members before purchasing. Owner-reviewed erasure anonymizes review
identities, withdraws affected files and removes their local authority. Erased
captures cannot be replayed. Jira, ServiceNow, Linen, OneTrust and Locket review
connections are not implemented by this native door.

## Hosted catalogue CSV

`POST /api/purse/catalogue-import/preview` accepts `{csv}` and returns reviewed
rows, currency-specific before and after prices, availability, source hash,
fingerprint and a session-bound review token. It writes nothing and requires
current unrestricted procurement management. `catalogue-import-commit` on the
native command route accepts the same `csv`, `fingerprint`, `review` and
`consent:true`. It rechecks current authority, exact bytes and state, validates
all rows before any writes, and returns `changes`, `sourceHash` and item IDs.
An unchanged import writes nothing. The column format and supplier identity
rules are documented in IMPORTING.md. There is no outbound supplier action.


### Native invoice exceptions and receipt corrections

`GET /api/purse/invoice-exceptions` returns current matching context only for
invoices the session may already read. Each row retains its first recorded time,
reasoned assignment history, current assignee availability and a source version.
Candidates are current native members who can already act as the buyer,
requester or receiver on the current PO. An assignment grants no access. Assignees without invoice read permission
receive a deduplicated PO task with only their existing purchase and aggregate
receiving context; no invoice identity, amounts, reason or private thread is
returned. Reassignment removes the previous assignee's task.

`POST /api/purse/command/assign-invoice-exception` requires existing scoped
invoice review and read permissions, the exception `id`, `version`,
`sourceVersion`, a current candidate `assignee` and a `reason`. Reassignment
retains the first recorded time. Exception comments use the existing private
comment door with `kind: "invoiceException"`; mentions never widen access.

`POST /api/purse/command/receipt-correction` requires the current receiver
authority and an original native goods `receipt`, current `receiptVersion`,
`expectedQ` in thousandths, corrected decimal-string `quantity`, a unique
`attempt` and the receiver's `reason`. Zero is supported as the corrected
quantity. The append-only delta retains the original and refuses stale,
replayed, excessive, imported, service and superseded-receipt changes.
The corrected net position, including separate returns, must stay within the
PO balance: receiving 8, returning 2 and correcting that delivery to 11 leaves
9 accepted against a 10-unit PO. Archives preserve the same net position.
Receivers continue to see only the PO's aggregate invoice matching state.
Correction recalculates matching context and commitment position, preserves
invoice originals and all risk holds, and creates no invoice or payment
approval. Existing independent cash-planning review remains required. An open matching
exception suspends current cash eligibility while retaining historical approval.

## Native received-not-billed report

Receivers can pass `effectiveDate` to the existing `receipt` and
`service-receipt` commands. It defaults to the recording day in the installation
timezone and must be between native issuance (or explicit adoption) and today,
inclusive. `at` remains the recording instant; `recordedDate` and
`receivedTimezone` retain the calendar basis. Approved commercial terms and
receiving authority are unchanged. Historical source dates are never invented.

`GET /api/purse/accrual-report/view?cutoff=YYYY-MM-DD` requires current
`report.read`, PO reads and complete bill-source visibility for each purchase.
Optional exact filters are `entity`, `department`, `location`, `supplier` and
`glAccount`; class and project are also supported by the native report door.
The response contains line and allocation `rows`, coding `groups`, separate
currency `totals`, receipt and bill drill-through, separate imported `deposits`,
and completeness warnings. Returned quantities use thousandths and money uses
integer minor units. Receipts use their effective dates, including late entries.
Only source-confirmed genuine native bill approvals with qualifying invoice
dates reduce accrual. Pending, disputed or held evidence and cash-planning
approval do not. Later reopening cannot erase an earlier closed-balance cutoff.

The same route ending in `csv` or `xlsx` recomputes under the same fresh scope
and session fence. Both contain source rows, receipts, eligible and excluded
bills, coding groups, currency totals, deposits and completeness notes. Text
cells stay literal. Credentials, protected values and originals are absent.

The route ending in `xero` additionally requires one explicit `currency` and
`liabilityAccount`. It downloads balanced period-end manual-journal CSV entries
for the native entity: expense or asset GL debit and accrued-liability credit.
Department and location are the two proposed tracking columns; other supplied
coding stays in the description for review. The chosen account must differ
from each debit account. Live Xero import and tracking qualification remains
pending. Downloading never posts a journal or creates a reversal. All ledger
posting, additional entities, card-paid exclusions and unsupported historical
approval and deposit cases remain in REPORT-004's Gap. Archives preserve dated
source evidence without granting restored identities or supplier links authority.


A current scoped invoice reviewer can use `invoice-dispute` with
`{invoice, version, disputed, reason}` to open or resolve a dispute. The first
version is zero. Each changed decision retains its reason, actor and time in
invoice history and the audit export. A dispute holds both genuine bill
approval and cash-planning approval and excludes a historical approval from
accrual reduction until resolved; resolution itself never grants approval.

## Native supplier credits

The native command door accepts `rma-prepare` with `{receipt,reason}` for a
recorded return or rejection on an issued native PO. Current scoped procurement
management prepares at most one RMA per receipt. `rma-record` takes
`{id,version,status,reference,reason}` to record a human-observed authorized,
declined or closed outcome. These records send no supplier request or message. `service-receipt` also
accepts `{order,line,receiptVersion,event:'reject',valueAmount,reason}` for
outstanding service value, without accepting it or releasing its commitment.

`supplier-credit-capture` takes `{rma,reference,creditDate,currency,amount,
source,document}` under current invoice capture and read scope. The actual
original uses `{name,mediaType,base64}`, up to 1 MB. Capture retains immutable
facts and a private original; it creates no usable credit yet. Repeating the
exact source is inert. Conflicting supplier references or reused original bytes
are refused. `supplier-credit-review` takes `{id,version,sourceHash,consent:true,
reason}` under invoice review scope, after a person checks the exact original
against all retained facts. Human review does not authenticate a provider.

`supplier-credit-apply` takes `{credit,version,invoice,invoiceVersion,amount,
reason}` under current payable approval and invoice read scope on both sources.
Use the credit version and the invoice `creditVersion` from current state.
An open reviewed credit applies once to each later bill, in the same supplier
and currency, within both remaining amounts. Stale state, withdrawn evidence,
unresolved matching or risk holds and unapproved planning terms refuse the
application. Synced, imported, paid and deposit bills require their separate
qualification. Bills with native credit applications cannot post to Pantry
until ledger credit transport exists.

Applications are append-only financial evidence. Gross invoice amounts, original
bytes, commitment events and payment status stay intact. Native cash-plan due
subtracts applications once, and supplier balances remain separated by currency
and limited to the reader's current scope. Archives retain validated RMA,
credit, application and audit history without restoring sessions or grants.
Reviewed erasure withdraws affected originals, preserves anonymous financial
amounts and refuses new applications or capture replays from erased evidence.


## Native supplier groups at buyer conversion

The native `convert` command accepts a destination `supplier` on each existing
`conversionEdits.lines` entry. Different active suppliers split a wholly unissued
ordinary goods request into supplier-specific purchase orders. The response
retains the first order fields and adds `supplierOrders`, containing every exact
group document. Each line retains its original source ID, coding and allocations.
Every supplied charge is allocated by source line value with exact integer cents;
largest remainder wins, with original line order breaking ties. Supplied line tax
is retained. Each group freezes its supplier identity, approved common commercial
terms and the applicable document profile, including original terms and only an
applicable exemption certificate.

Price and quantity caps apply to each line and to the complete edited request.
An over-limit edit or a budget overage returns an approval revision without any
PO. The current purchase chain and all required allocation budget owners must
approve before conversion proceeds. A buyer calling `issue` for any prepared
group issues all groups in the same native transaction, after fresh authority,
supplier, complete-source, variance and budget checks. A replay or competing
conversion cannot allocate the source lines again. One aggregate request ledger
backs the groups; each report source and invoice balance names the actual PO.

This door supports the existing single business and currency. Automatic group
generation, combined requests and migrations of existing issued, received, billed,
service, blanket, recurring or adopted groups remain unavailable. Grouped date
changes and amendments require a separately supported disposition; this door
refuses them. Native group issuance sends no supplier message and records no
payment or connected-ledger posting.

## Native notification list

The current native session reads `GET /api/purse/notifications` and receives an
`items` list, including read and dismissed history. Native approval-needed,
returned, approved, comment-mention and receipt-needed events bind the recipient's
native identity to an exact source event and purchasing revision or comment version.
This list grants no purchasing permission and creates no outbound delivery.

`POST /api/purse/command/notification-read` and
`POST /api/purse/command/notification-dismiss` accept `{ "id": "notification identifier" }`.
Read and dismissal are monotonic; repeated requests return the same state. Dismissal
also marks the item read. Every read and action checks current membership and source
scope. Another recipient's identifier returns 404. An inaccessible source has no
source identifiers, title, body or link in the list, and its actions return 403.
Historical purchasing tasks are labelled earlier events when their source revision
or current approval step is no longer actionable.

Archives retain notification history and state. Native recipient identity is not
restored, and signing in with a newly invited identity for the same mailbox never
claims historical notices. Only fresh native events address that identity. Erasure
anonymizes recipients and withdraws affected source content. Channel preferences,
digests, quiet hours, urgent bypass and external delivery remain the NOTIFY-001 Gap.
