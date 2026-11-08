# sx-purse-f96fix2 results

Repaired only the two gate blockers on the stacked preparation-erasure change. The product branch is `cloud/sx-purse-f96fix2`, head `8d2101bba1ae215a91ac9777608ab98fa461579e`. The product push succeeded on its first attempt. No PR is required by the repository's push Verify entry point and none was created. No main push or landing was performed.

The original round was based on `951a12174c7dd7769b3917d9e9956d25d7e433cd`. Its three commits were replayed onto current main `f15435d1a322f4aa5196d131ecdec1a71c9a9799` on this previously unpublished branch. The prior round branch was not changed. The repair commit changes only `./src/purse/erasure-agent-artifacts.ts`, `./tests/agent-door-erasure.mjs` and the regenerated source lock. The invoice-risk fixture correction is preserved byte for byte relative to the repair parent. There is no contract diff against main.

Before and after counts: **55 DONE, 51 PARTIAL, 22 MISSING**. BASE-AGENT-009 remains PARTIAL. No plan row or clause judgment changed, no acceptance point was added, and no wider campaign work was undertaken.

## Reproduced blockers and results

| Finding | Original public-door result | Repair proof |
| --- | --- | --- |
| A: Mary with saved preparation approvals | Owner erasure preview returned 409, with the error that erasure could not settle current authority or source custody. The scrub had renamed the protocol summary key. | `./tests/agent-door-erasure.mjs`, `agentDoorErasure`, lines 88–127 and 145: owner preview and execution succeed, saved completed and expired approval displays remain readable, pending consent remains unusable, and private target values are removed. |
| B: Stan after the daily cap | The first capped preparation succeeded and the next was blocked. After erasure the stored class became `Personal data eraseddard`; a fresh call was autonomous and created a second preparation under revision 1. | The same journey, lines 146–168: a distinct live agent consumes the signed seed-scoped daily allowance; calls before and after erasure return `policy_blocked` at the same revision; usage rows remain identical and there is no extra preparation. The separate minimal public-door probe also passes after the repair. |

The scrub now preserves protocol object keys and class identifiers in class and rule records. The open tool fields map still scrubs matching custom keys and values, including user fields called action, kind, logo or class. Original idempotency claims, epoch guards, stale-review refusal, current-owner checks and expiration of unexecuted consent remain in place.

The existing erasure journey was extended. No registration was added, removed, skipped or narrowed, and no earlier assertion was removed. The capped client is independent of the existing replay clients so the replay assertions retain their prior policy conditions.

PROBE BLOCKING-A: owner erasure preview and execute for Mary with pending and completed saved approvals -> HTTP 200, complete receipt, readable anonymous summaries, expired pending consent refused.
PROBE BLOCKING-B: fresh MCP preparation before and after erasing Stan after consuming the daily allowance -> policy_blocked at unchanged revision, identical usage records, no extra native preparation.

## Validation and receipts

`./checks.json` binds the final local checks to the full committed head. The touched erasure journey, `pnpm typecheck`, `npx -y @runeditrun/rer check --profile first-party` and `node scripts/edition-authoring/cli.mjs check` all exited 0. The browser journey exited 0 at assertion width 1440 and captured the review feed, pending approval, completed approval and audit counts at 1440 and 390. It ran after main reconciliation on the same source and test bytes committed in this candidate; only lock generation and the commit followed. The eight original PNGs and their hashes and dimensions are in the packet. Browser and server processes started by the journey closed normally.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=AGENTS.md Lander-Regenerate write and check with all documented clause arguments exit=0; ledger=none, no migration edited in the repair exit=0.

The complete documented generator argument lists are in the repository AGENTS.md command; actual generator logs are `./views-write.log` and `./views-check.log`. Generated ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main. Source lock generation followed the final source and test edit and main reconciliation. The final post-commit lock check also passed. The repository hooks remained active. Every candidate author and committer is the fleet identity; all trailers are absent. Actual identity output is in `./candidate-identities.txt`.

CI: exact-head push Verify was discovered as run **42435906406**, event push, initially queued. Its actual REST receipt is in `./ci-discovery.json`. No workflow was dispatched or rerun. Subsequent observed state, if polled, is recorded separately in this packet. No result from another SHA is treated as this candidate's result.

Publication scan: commit=8d2101bba1ae215a91ac9777608ab98fa461579e; complete=NOT_RUN_IN_CLOUD; historyScanned=NOT_ESTABLISHED; findings=NOT_ESTABLISHED. The fleet lander owns the complete full-history publication scan and exact-SHA CI and landing gates. Main does not equal the candidate: its reconciled head is f15435d1a322f4aa5196d131ecdec1a71c9a9799. Run site on the candidate is not established because this cloud did not land it. These are not reported as passing receipts.

## DONE riders and scoped self-check

No DONE promotion is claimed, so these results describe the repair's actual boundary.

| Rider | Result and evidence |
| --- | --- |
| 1 | Scoped repair PASS: both named public-door outcomes reached by agentDoorErasure; full wider registry qualification remains unclaimed. |
| 2 | PASS: actual preparations are created; unsafe stale owner reviews, non-owner execution, erased pending consent, replay resurrection and exhausted allowance are refused without the forbidden native effect. Journey lines 95–168. |
| 3 | Local PASS; exact-SHA Verify receipt is separate. The existing package test command and browser shard 44 invoke these unchanged journey entry points. No final green CI is inferred from the local run. |
| 4 | PASS: final native journey and typecheck ran on the exact committed head. Browser ran on identical source and test bytes after reconciliation; browser-receipt.json records this boundary. |
| 5 | UNCHANGED: BASE-AGENT-009 states that it extends BASE-OPS-005. No inheritance text changed or wider duty qualification claimed. |
| 6 | PASS mechanically: documented generator write and check exit 0, generated views restored, all Status, Gap and Evidence cells unchanged. Existing wider Gap remains. |
| 7 | PASS: no acceptance text change, rewrite or ruling change. |
| 8 | PASS for the named authority defect: supported creation succeeds, exhausted-cap calls are denied before and after erasure; non-owner erasure and expired consent are also denied. |
| 9 | PASS boundary: no provider, legal, retention-period or sandbox qualification claimed. |
| 10 | PASS: no new policy default; the same signed policy and revision are preserved across erasure. |
| 11 | PENDING FLEET LANDING: no main equality, publication scan or candidate Run site claim. |

Pre-ready self-check: all changed named behavior has a failing-before and passing-after public-door assertion; earlier assertions remain present; erasure and replay paths preserve anonymous history without restoring pending authority; UI source is untouched and the existing affected screens were captured at both widths; lock is fresh. Full registry, scan, landing and CI qualification are not promoted by the local results. The repair introduced no literal email address or provider-shaped fixture credential in its source or test diff. There is no new provider account or key dependency for the two repairs.

## Full plan outcome and custody

The plan in PLAN.md was carried out: fleet setup, full-history stacked clone, source and door inspection, both reproductions, the narrow scrub repair, existing-journey extension, main reconciliation, projection and lock mechanics, scoped checks and browser proof, candidate identity inspection, guarded product push and exact-SHA run discovery. Evidence is transported separately through the explicit report-only entry point. Product custody and evidence custody are independent; evidence publication does not establish READY, acceptance or landing.

CLAIM BASE-AGENT-009 PARTIAL points=none tests=tests/agent-door-erasure.mjs#agentDoorErasure; tests/browser-agent-door-erasure.mjs#retained-artifact erasure
GAP BASE-AGENT-009: Wider registry qualification remains outside this two-blocker FIX round; no complete-clause promotion is claimed.
