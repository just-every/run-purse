One archive file holds your whole installation: every request, decision, order, receipt, invoice, supplier, uploaded file and import history. Keep a copy before any big change, and restore it into an empty Purse.

## Back up

Stop Purse first if it's running, then export from the checkout:

```sh
rer dev --stop
rer export --output exports/installation.rer
```

The archive goes in the checkout's `exports/` folder, which Purse never serves, or anywhere outside the checkout. Copy it somewhere safe.

The archive leaves out sign-in sessions, private settings and the local outbox. A restored Purse has its own owner.

## Restore

Restore only into an empty installation: a new checkout, set up with its own owner and no purchasing records yet.

```sh
npx -y @runeditrun/rer install just-every/run-purse --dir purse-restored
cd purse-restored
rer setup --owner-email you@example.com
rer import --input exports/installation.rer --yes
rer dev
```

Copy the archive into the new checkout's `exports/` folder before `rer import`.

When this archive is the newest one, add `--journal exports/installation.rer` so Purse can refuse anything erased after it. Without a journal the restore is held until the current owner acknowledges, in Settings of the empty installation, that erasure history is unverified: supply your latest archive as the journal. The restored Purse then shows that label.

Purse checks the whole archive before it writes anything: the file's integrity, every link between records, every amount and every uploaded file. If anything is wrong it changes nothing and says why. A Purse that already has records refuses the import.

## Across upgrades

An archive restores only with the Purse release that made it. To bring an older archive to a newer Purse, restore it into an empty installation of the release that made it, upgrade that installation's source in place, run `rer install` and `rer setup`, then export again. Keep the original release and its archive until the new export restores. Never import an older release's archive straight into a newer Purse.

## After restoring

- Compare the counts of requests, decisions, orders, receipts and files with the original before you switch over.
- People sign in again with new accounts. A decision made in the original installation doesn't give anyone authority in the new one: an order prepared under an old approval is amended and approved again before it's issued.
- To continue an import batch from the original, choose **Take custody of restored batch** in Imports. See [Move in from CSV](/docs/move-in).
