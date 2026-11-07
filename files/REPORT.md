# sx-purse-f96fix-1 report

Product repository: just-every/run-purse  
Branch: cloud/sx-purse-f96fix-1  
Head: 951a12174c7dd7769b3917d9e9956d25d7e433cd  
Parent: 99a8fabb6a74b834e5d17f14c90a855acfeeb1e7  
Current main at clone: c070712429cebc093cb975adaff1a57eae2258b5  
Product custody: READY; pushed successfully, first attempt. No PR required by repository guidance; none created.  
Exact-SHA Verify: [42421158292](https://github.com/just-every/run-purse/actions/runs/42421158292), completed/success on the exact product SHA.

CLAIM: BASE-AGENT-009 PARTIAL to PARTIAL. Before/after counts: 54 done / 51 partial / 22 missing, 127 total. CONTRACT.md Status, Gap and Evidence and generated views are unchanged.

## Result and rationale

Corrected the invoice-risk fixture while retaining the candidate's erasure-custody implementation. Synthetic protected suffixes are selected only after the independent auth/PO email baseline has been captured, and cannot collide with that pre-input baseline. All original full-value, fingerprint and suffix assertions are unchanged. An added equality assertion fences the mail baseline against later rewriting. Native owner protected-store establishes supplier matching before invoice capture.

The supplied candidate-only regression diagnosis was not reproduced unchanged: candidate and main both pass the complete file locally. A controlled native loopback port of 39731 reproduces the exact line-76/output-8 failure on both unchanged versions, because the fixture TIN ends in 9731. The original failed job's log contains no offending bytes, so that historical instance cannot be attributed to a particular port or opaque token. Its failure message, the controlled reproduction, and the absence of any candidate change to invoice masking support fixing this fixture collision instead of changing product disclosure behavior. See ANALYSIS.md for the full diagnosis and diagnostic limitations.

The two changed files relative to the published candidate are tests/invoice-risk.test.mjs and sources.lock.json. No product runtime, workflow or contract edits. The named branch descends from the published candidate; main was already its ancestor, so no merge or rebase was needed. The product was pushed exactly once via cloud-push.py, after local touched checks passed.

## Validation

- Unmodified candidate: complete invoice-risk file, 3/3 pass, including pinned Node 22.20.0.
- Main: same complete file, 3/3 pass, including pinned Node 22.20.0.
- Controlled port collision on both unchanged versions: expected exact protected-suffix failure.
- Controlled before/after proof under the same Node 22.20.0: original candidate fails the suffix assertion; corrected target test passes. Full multi-installation archive test cannot share that forced port; its EADDRINUSE diagnostic is retained and the temporary listener edit was restored.
- Corrected full invoice-risk file with original listener, Node 22.20.0: 3/3 pass.
- Deliberate full-value and masked-suffix disclosures in temporary physical .mjs probes: both fail the original assertions. Temporary probe files removed.
- New retained-artifact erasure journey: pass; 4 preparations before, 4 after erasure, 5 after a fresh approval; 72 retained fields reviewed across 11 affected records.
- Typecheck: pass.
- Source lock regenerated last; lock check, offline Base verification and pnpm sources:check: pass, including contract projection checks.
- All three commits above main inspected for author, committer and trailers, including side parents: fleet identity throughout; no co-author trailers.
- RER setup completed with the fleet owner through cloud_run; its build and migrations succeeded. Initial setup was refused while a focused test held the checkout; it succeeded after that test exited. No keys or private setup logs are selected for publication.

## Plan and evidence

PLAN.md contains the complete execution plan. ANALYSIS.md contains the product-versus-fixture decision. RECEIPT.json records actual commands, outcomes and provenance. Supporting actual output files include the original failed job, candidate/main baselines, controlled reproductions, negative leak probes, final focused checks, erasure journey, identity inspection, source verification, product push and exact-SHA CI API receipts.

Evidence publication goes only to refs/heads/evidence/sx-purse-f96fix-1. Evidence publication is separate from product READY, acceptance and landing. The Mac fleet performs its own publication scan and lands the product; this cloud does not push main.

## Blockers

None. Verify 42421158292 completed/success on the exact head at the 2026-11-07T22:58:54.615566+00:00 observation. Seven GitHub calls were used, including the original failed-job archive read. No dispatch, rerun, workflow edit, second product push or history rewrite occurred.

READY branch=cloud/sx-purse-f96fix-1 head=951a12174c7dd7769b3917d9e9956d25d7e433cd
