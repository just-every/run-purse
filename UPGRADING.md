# Upgrade an existing Purse installation

Stop the runtime with `rer dev --stop` or `rer preview --stop`. Before updating,
keep a private backup of the prior checkout, its settings and `.wrangler/state`,
including an export made with `rer export --output exports/pre-upgrade.rer`.
The repository has been renamed; package, project, edition, Worker, D1 and
archive-product identities are unchanged. No repository switch record is needed.

Install the pinned command with `npx -y @runeditrun/rer@0.2.0 cli install`, then
run `rer install` and `rer setup` in the existing checkout. Setup preserves the
saved owner, origin, private settings and purchasing data. The original eleven
migration files are immutable; migrations 0012–0020 append current Base auth,
dependency, erasure and import-kit bookkeeping. They enable no external provider by default.
Complete the ordinary sign-in and purchasing checks before reopening work.

Current exports use Base's version 2 format, which authenticates the manifest as
well as content. Export again from the upgraded original installation with
`rer export --output exports/upgraded.rer`. Test restoration into a separate,
empty installation before considering the backup usable. Purse's staging
validator still checks domain links, approved terms, arithmetic and attachment
bytes before Base's atomic apply. Local restored-import custody is not exported;
the new owner explicitly claims restored batches in Imports.

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.

Provider deployment remains a separate owner action.
