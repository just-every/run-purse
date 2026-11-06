# sx-purse-f79fix-1 investigation

Product repair is not established. The reported stale-state assertion has not reproduced on the exact cited resolver SHA or current-main baseline. No product changes, commits, product pushes or PRs have been made. No workflow was dispatched or rerun.

## Product provenance

- Repository: just-every/run-purse.
- Task branch: cloud/sx-purse-f79fix-1.
- Clean task checkout/head: 84aa99e2e259e79b811058edb044970d5f8dafde, the main tip fetched at task start.
- Exact cited resolver head: 85ef6259b406c0dfc9f0e560dec7d89d31d5815a, fetched directly and tested from a clean detached checkout.
- The resolver ref cloud/sx-purse-c-f79-land-a6a3f7d08b had moved to 3f274c33e90ecc0360622c96faad5e04e19f6543 when fetched. Testing used the cited SHA rather than silently substituting that new tip.
- `git diff 85ef6259 origin/main -- src tests/browser-intake.mjs tests/browser-approver-edits.mjs tests/purse-harness.mjs scripts/ci/shards.json .github/workflows/verify.yml` is empty. The product, failing test, harness, workflow and shard manifest are identical.
- The cited resolver commit itself adds a 42-line regression scenario to tests/po-generation.test.mjs and updates sources.lock.json. It contains no product-source change. Main already contains the historical-send erasure product fix in b84b8c4, and the owner-consented sending replay in f538fb8.

## Original failure

Read failed job 128149138757 from exact-SHA Verify run 42284624952 once, with:

`gh run view 42284624952 --job 128149138757 --repo just-every/run-purse --log-failed`

The group manifest contains:

1. `node tests/browser.mjs --width=1440 --journey=po-documents`
2. `node tests/browser-intake.mjs --width=390`
3. `node tests/browser-access.mjs --width=390`
4. `node tests/browser-order-thread.mjs --width=390`

The original second command completed guided intake, then failed at tests/browser-approver-edits.mjs:28:365 through tests/purse-harness.mjs:17:99. Immediately after clicking Record decision and observing Saved., the owner GET /api/purse/state returned HTTP 409 with `State or authority changed; reload`, where the harness expects 200. This is the read fence in src/purse/store.ts:77-79, not a supplier-send refusal. The original job's first, third and fourth commands passed.

## Local results

All commands were bounded and run under the supplied cloud subreaper. Browser tests used /usr/bin/chromium headlessly; Playwright's sandbox is disabled. No tests, assertions, skips, stale-state retries, workflows or contract judgments were changed.

- Fleet setup, pnpm frozen-lockfile install, and `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`: passed.
- Unchanged `node tests/browser-intake.mjs --width=390`, main 84aa99e, Node 24.19.0 selected by supplied toolchain: passed.
- Same leaf, exact resolver 85ef6259, Node 24.19.0: passed.
- Same leaf, exact resolver 85ef6259, exact CI Node 22.20.0: passed.
- `pnpm typecheck`, main 84aa99e, Node 22.20.0: passed.
- Group 37 was run once on main 84aa99e, Node 22.20.0. Intake at 390 passed, access at 390 passed, order-thread at 390 passed. The first command failed before behavioral assertions because its disposable local clone could not obtain missing promisor objects from the task's shallow filtered clone. Overall group exit was 1. That is a separate local setup failure, not a reproduction of the reported 409.
- The task clone was hydrated through ordinary fleet-authenticated Git fetches, leaving zero missing promisor objects. Only the first PO-documents command was retried after this repair; it passed at 1440 with exit 0, including fresh install, native UI, build, deployment dry-run, archive corruption/semantic refusals, restored continuation and exact re-export. The whole group and passing leaves were not retried. Thus all four commands eventually passed, while the original group invocation honestly retains exit 1.

Full commands, exit codes, SHA identities and per-command logs are retained in receipt.json and the explicitly selected log files. PLAN.md records the complete plan and constraints. The public failed-job excerpt omits its environment-header block; no credential/environment dump or archive is selected for publication.

## Diagnosis and scope decision

There is no resolver-only product differential to repair: the source and this test are identical to main. A shared timing issue is plausible: src/ui/app.tsx:32 leaves an earlier Saved. notice present while a later mutation begins, and the failing test waits for that same text after its next click. If that earlier notice satisfies the wait before the next mutation completes, its concurrent state read can cross a revision change and correctly encounter the read fence. This is a hypothesis, not a confirmed root cause; the current runs did not reproduce it. No fence has been loosened and no automatic retry has been added.

The brief requires stopping if main fails the same leaf, but main has not done so locally. It would be inaccurate to report `main fails the same leaf`. A resolver-only failure also has not been demonstrated, so this task has no supported product hunk to change under the conditional repair scope. The original CI failure is still unresolved; passing local leaves do not turn that run green. No READY claim is made, and this report does not supersede resolver landing sx-purse-c-f79-land-a6a3f7d08b.

## Clauses, counts, custody and next action

- BASE-AGENT/order-send: PARTIAL -> PARTIAL, unchanged. All existing CLAIM lines, Status, Gap and Evidence fields remain untouched.
- Counts before/after: 54 done, 51 partial, 22 missing, 127 total. Published: 17/0/0/17. Target and push further: 37/51/22/110.
- Source lock and generated views unchanged. No product save or empty commit was created.
- Task branch exists locally at the stated main baseline and has not been product-pushed; no PR was created. There is no new exact-SHA Verify. Original run 42284624952 / job 128149138757 remains the relevant failing evidence. One GitHub log read was used; no CI dispatch or rerun was made.
- All reports and receipts are separate from the product and are published only to evidence/sx-purse-f79fix-1. Evidence publication carries no product readiness or landing signal.
- Recommended lane action: retain the original failure for fv's shared-main/browser timing triage, with this source identity comparison and passing original-leaf receipts. A broader shared UI/approval synchronization repair needs an explicit assignment or a demonstrated reproducible leaf before this resolver-only repair can proceed.

Final outcome: BLOCKED because the reported 409 is not reproduced and no resolver-only product differential is present. This is not a claim that main failed the same leaf. All local behavioral commands passed after repairing the separate filtered-clone object issue. No evidence supports a scoped product change or a READY line.
