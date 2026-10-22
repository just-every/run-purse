# Local agent interface

Except INTAKE-007’s dedicated bearer create-request door below, `/api/purse/*` endpoints use the current native operator session and purchasing capabilities. Mutations require an exact same-origin `Origin` header and session cookie. The local dev key is not a purchasing grant. Sign in normally or use `rer dev --as PERSONA`, then configure that persona's membership as owner. Never persist a sign-in URL or session cookie in a task, log or source file.

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
quotes, receipts, invoices and commitments are not copied. This native slice
does not implement conditional forms, arbitrary half-filled autosave, route
preview, splits, custom fields or pending supplier proposals.

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
