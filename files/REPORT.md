# sx-purse-c-f92 report

CLAIM BASE-AGENT-011 PARTIAL points=1 tests=tests/agent-door-capacity.mjs#native MCP capacity and signed-in purchasing continuity
GAP BASE-AGENT-011: Points 2–7 remain unqualified in this planner-selected point-1 slice: outside-recipient daily caps, provider spend exhaustion and no-cap usage, complete usage view, expanded seed and Business Pause, resume and token refusal. Existing account, prerequisite and gate-loop holds are retained. No recovery, elapsed-time, dual-host, queued continuation, broader registry, events or subscription qualification is claimed.

Repository: just-every/run-purse. Branch: cloud/sx-purse-c-f92.
Candidate: `9bc9d51a9db7d36a63e23bb69d7b9042a1fee49e`.
Current integrated main: `60134d0d91def75bb0a9fd2e67d2e9dae714c68b`.
Save: `e5bbadbfe2b59023af8bc98dd0fd64a6eefd9a70` (skip CI).
Product custody: both product pushes succeeded, and the exact candidate remote ref was read back. No PR is required by the repository's push Verify entry point; none was created. Main was not pushed.
Counts before and after: 54 DONE, 51 PARTIAL, 22 MISSING (127 clauses). BASE-AGENT-011 stays PARTIAL. Plan row reported: BASE-AGENT-011 point 1 qualified with both policy fixtures; all held plan rows unchanged. No new default or scope ruling was adopted.

The full execution plan is in PLAN.md. The f90 product proof was retained from `e245cdba16e8478fbc1a4b1f88cf94975dea40c1`, excluding its protected status-row edit, on main. After publishing the first save, updated main was merged without rewriting published history. Main's company-money proof, named Worker exports, policy-test clock support, complete test registration and newer CONTRACT judgments were retained. The capacity harness supplies no clock override. CONTRACT.md, ACCEPTANCE.md, docs/CLAIMS.md and the copied agent-door Base module have no candidate diff against integrated main. The merge's incoming CONTRACT diff is main's own judgment, not a builder-authored status change.

Changed product files: package.json, sources.lock.json, tests/agent-door-capacity.mjs, tests/agent-door-worker.ts and tests/purse-harness.mjs. There are no production-limit, Base-pin, homepage, logo, workflow, migration or UI changes. One focused transport sanity registration is added; no existing test or assertion is removed, skipped or narrowed. Both policy cases are data inside that registration. The existing quotation and incoming native money-policy registrations remain in the normal Verify command.

The actual local workerd runtime uses real D1 and the copied admission counter. Disposable signing trust is generated only for this installation. The raw burst uses fetch directly, bypassing the protocol helper's automatic 429 retries. It derives capacity from discovery, bounds calls and concurrency, and asserts all burst requests remain in one real minute window. The native purchasing witness and full state are checked before the person makes a separate explicit amendment.

Exact-head runtime probes:

PROBE BASE-AGENT-011 1 autonomous: authenticated raw MCP listing burst -> 600 admitted, 1 HTTP 429 rate_limited, Retry-After=56; advertised capacity=600; one real window=29899531; durationMs=4308
PROBE BASE-AGENT-011 1 autonomous isolation: same-agent replacement token remains limited; invalid bearer refused; native purchasing witness unchanged; second agent and signed-in person read succeed; person amendment advances one revision; no commitment, invoice or outbound effect
PROBE BASE-AGENT-011 1 held: authenticated raw MCP listing burst -> 600 admitted, 1 HTTP 429 rate_limited, Retry-After=51; advertised capacity=600; one real window=29899531; durationMs=4573
PROBE BASE-AGENT-011 1 held isolation: same-agent replacement token remains limited; invalid bearer refused; native purchasing witness unchanged; second agent and signed-in person read succeed; person amendment advances one revision; no commitment, invoice or outbound effect

Acceptance coverage (the named test is `native MCP capacity and signed-in purchasing continuity` in ./tests/agent-door-capacity.mjs):

