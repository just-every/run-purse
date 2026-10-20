import { runAgreementReminders } from './agreement-reminders';
import { sendEmailIntakeLinks } from './email-intake';
import { runRfqReminders } from './rfq-api';
import type { Bindings } from '../auth.server';
import { runSupplierReminders } from './supplier-reminders';
import { runOrderChases } from './order-chasing';
import { runReceiptPrompts } from './receipt-prompts';

export async function runPurchasingSchedule(env: Bindings, now: number) {
    await sendEmailIntakeLinks(env);
    const documents = await runSupplierReminders(env, now);
    const orders = await runOrderChases(env, now);
    const rfqs = await runRfqReminders(env,now);
    const receipts = await runReceiptPrompts(env, now);
    const agreements = await runAgreementReminders(env, now);
    return { documents, orders, receipts, rfqs, agreements };
}
