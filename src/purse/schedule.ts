import { runReportSchedules } from './report-schedule';
import {runPoGeneration} from './po-generation-schedule';
import { runRecurringOrders } from './recurring-schedule';
import { runValueCheckins } from './agent-value-checkins';
import { runRecurringDiscoverySchedule } from './recurring-discovery-schedule';
import { runAgreementReminders } from './agreement-reminders';
import { sendEmailIntakeLinks } from './email-intake';
import { runRfqReminders } from './rfq-api';
import type { Bindings } from '../auth.server';
import { runSupplierReminders } from './supplier-reminders';
import { runOrderChases } from './order-chasing';
import { runReceiptPrompts } from './receipt-prompts';
import { runTravelReleases } from './travel-release-schedule';

export async function runPurchasingSchedule(env: Bindings, now: number) {
    const reports = await runReportSchedules(env, now);
    await sendEmailIntakeLinks(env);
    const generation=await runPoGeneration(env,now);
    const recurring = await runRecurringOrders(env, now);
    const documents = await runSupplierReminders(env, now);
    const orders = await runOrderChases(env, now);
    const rfqs = await runRfqReminders(env,now);
    const receipts = await runReceiptPrompts(env, now);
    const values = await runValueCheckins(env,now);
    const discovery = await runRecurringDiscoverySchedule(env, now);
    const agreements = await runAgreementReminders(env, now);
    const travelReleases = await runTravelReleases(env, now);
    return { reports, generation, recurring, documents, orders, receipts, rfqs, agreements, values, travelReleases, discovery };
}
