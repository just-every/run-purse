import { operatorMail } from '../mail.server.mjs';
import type { Bindings } from '../auth.server';
import { load, authority } from './store';
import { canonicalSupplier } from './supplier-identity';
import { createSupplierRefresh } from './supplier-refresh';
import { all, get, can, requireThat, type Actor, type Data } from './types';
import { supplierDocumentStatus } from './supplier-documents';

/** A persisted attempt precedes the external effect. An interrupted send is uncertain, never silently retried. */
export async function runSupplierReminders(env: Bindings, now = Date.now(), manual?: { document: string; actor: Actor }) {
    const { state, revision } = await load(env.DB), results: Data[] = [];
    if (manual) { can(state, manual.actor, 'buyer'); get(state, 'supplierDocument', manual.document); }
    for (const document of all(state, 'supplierDocument').filter(d => !manual || d.id === manual.document)) {
        const supplier = get(state, 'supplier', canonicalSupplier(state, document.supplier));
        const status = supplierDocumentStatus(state, document, now);
        const daysLeft = status.daysUntilExpiry ?? Infinity;
        const dueOffsets = document.reminderDays.filter((n: number) => daysLeft <= n).sort((a: number, b: number) => a - b);
        const reason = manual ? `manual-${crypto.randomUUID()}` : status.refreshDue ? 'cycle' : dueOffsets.length ? `expiry-${dueOffsets[0]}` : null;
        if (!reason) continue;
        const id = `${document.id}:${document.version}:${reason}`;
        const reminder = { id, document: document.id, supplier: document.supplier, documentVersion: document.version, reason, expires: document.expires, createdAt: new Date(now).toISOString(), ...(manual ? { requestedBy: manual.actor.id } : {}), outcomes: [] as Data[] };
        const auth = manual ? authority(manual.actor) : undefined;
        const authSql = auth ? ` AND (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=?` : '';
        const inserted = await env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) SELECT 'main','supplierDocumentReminder',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='supplierDocument' AND id=? AND revision=?) AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='supplier' AND id=? AND revision=?)" + authSql).bind(id, crypto.randomUUID(), JSON.stringify(reminder), document.id, state.get('supplierDocument:' + document.id)!.revision, supplier.id, state.get('supplier:' + supplier.id)!.revision, ...(auth ? [...auth.params, revision] : [])).run();
        if (!inserted.meta.changes) { requireThat(!manual, 'State or authority changed; reload', 409); continue; }
        const refresh = await createSupplierRefresh(env, document.id, now);
        for (const target of ['supplier', 'owner']) {
            const recipient = target === 'owner' ? env.OWNER_EMAIL : supplier.contacts?.[0]?.email;
            let outcome: Data = { target, recipient: recipient ?? '', status: 'unavailable' };
            const sender = operatorMail(env);
            if (sender && env.MAIL_FROM && recipient) {
                try {
                    const result = await sender.send({ deliveryId: `supplier-document:${id}:${target}`, from: env.MAIL_FROM, to: [recipient], html: '', headers: {}, subject: `Document refresh required: ${supplier.name}`, text: `${supplier.name}: ${document.type} expires ${document.expires}. ${target === 'supplier' ? 'Upload a refreshed document within seven days: ' + refresh.url : 'Review supplier submissions in Purse: ' + new URL('/app', env.AUTH_ORIGIN).href}. Uploading does not clear a lapse until a buyer reviews it. Required lapsed documents hold new purchase orders.` });
                    outcome = { ...outcome, ...result, at: new Date().toISOString() };
                } catch { outcome = { ...outcome, status: 'uncertain', at: new Date().toISOString() }; }
            }
            reminder.outcomes.push(outcome);
            await env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='supplierDocumentReminder' AND id=?").bind(crypto.randomUUID(), JSON.stringify(reminder), id).run();
        }
        results.push({ ...reminder, ...(manual ? { refreshUrl: refresh.url } : {}) });
    }
    return { reminders: results };
}
