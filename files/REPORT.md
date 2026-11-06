# sx-purse-c-f90: native agent capacity qualification

Repository: just-every/run-purse. Product branch: cloud/sx-purse-c-f90. Pushed head: e245cdba16e8478fbc1a4b1f88cf94975dea40c1. The implementation commit is 2f4aeb7e9b4f263b5b24876ef62a32dac0f394c2; the final commit corrects two contract Evidence labels and refreshes the source lock. No PR is needed for the existing branch Verify entry point.

BASE-AGENT-011 remains PARTIAL. Acceptance point 1 gains a passing native public-door journey. Counts remain **54 DONE, 51 PARTIAL, 22 MISSING, 127 total**, before and after. No other clause status or acceptance sentence changes. The target plan row gains point-1 qualification only; no Mac plan or inbox file was read or written.

## Plan and result

The full plan is in PLAN.md. The work mapped the existing Base admission counter, MCP transport, discovery metadata and automatic-retry protocol client; added one raw native Worker sanity journey; registered it in the existing native command; checked the touched flows and local gates; regenerated the contract and source lock; synchronized main; and pushed the named branch. All product work is in the two product commits. Reports and receipts are kept outside the product tree and use the separate evidence ref.

The source implementation was already present. The missing proof was a real raw 429 response: the conformance request helper retries 429 responses automatically. The new journey uses direct HTTP fetch requests to the actual local Worker, reads requestsPerMinute from discovery, and exercises one fresh authenticated agent with limit plus one list requests. It never lowers the limit, writes admission counters, replaces authentication, advances the clock, or modifies copied Base module bytes.

A short bounded scheduling wait starts the burst with enough time remaining in a real minute window. The test asserts that the entire burst stays within that window. This is harness scheduling only; it adds no window-recovery, elapsed-time guarantee, dual-host or queued-continuation claim. At the unchanged advertised limit of 600, exact-candidate proof admits 600 requests and refuses the next with HTTP 429, rate_limited and a positive numeric Retry-After.

Before the burst, native commands create a nonempty purchase worth 3000 minor units and the independent agent reads the native purchasing witness. After the burst, that independent agent reads the same witness, the person's existing session reads the entire unchanged native purchasing state, and that person amends the purchase through its native command. The saved amendment advances one revision and retains the amount; decisions, orders, commitments, receipts, invoices and outbound attempts remain unchanged. The exhausted agent is still refused afterward. No mail is emitted.

## Acceptance map

| Point | Result and public-door proof |
| --- | --- |
| 1: rate overrun with Retry-After | Newly qualified by `tests/agent-door-capacity.mjs`, native MCP capacity and signed-in purchasing continuity. Discovery and raw authenticated transport are at lines 19–58; independent-agent and signed-in purchasing continuity at lines 60–82. The actual terminal output is in capacity.log and the confirmed exit receipt in capacity-recheck.log. |
| 2: recipient-volume cap | Not newly qualified. The existing recipient-volume rule qualification remains open. |
| 3: exhausted provider spend and usage | Not newly qualified. Provider spend remains unenforced and requires the held implementation and qualification. |
| 4: no-cap provider spending and zero-cost calls | Not newly qualified. No provider-spending registry or provider-cost claim is added. |
| 5: complete usage view | Not newly qualified. Expanded usage reporting remains open. |
| 6: seed and Business Pause, resume | No new qualification. Existing current-CORE Pause and replay proof is retained; expanded seed and Business lifecycle qualification remains open. |
| 7: agent-token resume refusal | No new qualification. The broader token-refusal qualification remains open. |

The original Gap is retained verbatim before an explicit statement that points 2–7 are not newly qualified. The unjudged 116-tool proposal, broader purchasing registry, events, subscriptions, provider spend and unscoped lifecycle families remain omitted. All shipped account, prerequisite and gate-loop holds remain in force. No new policy default or ct ruling is needed for this test-only capacity proof. No DONE claim or judge request is made.

## Verification and mutation

- The focused native capacity journey passes with the pinned Node 22.20.0 runtime against the exact final candidate. It asserts successful authenticated listing, actual overrun refusal, the wire error code, numeric positive Retry-After, preserved native purchasing state, per-agent isolation and the signed-in person's native amendment.
- `node tests/agent-door-quotes.mjs` passes. This existing shared-harness journey still exercises native purchasing parity, all four policy dispositions, once-only capture, stale-state refusal, current authority, revoked and erased sponsors, and preserved purchasing effects. Its relevant bytes are unchanged between execution and the final head.
- One exact-head invocation printed both passing probe lines but ended with exit 1 and no assertion, exception or transport diagnostic. An isolated recheck of the same native command, with explicit native-process and subreaper exit reporting, passed with both exits 0. No code was changed in response; both actual receipts are retained.
- Typecheck, actual Worker build, first-party contract checks, generated contract write and check, source lock generation and check, and offline copied-Base integrity pass. See checks.json and base-copy-integrity.json. The contract generator used the exact full AGENTS.md clause list.
- The generated ACCEPTANCE.md and docs/CLAIMS.md were restored whole from origin/main after successful generation and checking. They are deliberately absent from product commits. A later check on those restored views may report staleness until the fleet lander writes them.
- One local first-party check on the implementation commit failed because backticked wire labels were interpreted as file paths. The follow-up removes those two backticks without changing acceptance text or assertions. The same first-party command then passes. This was a local metadata correction, not a CI assertion repair.
- No existing test or assertion is deleted, narrowed or moved behind a condition. One focused assert script is added to the existing native command. The command's static native inventory has 134 registration call sites and two standalone scripts after this change; no test-budget raise is introduced. This inventory is not represented as a full dynamic seed-wide test count.
- UI files and visible screens are unchanged, so browser screenshot and tooltip checks do not apply to this slice. Existing browser proof is not presented as new evidence.

