# Purse demo

After the ordinary `rer setup`, run `rer demo` (`rer dev --demo`) and open its
private `RER_OPEN` link. It opens signed in as the saved owner, on its own data
in `.rer/demo/<start>/`, which is deleted when it stops: `rer demo --stop`,
Ctrl-C, or its end. Restarting starts afresh. The checkout's `.wrangler/state`
and private settings are not touched.

## Sample data

`src/demo.ts` (`seedDemo`) builds Northside Studio's purchasing workspace with
Purse's own commands, as its people would have made it over the last six weeks:
business codes (AUD and USD, Sydney and Melbourne), five members, seven
suppliers (one blocked, four with renewals), six approved catalogue items and
seven approval policies the owner holds, one delegated. Eleven requests sit at
every stage: received and invoiced, received awaiting invoice, partly received
with a rejected item and a price discrepancy, issued and overdue, approved and
prepared as a PO, approved awaiting a PO (USD), two awaiting approval, returned,
draft and rejected. There is also a quote, a supplier quote attachment and a
renewal preparation. Dates are relative to the moment the demo starts. Members
use `northside-studio.example` addresses. Base's `modules/demo` runs the hook
once, after the owner exists; a workspace that already has a business is left
as it is.

## Hosted demo

`rer deploy --demo` puts it on the web at `https://demo.run-purse.com/`
(`deploy-demo.json`): one Cloudflare Container per visitor running Purse's
container image with `RER_DEMO=1` and no internet. The visitor passes Turnstile
and lands signed in as the owner through Base's signed owner claim
(`/auth/owner-claim` in `src/auth.server.ts`, served only when the claim's
public keys are set). A demo ends after 60 minutes or 15 idle minutes, and its
container and state are deleted.

`.github/workflows/run-demo.yml` (Base's `export/run-demo.yml`, on the
RunEditRun account) deploys from the `run-demo` environment when run by hand,
and on pushes to `main` only when the repository variable `RUN_DEMO_DEPLOY` is
`true`. Run by hand with `test_only` it deploys the separate test host
`demo.test.run-purse.com` with Turnstile's always-passing test keys; `remove`
removes the selected demo.

## What a demo sends

Nothing. Purse's only outbound path is mail through `src/mail.server.mjs`
(sign-in links, member and owner invitations, step-up confirmation). The demo
uses the development provider: under `rer demo` mail stays in the local outbox
and is counted in the demo bar; on the hosted demo (`AUTH_LOCAL` false) the
development outbox does not accept the https origin, so mail is unconfigured
and an invitation answers that it cannot be sent. Purse has no webhooks, payments, AI calls, supplier
sends or publishing; purchase orders are downloaded, not sent. Base's guard
refuses any other fetch or socket that leaves the machine, and the hosted
container has no internet.

## Runtime source

`src/modules/demo` is Base's `modules/demo` at tag `rer-v0.2.19`; see
`SOURCE.md`.
