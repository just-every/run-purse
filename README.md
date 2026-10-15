# Purse

Purse is an MIT procurement workspace for one business and known suppliers.
Source: [just-every/run-purse](https://github.com/just-every/run-purse).

## Run it locally

Install the RER command once, then run this checkout:

```sh
npx -y @runeditrun/rer@0.2.20 cli install
rer install
rer setup
rer dev
```

For a fresh clone, `rer dev` alone installs the locked dependencies, prepares a
local owner and prints the signed-in URL. Use `rer setup` first when you want to
enter your own owner mailbox. The checkout's repository name has changed;
its package, project, edition, Worker, D1 and archive-product identities are
unchanged.

The command selects the project's exact Node 22.20.0 runtime and pnpm 10.12.4.
It uses an installed matching runtime or a checksum-verified copy cached under
`~/.rer/node/`; it does not change global Node installations. See
`RUN-LOCALLY.md` for runtime selection and recovery.

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
signed in as the owner. Local mail is silently suppressed. `dev` serves
live editing with HMR. It stays in the foreground in a terminal and detaches
without a terminal. A compatible repeated invocation reuses the server. Stop `dev` with
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

Reset is destructive local cleanup. Import requires an empty destination and
explicit confirmation. Use `rer describe` to inspect the
checkout's actual commands and flags. The maintained pins are Node 22.20.0 and
pnpm 10.12.4. Read `RUN-LOCALLY.md` for data custody, deploy requirements and
remote-transfer support.

## Run site and docs

`rer dev` also prints `RER_SITE`: Purse's homepage, the Run page at `/run` and the
docs, the static site `rer build --site` writes to `dist/site` for run-purse.com
(`src/site`, `deploy-site.json`). The docs are the Markdown pages in `docs/`, listed
in reading order in `docs/site.json`. The installed app's own `/` is the Lobby.
The site is live at https://run-purse.com, deployed from `main` by `.github/workflows/run-site.yml`.

## Purchasing workspace

Purse is an MIT procurement edition for one business and known suppliers. Open `/app` after setup. The owner configures business codes, currencies, members and authority policies in Settings. Add supplier and catalogue records, then use Requests for intake/quotation/approval, Orders for issuance/receiving/invoice evidence, and Preparation for five human-led workflows. Uploaded files retain actual bytes. Downloads include printable PO HTML, preparation text and accounting CSV. No external account is required for native operation.

Use `dev --as requester`, `--as approver`, `--as buyer` or `--as receiver` for real local operators at the corresponding `@dev.localhost` addresses. First save their matching purchasing capabilities in Settings as owner. A native session alone does not grant a purchasing role. Production invitations use the configured mail provider.

Quantities support three decimal places. Enter monetary amounts as currency text, for example `1,250.50` for AUD 1,250.50; Purse converts them to integer minor units (100 means AUD 1.00). Each line multiplies quantity by unit price and rounds half-up to the nearest minor unit, once. Supplied freight and tax are stored as integer minor amounts; Purse does not compute tax. Receipts release the proportional total commitment using half-up integer arithmetic; the final receipt/cancellation releases the exact remainder. Unlike currencies remain separate.

Changing supplier, quantity or cost creates a new revision. During an issued-order amendment the old obligation stays in the ledger and receiving is paused until renewed authority and explicit amendment issue; the original issued document/history remains. Generation never records issuance. Supplier communications happen in the owner's existing channel.

See `UPGRADING.md`, `CONTRACT.md`, `ACCEPTANCE.md`, `IMPORTING.md`, `API.md` and `SOURCE.md` for guarantees, verification commands, fixture limitations and editable source origins. Complete local archives include domain records, uploaded bytes, decisions and import-kit originals/history. Owner/auth sessions, private settings and local mail are excluded; restore into an empty installation with its own owner. Never merge archives into live data. `rer` applies atomic Base restore validation.

Phase 2 requires a real owner-selected Models connection and approved supplier Messaging credentials; phase 3 adds the pilot's accounting adapter. This release fabricates no extraction or model result, sends no supplier mail, binds no negotiation, posts no ledger entry and makes no payment.

## Backup and upgrade

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.
