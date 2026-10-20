# Local agent interface

Except INTAKE-007’s dedicated bearer create-request door below, `/api/purse/*` endpoints use the current native operator session and purchasing capabilities. Mutations require an exact same-origin `Origin` header and session cookie. The local dev key is not a purchasing grant. Sign in normally or use `rer dev --as PERSONA`, then configure that persona's membership as owner. Never persist a sign-in URL or session cookie in a task, log or source file.

`GET /api/purse/state` returns only the actor's scoped workspace. `POST /api/purse/command/:action` accepts structured JSON; the server calculates totals, chooses policy, checks exact revisions and records the authenticated actor. Client actor, role, total and authority fields cannot confer authority. A 409 means state changed or authority is absent: inspect the error and fresh state; there is no automatic retry.

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
