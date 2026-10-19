import type { Bindings } from '../auth.server';
import { runSupplierReminders } from './supplier-reminders';
import { runOrderChases } from './order-chasing';

export async function runPurchasingSchedule(env: Bindings, now: number) {
    const documents = await runSupplierReminders(env, now);
    const orders = await runOrderChases(env, now);
    return { documents, orders };
}
