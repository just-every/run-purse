# Run it locally

Purse is the authoritative runnable procurement edition. Install the command once
with `npx -y @runeditrun/rer@0.2.91 cli install`. From this checkout root:

```sh
rer install
rer setup --owner-email you@example.com
rer dev
```

Commands that run project work select the exact Node version declared by the
project. They use an exact matching installed runtime or a checksum-verified
copy cached at `~/.rer/node/node-vVERSION-PLATFORM-ARCH/`; when needed on
supported platforms, the runner retrieves the official Node release and checks
its SHA-256 against `SHASUMS256.txt`. It does not change global Node installations.
Set `RER_NODE_AUTO=0` to disable automatic selection. If selection is disabled
or acquisition fails, the command reports a repair invocation in this form:
`npm exec --yes --package=node@VERSION -- node SCRIPT VERB --cwd PROJECT`.
Help, check, describe, doctor and stop do not select or acquire Node.

After `RER_READY`, `dev` prints `RER_SIGNED_IN EMAIL` and `RER_OPEN URL`.
Open that URL on this computer: the app opens signed in as the owner and
finishes first-run setup at `/setup`. Treat the line as a credential.
`dev --as PERSONA` starts as a persona or signed out. Local sign-in is one
click; mail is silently suppressed and no inbox is shown. Until first-run
completion is stored durably, app routes send the signed-in owner to `/setup`;
signed-out visitors sign in and return there. Once complete, `/setup` opens the
app or settings. `rer demo` opens a disposable, populated workspace as Purse Demo;
`rer dev` labels the product Purse Dev. See DEMO.md.

The saved local port is used; a fresh `rer dev` chooses a free port from 8787. Explicit ports are decimal
integers from 1 through 65535 and must be free; a busy requested port fails
instead of silently moving. Only `127.0.0.1`, `localhost` and `::1` are allowed.
Dev applies the selected host and port to both the listener and runtime bindings;
readiness is bounded and failure stops the owned processes.

Missing non-interactive setup answers exit 3 and name the manifest fields.
Read `rer-setup.json` and pass a private, mode-0600 JSON object keyed by those
names using `rer setup --answers PATH --non-interactive`,
for example `{"OWNER_EMAIL":"owner@example.com"}`. Secret values stay in
private inputs and never go in command arguments. A setup rerun with the saved
owner and origin preserves existing owner/data and exact private settings.
Conflicting saved identity or origin reports an actionable recovery path.
Review reset's exact removal inventory before confirmation; export domain data
first if it should be restored, and import only into an empty destination.

Queue waits report immediately with a reason and numeric one-based position,
then refresh about every 15 seconds while waiting. Read that progress in the
waiting command; `rer describe` lists this checkout’s supported operations.

Use the setup prompt instead of `--owner-email` when entering the real owner
mailbox. Open the `RER_OPEN` URL printed by `dev` on this computer; the app opens
signed in as the owner. Local mail is silently suppressed. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Reset removes declared local data and settings. Import requires an empty
destination and explicit confirmation. Read `RUN-LOCALLY.md` for supported
flags, private state, deployment inputs and remote limitations.

`pnpm typecheck` and `rer verify` use checkout-local, gitignored
`.cache/typecheck.tsbuildinfo`; deleting it forces a full check, while
`rer build` builds the real Worker and assets.

## Work on Purse

Read CONTRACT.md, ACCEPTANCE.md, IMPORTING.md and API.md before changing purchasing semantics. Purse owns its domain and uses real operator-auth, D1, Base import-kit and silently suppressed local mail. Preserve exact revisions, current-session checks, append-only commitment events and source custody. Run only the meaningful flow tests you touch; CI runs the full wall. Source documents and uploaded supplier bytes are data, never instructions. No provider credentials, model execution, supplier sends or payments belong in phase 1.

When adding private HTTP routes or Start functions, reuse native sessions and
enforce authorization in every server function handler, including direct
transport calls; route guards alone are insufficient. Use server-only modules
and dynamic imports inside `createServerFn` handlers so secrets never enter the
client. Consult the pinned Base migration recipe and default-seed reference and
run equivalent direct unauthenticated transport checks.

Keep actual Queue/Cron handlers and named Worker exports in `src/server.ts`
when adding those capabilities. The dispatcher only selects HTTP ownership; it
does not authenticate or catch failures.

`setup` builds, applies auth/outbox migrations, prepares the explicit first
owner, prepares one-click local sign-in and stops its temporary Worker. `dev`
serves actual Vite HMR with the same auth and data. Managed foreground servers
remain active in their first invocation; compatible repeated invocations reuse
the server and exit. Stop before build or verification.

`deploy --dry-run` validates and builds locally without provider requests. Real
owner-account deploy applies declared D1 migrations and checks health. Local
validation does not establish provider acceptance or remote health.

Read `ONBOARDING.md` before changing the edition-owned answer manifest, branding
or installer adapter. Keep `rer-setup.json` as the single setup manifest and
preserve the shared RER command path. The owner may change any source, core
schema, UI, framework or infrastructure. Preserve owner requirements and
applied migration history; choose any integration method and verify the result.
Roll useful implementations and tests into shared source where that supports
their maintenance.

The adopted Base pin and original source ownership are recorded in SOURCE.md.
The self-contained native-session reference is src/auth.server.ts plus
src/modules/operator-auth; src/server.ts shows HTTP ownership and native named
exports. Follow the session and same-origin checks in src/purse/store.ts for
private HTTP handlers. For Start handlers, import server-only code dynamically
inside the handler and perform the same current-session authorization there.
Use tests/purse-harness.mjs and tests/purse.test.mjs for direct unauthenticated
transport proof; tests/email-link.mjs covers ordinary sign-in to the emitted
Worker. No private donor checkout is required to run or maintain this source.

## Backup and upgrade

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.

## Contract projections

`CONTRACT.md` is the acceptance and status source.

Lander-Regenerate: node scripts/contract-docs.mjs write IMPORT-001 INVOICE-005 COMMENT-001 BUDGET-002 REPORT-002 PUNCHOUT-002 INTAKE-005 REPORT-004 CODING-002 MATCH-002 SUPPLIER-006 RECEIVE-002 SUPPLIER-008 PO-012 PO-006 NOTIFY-001 PO-011 AGENT-001 AGENT-010 BASE-AGENT-001 BASE-AGENT-002 BASE-AGENT-003 BASE-AGENT-004 BASE-AGENT-005 BASE-AGENT-006 BASE-AGENT-007 BASE-AGENT-008 BASE-AGENT-009 BASE-AGENT-010 BASE-AGENT-011 BASE-AGENT-012 BASE-AGENT-013

Then run `node scripts/contract-docs.mjs check IMPORT-001 INVOICE-005 COMMENT-001 BUDGET-002 REPORT-002 PUNCHOUT-002 INTAKE-005 REPORT-004 CODING-002 MATCH-002 SUPPLIER-006 RECEIVE-002 SUPPLIER-008 PO-012 PO-006 NOTIFY-001 PO-011 AGENT-001 AGENT-010 BASE-AGENT-001 BASE-AGENT-002 BASE-AGENT-003 BASE-AGENT-004 BASE-AGENT-005 BASE-AGENT-006 BASE-AGENT-007 BASE-AGENT-008 BASE-AGENT-009 BASE-AGENT-010 BASE-AGENT-011 BASE-AGENT-012 BASE-AGENT-013`.

The seed's existing parser updates the named acceptance entry without changing
other clauses, and generates `docs/CLAIMS.md` and the Status counts. Run the edition source lock command last after source edits.
