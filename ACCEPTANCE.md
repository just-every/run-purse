# Purse acceptance

The useful first release is the complete provider-free phase 1 purchasing chain in `CONTRACT.md`, including move-in, restore and governed human preparation. The PUR-001 through PUR-017 flow tests use synthetic fixtures. Each release must pass Verify on its exact commit, including the browser and restore journeys. Actual owner-export compatibility and pilot acceptance remain separate obligations.

The owner has not supplied an anonymised purchasing case, actual Procurify export or current-process baseline. All development examples are explicitly synthetic test fixtures. Actual-export compatibility and pilot economics require real owner input. Existing installations retain applied migrations; the forward upgrade and same-release archive restore path is described in `UPGRADING.md`. Hosted/provider acceptance is outside this provider-free phase.

`tests/purse.test.mjs` is a business-flow suite, with actual native sign-in and real workerd/D1, no fake application database. `tests/browser.mjs` runs the fresh-install human journey at 1440 and 390 pixels and records screenshots, downloaded PO documents and complete archives in a private evidence directory. Default runs use genuine local Git clones of committed HEAD, without inherited dependencies, settings or data. Uncommitted changes are not included. GitHub Verify runs the integrated wall and these clone journeys from its exact checkout. Exact-commit CI status is recorded by the GitHub run.

Run `pnpm test:purse` and `pnpm typecheck` for focused domain checks. Run `node tests/browser.mjs` for the full browser and CLI proof, optionally setting `PURSE_EVIDENCE` to a private output directory. Its `--source-copy` option explicitly tests precommit author copies, with that qualification in its result; default runs still clone committed HEAD. Its `--archive-only --existing` mode proves only archive operations on an existing fixture installation; its empty journey list must never be presented as fresh-install browser proof. `rer verify` is the final integrated wall and belongs to CI/final review.

Known physical limits are explicit: attachments currently accept 1 MB per file; requests accept 100 lines; reviewed fixture CSV batches accept 300 records, advancing 20 rows per atomic batch and at most two batches per request. Resume is explicit. These are visible limits, not hidden truncation. Imported data is inert and retains original statuses; native approval is required for new purchasing.

## Backup and upgrade

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.
