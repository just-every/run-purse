Move your purchasing history into Purse from a CSV file. Nothing is written until you've reviewed the exact batch, and anything you haven't touched since can be undone. The owner does this in the **Imports** tab.

## Before you start

- Keep the original export somewhere safe outside Purse too.
- Export the whole period you need. Some purchasing tools export only the last 30 days by default.
- Add every currency in the file to your business codes first: currencies are never merged.
- Attachments don't come with the CSV. Purse lists which are missing so you can upload them to the right record afterwards.

Purse reads the documented CSV layout: choose **Download documented example CSV** to see it, with one line per historical request or order.

## Preview without writes

Under **Move in from CSV**, choose the file, then set:

- **Column mappings**: one `field=CSV header` per line, or leave it blank to use the documented headers.
- **Decimal convention**: decimal point or decimal comma.
- **Date convention**: `YYYY-MM-DD` or `DD/MM/YYYY`.
- **Status mappings**: what each original status means, one `source=meaning` per line.

Choose **Preview without writes**. Purse reads the file and writes nothing.

## Review this exact batch

The preview shows how many rows it read and how many are duplicates or rejected, the currencies, any unresolved references, the missing attachments and every status mapping. If anything is wrong, fix the file or the mappings and preview again.

When it's right, choose **Commit reviewed batch**. Purse writes exactly the batch you reviewed: if the file, the mappings or your permissions changed since the preview, it asks you to review again.

## Resume and undo

A batch shows its state and progress, such as `completed · 45 / 45`. **Resume / refresh** carries on a batch that stopped part way.

**Undo untouched imported records** removes what the batch created, newest first, except anything someone has since edited or used in a new record. Those stay, and the **Undo disposition report** says which and why. The original file and the import history are kept.

## Imported history is history

Imported approvals, orders and receipts are a record of the past. They don't give anyone authority now: raise a new request for anything you still need to buy.

## After a restore

Batches restored from a backup belong to no one in the new installation. Choose **Take custody of restored batch** to continue one; only an owner can, and the first owner to claim it owns it from then on. See [Backup and restore](/docs/backup-and-restore).
