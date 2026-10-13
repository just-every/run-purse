# Source origins

Purse is maintained at [just-every/run-purse](https://github.com/just-every/run-purse).
Its package remains `@procurement/purse` and its seed identifier remains `purse`.
The durable project and archive-product identity is unchanged in the machine configuration.
The public release is a clean source snapshot; its earlier authoring history is not included.

The adopted application source is Run Edit Run Base at
`10e569948863b7050e6645b7219b56007953b232`. `base-copies.json` records the original
paths, immutable revision, file digests and modes for byte-exact copies in Base's
copy-inventory format. That format identifies source by commit and content,
without a repository address. Verify against a checkout holding the pinned Base
commit with Base's `verify-base --base PATH`, or check local bytes with `--offline`.
The source needed to run this edition is included here or locked from the npm
registry. No private donor checkout is needed. Base and Purse are MIT; see
LICENSE and the font licences under `public/fonts`.

| Included source | Base origin |
|---|---|
| src/base | foundation/runtime; hydration implementation copied unchanged |
| src/modules/operator-auth | modules/operator-auth |
| src/modules/mail | modules/mail |
| src/modules/import-kit | modules/import-kit |
| src/modules/dependencies, src/modules/owner-claim | Native-auth transitive application imports |
| src/client.tsx | foundation/template/src/client.tsx |
| public/brand/band.svg | foundation/template/public/brand/band.svg; existing Purse green palette |

Donor tests, proof projects, dependency trees and build outputs are excluded.
Purse owns its domain policy, purchasing UI, importer mapping and restore
validation. The following derived files belong to Purse and are not claimed as
verbatim copies in `base-copies.json`:

| Purse-owned derived file | Base source at the application pin above | Derivation |
|---|---|---|
| `SEED-COMMAND-CONTRACT.md` and `RUN-LOCALLY.md` | Base command and local-operation docs | Adapted to Purse’s pinned package command flags, outbox sign-in and same-release backup rule. |
| `src/base/hydration/README.md` | `foundation/runtime/hydration/README.md` | Adapts only command examples to package mode; hydration implementation remains byte-exact. |
| `migrations/core/0020_import_kit_retirement.sql` | `modules/import-kit/src/d1/reversal-fence-schema.ts` and `modules/import-kit/src/d1/retirement-schema.ts` | Materializes `d1ReversalFenceSchema`, then `d1RetirementSchema`, as SQL statements in export order, prefixed with the source comments. |

The inventory covers the refreshed application copies. Base's unrecorded-copy
discovery also reports retained historical migrations and existing assets and
adapters whose bytes equal Base; these have not been refreshed by this inventory.

The eleven applied migration files 0001–0011 retain their exact prior bytes from
the earlier Purse application. They were adopted with Base
`3d643dda1d203d36e3fa57e8e5ba14e414bba6f9` or authored by Purse (0008 and 0011).
They are historical migration records, not refreshed runtime copies. The new
0012–0020 migrations append current Base schema; 0020 materializes the exported
import-kit reversal-fence and retirement schema arrays. No applied migration is rewritten.
See `UPGRADING.md` for existing data and same-release archive recovery.

The command runtime is published `@runeditrun/rer` **0.2.0**, exact-pinned and
locked. Conversion used Base's `scripts/export-cli.mjs`, followed by its
`--to-package ... --version 0.2.0` converter. There is no copied CLI or onboarding
implementation. Package scripts, operations and documentation invoke `rer`.

## Preserved portability policy hook

`patches/@runeditrun__rer@0.2.0.patch`, applied by `pnpm.patchedDependencies`,
preserves the prior authored policy-module hook using the published Base CLI.
Base 0.2.0 `cli/portability.mjs:11` accepts a JSON policy, and
`cli/portability.mjs:36` serializes that policy for its worker; functions are lost.
`cli/portability-worker.mjs:22` cannot load an authored module. These are Base
upstream gaps for the next round. The same patch preserves the existing exit-2
`archive_json` refusal when current Base preflight encounters malformed JSON
(`cli/portability.mjs:25`), using a constant diagnostic with no archive content.

The portability changes add a mutually exclusive `policyModule` option, reject
function policies that would be serialized away, and load the seed-authored module after
Base's contained-path/symlink checks. Archives cannot select a module. Container
transfer explicitly refuses this native-only hook before transfer; it never
silently drops validation. Archive format, authenticated v2 manifest, migration
replay, integrity checks, principal guards and atomic apply remain Base machinery.

`scripts/installer/portability.mjs` keeps the stable product ID, replaceable
`p_meta`, excluded `p_import_custody`, required configuration and `validateStaged`.
The seed validator still runs before atomic restore; checksummed invalid requests,
orders, receipts, invoices and attachments remain refusal cases. The browser
archive tests now recompute the v2 archive digest as well as the content digest,
so those tests continue to reach semantic validation instead of merely failing
an earlier checksum check.

## Package lockfile compatibility

The same patch corrects published 0.2.0 `cli/package-mode.mjs:41–43`: pnpm
records a patched or peer-qualified importer snapshot while keeping registry
integrity under the bare package version. The parser removes only complete pnpm
patch and peer contexts, including nested peers, before looking up that package.
`cli/inspect.mjs:124` still requires the declared, importer-specifier and resolved
versions to be exactly equal; registry SHA-512 integrity is still required.
The exact package pin remains 0.2.0. This parser change is another Base upstream
gap for the next round, alongside the portability hooks above.
