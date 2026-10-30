# Source origins

Purse is maintained at [just-every/run-purse](https://github.com/just-every/run-purse).
Its package remains `@procurement/purse` and its seed identifier remains `purse`.
The durable project and archive-product identity is unchanged in the machine configuration.
The public release is a clean source snapshot; its earlier authoring history is not included.

The adopted application source is Run Edit Run Base; every recorded copy now pins tag `rer-v0.2.30`
(`d434ea67989fe10b6ddff01daba8bb350975e54a`). `base-copies.json` records the original
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
| `public/brand/band.svg` | `foundation/template/public/brand/band.svg` | Recoloured to Purse's green palette. |
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

The command runtime is published `@runeditrun/rer` **0.2.30**, exact-pinned and
locked. Conversion used Base's `scripts/export-cli.mjs`, followed by its
`--to-package` converter. There is no copied CLI or onboarding
implementation. Package scripts, operations and documentation invoke `rer`.

## Portability policy hook

`scripts/installer/local.mjs` passes `policyModule:
'scripts/installer/portability.mjs'` to Base's `localPortability`. Published
rer includes the hook (Purse carried it as a package patch on 0.2.0): the
seed-authored module loads after Base's contained-path/symlink checks, function
policies are refused instead of being serialized away, archives cannot select a
module, and container transfer refuses this native-only hook before transfer.
Archive format, authenticated v2 manifest, migration replay, integrity checks,
principal guards and atomic apply remain Base machinery.

`scripts/installer/portability.mjs` keeps the stable product ID, replaceable
`p_meta`, excluded `p_import_custody`, required configuration and `validateStaged`.
The seed validator still runs before atomic restore; checksummed invalid requests,
orders, receipts, invoices and attachments remain refusal cases. The browser
archive tests recompute the v2 archive digest as well as the content digest,
so those tests reach semantic validation instead of merely failing an earlier
checksum check.

## Demo runtime

All seven vendored modules (`demo`, `operator-auth`, `owner-claim`, `mail`, `dependencies`, `import-kit` and its `d1-transport` dependency) are refreshed together from tag `rer-v0.2.30` (`d434ea67989fe10b6ddff01daba8bb350975e54a`), with the `src/base` runtime copies, `src/client.tsx`, `src/router.tsx`, the installer seed and fonts, and `.github/workflows/run-demo.yml`. Their runtime bytes are recorded in `base-copies.json`; applied migrations retain their historical bytes. Demo labels and effects use Base unchanged. Base mail silently suppresses demo delivery and auth accepts its success result; Purse needs no demo mail wrapper and serves no captured-mail viewer. See `DEMO.md`.

Migration `0022_import_kit_progress.sql` materializes the tag’s additive preparation-step and erasure-progress schema arrays. Earlier applied migrations are unchanged.

## Company-agent door

`src/modules/agent-door`, `src/modules/business-settings`,
`src/modules/operator-auth` and the Business theme/icon dependencies in
`src/foundation/runtime` are recorded from released Base
`2135c394939f4a737adabdc8003b0e667b31ac5a` (rer-v0.2.91). Donor tests and
test signer fixtures are excluded from these runtime copies. The pinned command
dependency is now `@runeditrun/rer` 0.2.91; older origin paragraphs above describe
the retained application source and migration history. New migrations 0042–0044
append Business settings, durable Business identities and agent-door storage.

The development toolchain also applies the recorded
`patches/miniflare@5.20260907.0-alpha.patch` from that same Base commit. It waits
for synchronous RPC message delivery after notification while retaining the
message-identity assertion. The pnpm lock binds this patch for the CLI, Wrangler
and native verification fixtures.