| Point | Acceptance outcome | Result and proof on `9bc9d51a9db7d36a63e23bb69d7b9042a1fee49e` |
| --- | --- | --- |
| 1 | A rate overrun returns 429 with Retry-After. | PASS locally: lines 17–64 run autonomous and held policies, discover the unchanged capacity, admit that many real authenticated raw listing calls, then assert exactly one overrun with rate_limited, a positive numeric Retry-After and no listing result. Lines 66–75 check same-agent replacement credentials remain limited and invalid credentials return 401. Normal push Verify loads this through ./package.json lines 33 and 40 and the existing verify:app command. Exact-SHA Verify status is recorded below. |
| 2 | Fourth outside recipient uses the rule past a daily cap of three. | NOT NEWLY QUALIFIED; the shipped plan explicitly holds recipient-volume rules. No external-send authority is added. |
| 3 | Exhausted provider spend returns budget_exhausted before effects and shows spend. | NOT NEWLY QUALIFIED; provider spend enforcement remains an existing Base boundary, with no provider-cost tool introduced. |
| 4 | No-cap spending works and reports spend; zero-spend calls remain unaffected. | NOT NEWLY QUALIFIED; no-cap provider usage and zero-spend qualification are held in the planner scope. |
| 5 | Usage shows calls, class decisions, money moved and provider spend per agent. | NOT NEWLY QUALIFIED; the complete usage outcome remains held. Incoming main's independent money-policy proof is preserved and its integration run passed, but is not counted as a new point-5 qualification. |
| 6 | Seed Pause and Business Pause stop calls within 60 seconds; resume restores access. | NOT NEWLY QUALIFIED; existing CORE pause and replay evidence is retained, with timed, dual-host and queued lifecycle families still unscoped. |
| 7 | Agent tokens cannot resume. | NOT NEWLY QUALIFIED in this slice; expanded token-refusal coverage remains held. |

Additional requirement and preservation rows:

| Duty | Result and proof |
| --- | --- |
| Capacity protects the installation and is separate from policy. | PASS for the selected rate boundary: the same derived limit is exercised under both policy fixtures, ./tests/agent-door-capacity.mjs lines 17–64. No daily business-volume or byte-capacity claim is added. |
| Native purchasing remains unchanged by read-only capacity refusals. | PASS: the witness and complete data are equal after refusals, lines 78–81; independent decision, order, commitment, receipt, invoice and outbound rows remain equal after the person's explicit amendment, lines 89–99. |
| People keep working independently of the exhausted agent. | PASS: owner state read and amendment use actual native HTTP, lines 79–91; exact revision increment, saved data and amount are asserted. The exhausted agent remains refused in the same window, lines 93–98. |
| Current authority, replay and erasure protections remain. | PASS for touched boundaries: invalid bearer refusal in the capacity journey; ./tests/agent-door-quotes.mjs retains wrong-role, stale, revoked and erased sponsor refusal plus once-only capture replay and no outbound effects. Its exact-head run passed. Broader lifecycle qualification is not claimed. |
| Inheritance and receiving clauses. | INSPECTED: no acceptance or receiving-clause text is changed and no new Base duty is assigned elsewhere. No obligation is removed or promoted. |
| Production limits and copied Base module bytes. | PASS: empty diff against main in ./src/modules/agent-door and the documented offline Base-copy check exits 0. No counter writes, capacity mocks, Base refresh or lowered limit. |

DONE-RIDERS review (no DONE claim is made):

| Row | Result | Evidence or remaining condition |
| --- | --- | --- |
| 1 | FAIL for full DONE | Point 1 has a real journey; points 2–7 remain held. Therefore the clause stays PARTIAL. |
| 2 | PASS for point 1 | Real seeded purchase, admitted case, refused overrun, no result disclosure, token continuity and unchanged native state; exact-head capacity log. |
| 3 | PENDING CI | Registered in normal push Verify; run 42225935643 targets the exact full candidate SHA. See final CI receipt. |
| 4 | PASS locally | ./LOCAL-RECEIPTS.json binds each focused run and mechanical check to the exact candidate SHA. |
| 5 | INSPECTED | No receiving-clause or inheritance change; no broader duty claimed. |
| 6 | PASS mechanics | Documented contract write and check both exit 0; generated views restored to main. Protected status, Gap and Evidence cells remain main's. The lander owns any later provenance update. |
| 7 | PASS | No acceptance text, coverage map or ct ruling is edited. |
| 8 | PASS for touched boundary | Invalid bearer is refused without a private result; signed-in native allowed case and purchasing state preservation pass. Existing quotation authority and revoked-sponsor cases pass on the exact candidate. |
| 9 | PASS honesty | No provider, delivery, cost, legal or timed lifecycle boundary is claimed qualified. |
| 10 | PASS | No new custody, consent, spending or authority default is adopted. |
| 11 | PENDING LANDER | Candidate is branch-only; main equality, exact landed Run site and publication scan remain the maintained lander's work. |