| Rubric | Distinct mutation and observed result |
| --- | --- |
| BASE-AGENT-011.1 | Temporarily change only the test Worker's response status from the real admission 429 to 200. The new journey exits 1 at line 50: “The advertised per-agent capacity must be served”, 601 !== 600. The original test Worker bytes are restored in a finally block. mutation-status.json and mutation-status.log preserve the actual result. The final source lock and copied-Base check pass after restoration. |

## DONE-RIDERS review

The whole clause is intentionally not promoted. This table records the boundaries instead of treating a point-1 proof as full DONE.

| Rider | Result for this candidate |
| --- | --- |
| 1 | PASS for the selected point: real discovery, listing, actual refusal and native purchasing continuity are exercised. FAIL for a whole-clause DONE claim because points 2–7 are not newly qualified. |
| 2 | PASS for the selected point: nonempty native purchasing data, all admitted requests and the unsafe overrun are checked; refusal changes no purchasing state. The mutation demonstrates failure if the wire status is wrong. |
| 3 | Exact-SHA Verify is recorded in ci-final.json. No earlier-SHA green result substitutes for the final head. |
| 4 | The final capacity receipt binds the final head; the preceding commit differs only in contract prose and source lock. Other retained checks use identical relevant bytes. |
| 5 | Not applicable: no receiving clause or inherited-duty rewrite. |
| 6 | PASS for this partial row: Evidence names the new journey; Gap retains the original holds and explicitly names unqualified points. Generator write and check pass before the mandated restoration of generated views. Existing global Judged-from provenance is not falsely replaced with a self-referential candidate claim. |
| 7 | PASS: no acceptance text changes, no ct riders added or duplicated, and all 127 parent Status rows remain in both product commits. |
| 8 | PASS within scope: capacity refusal leaves purchases unchanged and the same current native session retains access. No new permission, refund, correction or agent-execution authority is introduced. |
| 9 | PASS: no provider, legal, elapsed-time, window-recovery or other held qualification is claimed. |
| 10 | Not applicable: no policy decision or new default is introduced. |
| 11 | Pending fleet landing. The cloud did not scan, update main or run Run site. No COMPLETE publication scan or landing result is invented. |

## Mechanical and custody receipts

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=AGENTS.md Lander-Regenerate write then check, followed by restoration of both generated view files exit=0; ledger=none exit=0.

PROBE BASE-AGENT-011 1: authenticated raw MCP listing burst -> 600 admitted, first excess request HTTP 429 rate_limited with a positive numeric Retry-After; discovery-derived unchanged production capacity, one real window.

PROBE BASE-AGENT-011 1 isolation: native purchasing witness and entire purchasing state unchanged -> independent agent and signed-in person reads succeed, person amendment persists one revision, exhausted agent remains refused, no commitment, invoice or outbound effect.

Before both pushes, every candidate commit, including possible side parents, was checked against origin/main for fleet author and committer identity and allowed trailers. Both candidate commits have fleet identity and no trailers. No new email-shaped string occurs in added product text. Product publication uses only cloud/sx-purse-c-f90 through cloud-push.py, succeeding on the first attempt each time. Main was fetched before both candidate commits; the published branch used merge, never rebase, afterward. Main remained 0ed797ae6afe100f4663956427ebcc2a58319d40 at synchronization. That main's Verify 41873986198 and Run site 41873986625 were green; they are baseline facts, not final-candidate proof.

Exact candidate Verify: run 42215501776, workflow_dispatch, e245cdba16e8478fbc1a4b1f88cf94975dea40c1. The final observed status and conclusion are in ci-final.json. Earlier push run 42215062344 belongs to the implementation commit and is not substituted for the final candidate.

Complete product provenance is in product-receipt.json, push transport receipts in product-push.log and final-product-push.log, and final CI observations in ci-final.json. The final documentation-only commit uses skip-ci as required; exactly one Verify dispatch is allowed only after discovery confirms no existing Verify on that head. The single watcher records actual run ids, events and conclusions with at least 300 seconds between observations. No PR, default-branch push, provider dispatch, Base refresh or publication scan is performed.

There is no unresolved product blocker in the selected point. Remaining full-clause obligations stay in the Gap. Exact-SHA CI and fleet landing results are recorded separately; evidence publication does not assert acceptance or landing.

## Terminal CI handoff

At 2026-11-06T12:29:25.689692+00:00, exact-head Verify 42215501776 remains in progress with no conclusion. Eight of the ten available GitHub calls were used; two are retained for failure diagnostics. The bounded watcher has ended. This is a PUSHED handoff, not a green Verify, READY, DONE or landing claim. No CI failure was observed, no failed-job logs were fetched and no CI repair was attempted. The fleet must observe the final Verify result, run the full-history publication scan and apply its landing gates.
