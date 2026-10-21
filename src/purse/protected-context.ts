import { rejectProtectedInput, stripProtectedInput } from './protected-input';
import { all, audit, put, requireThat, text, type Actor, type Data, type State } from './types';
import { preparationActions, executablePreparationAction, hasUnsafeProtectedContext, unavailableProtectedTarget } from './protected-context-fields.mjs';
export { preparationActions, executablePreparationAction };

type ContextKind = 'agentRun' | 'proposedAction';
export function protectedContextPending(kind: ContextKind, record: Data) {
    return hasUnsafeProtectedContext(kind, record);
}

/** This projection does not claim durable cleanup, or inspect/redact free text. */
export function projectProtectedContext(kind: ContextKind, record: Data): Data {
    if (!protectedContextPending(kind, record)) return record;
    const cleaned = stripProtectedInput(record);
    return { ...cleaned.value, ...(kind === 'proposedAction' ? {
        action: unavailableProtectedTarget(kind, record) ? 'unavailable' : record.action,
        status: record.status === 'proposed' ? 'blocked' : record.status,
    } : {}), protectedContextCleanup: { status: 'pending', removedFields: cleaned.removedFields,
        notice: 'Historical structured protected context withheld; owner cleanup required. Free text remains source data.' } };
}

export function cleanupProtectedContext(s: State, a: Actor, input: Data): Data {
    requireThat(a.owner, 'Current native owner required', 403);
    requireThat(input.confirmed === true, 'Confirm historical structured protected context removal');
    text(input.reason, 'Cleanup reason'); rejectProtectedInput(input);
    const at = new Date().toISOString(), cleanedRuns = new Set<string>();
    let records = 0, removedFields = 0, cancelledActions = 0, quarantinedReports = 0;
    for (const kind of ['agentRun', 'proposedAction'] as const) for (const record of all(s, kind)) {
        const affected = protectedContextPending(kind, record);
        const staleRun = kind === 'proposedAction' && cleanedRuns.has(record.run);
        if (!affected && !staleRun) continue;
        const cleaned = stripProtectedInput(record);
        const immutableReport = kind === 'agentRun' && record.workflow === 'value-realization';
        const marker = { status: immutableReport ? 'quarantined' : 'cleaned', at, actor: a.id, removedFields: cleaned.removedFields,
            ...(immutableReport ? { authorityInvalidated: true, evidenceVerification: 'unavailable-after-protected-context-removal' } : {}),
            notice: 'Structured protected fields removed; free text retained as source data without redaction.' };
        const next = { ...cleaned.value, protectedContextCleanup: marker };
        if (kind === 'agentRun') {
            if (immutableReport) quarantinedReports++;
            else next.version = record.version + 1;
            cleanedRuns.add(record.id);
        } else {
            if (unavailableProtectedTarget(kind, record)) next.action = 'unavailable';
            if (record.status === 'proposed') { next.status = 'cancelled'; cancelledActions++; }
        }
        put(s, kind, record.id, next); records++; removedFields += cleaned.removedFields;
        // Retain no removed values, paths, suffixes, or untrusted reason text in audit.
        audit(s, a, 'protected-context-cleanup', record.id, { kind, removedFields: cleaned.removedFields,
            reason: 'Owner confirmed historical structured protected context removal', quarantined: immutableReport, freeTextRedacted: false });
    }
    return { records, removedFields, cancelledActions, quarantinedReports, freeTextRedacted: false };
}