Pre-ready self-check:

1. The selected visible outcome has a public-door test that fails if capacity admission, refusal status, error code, header, isolation or native continuity breaks. Full-clause DONE is not claimed. Exact-SHA Verify is recorded separately.
2. No pre-existing assertion was removed, narrowed, skipped or moved behind a width or branch condition.
3. Authority and replay preservation are covered by the exact-head capacity and quotation runs; no new erasure, capture or outbound production door is introduced.
4. No screen or icon-only control is touched. The incoming money-policy browser integration passed with system Chromium and captured its existing screens at 1440 and 390; it is regression evidence, not a new UI qualification.
5. Source lock and offline Base integrity pass on the exact candidate. The scanner is unavailable in this cloud by design and is delegated to the fleet lander; no zero-findings or landed-main claim is made.

Mechanical receipt:

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then node scripts/edition-authoring/cli.mjs check exit=0; views=documented AGENTS.md Lander-Regenerate write and check exit=0; ledger=none exit=0

The complete literal generator commands are in ./mechanical-views.json. After write and check, both generated view files were restored from origin/main. The source lock was regenerated last and its exact-head check exits 0. No migration is changed, so no ledger update is needed. Typecheck, first-party checks and the focused quotation regression pass on the exact head. Setup and build completed through cloud_run; the private setup output is not published.

Publication scan text: commit=9bc9d51a9db7d36a63e23bb69d7b9042a1fee49e; complete=false; historyScanned=NOT_RUN; findings=NOT_RUN. This task has full Git history. The maintained Mac lander must run the complete scan and landing checks before main changes.

Current-main evidence at `60134d0d91def75bb0a9fd2e67d2e9dae714c68b`: Verify 42225490374 and 42222294396 completed success (push), Run site 42225490340 completed success (push). That main SHA is a candidate parent, not equal to the candidate. No Run site on the candidate or final main equality is claimed.

Local diagnostics: the first invocation of incoming main's money-policy journey could not launch an uninstalled Playwright browser. With PURSE_CHROMIUM_EXECUTABLE_PATH selecting /usr/bin/chromium and the existing no-sandbox launch option, it passed unchanged. One combined shell invocation returned exit 1 after reporting a passing capacity TAP test, with no assertion diagnostic; the direct rerun and the final exact-head named command both exited 0. No test or application assertion was weakened and no CI repair was attempted.

GitHub budget: four calls before the bounded watcher (one initial lookup used an incorrect SHA and returned no runs; two correct current-main lookups; one candidate discovery). The watcher records each subsequent exact-SHA poll and never polls a run more often than once per 300 seconds. No workflow dispatch, rerun, PR, provider access or other repository mutation is performed.

No local product blocker is identified; the candidate CI result remains unconfirmed. The clause's held remainder prevents a DONE claim. Exact-SHA Verify, scan and landing custody remain independently recorded.

Branch Verify observation: run 42225935643, push event, exact candidate SHA, in_progress at 2026-11-06T13:35:35Z. Final observation is recorded in CI-RECEIPT.json.

Final CI observation: Verify 42225935643, event push, head 9bc9d51a9db7d36a63e23bb69d7b9042a1fee49e, status in_progress, conclusion null at 2026-11-06T13:50:39Z. The bounded watcher ended after four polls, each at least 300 seconds apart; eight GitHub API calls were used in total, with two reserved for failure diagnostics. No completed failed run was observed, so no failed-job log or repair was attempted. CI is not claimed green. Product handoff is PUSHED under the outer cloud instructions, with the exact SHA retained for the fleet gate. This is not a DONE or landing claim.

PUSHED branch=cloud/sx-purse-c-f92 head=9bc9d51a9db7d36a63e23bb69d7b9042a1fee49e
