// Structured context only: free text remains source data, never claimed redacted.
const protectedNames = new Set(['tin', 'ein', 'ssn', 'taxid', 'taxidentificationnumber',
    'bankaccount', 'bankaccountnumber', 'bankrouting', 'routingnumber',
    'connectorsecret', 'clientsecret', 'apikey', 'accesstoken', 'refreshtoken',
    'matching', 'suppliermatchingkey']);
const normalize = name => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
const selectors = new Set(['field', 'fieldname', 'targetfield', 'protectedfield']);
const protectedEntry = (name, child) => protectedNames.has(normalize(name))
    || selectors.has(normalize(name)) && typeof child === 'string' && protectedNames.has(normalize(child));

export function containsProtectedInput(value) {
    return Boolean(value && typeof value === 'object' && Object.entries(value).some(([name, child]) =>
        protectedEntry(name, child) || containsProtectedInput(child)));
}

/** No removed values or paths enter the receipt. A selector binds its whole payload. */
export function stripProtectedInput(value) {
    if (!value || typeof value !== 'object') return { value, removedFields: 0 };
    if (Object.entries(value).some(([name, child]) => selectors.has(normalize(name)) && protectedEntry(name, child)))
        return { value: Array.isArray(value) ? [] : {}, removedFields: Object.keys(value).length };
    let removedFields = 0;
    const entries = Object.entries(value).flatMap(([name, child]) => {
        if (protectedEntry(name, child)) { removedFields++; return []; }
        const cleaned = stripProtectedInput(child); removedFields += cleaned.removedFields;
        return [[name, cleaned.value]];
    });
    return { value: Array.isArray(value) ? entries.map(([, child]) => child) : Object.fromEntries(entries), removedFields };
}

export const preparationActions = ['submit', 'decision', 'convert', 'issue', 'receipt'];
export const executablePreparationAction = action => preparationActions.includes(action) || action === 'value-confirm' || action === 'late-order-record' || action === 'quote-agent-review' || action === 'coding-agent-review';
export const unavailableProtectedTarget = (kind, record) => kind === 'proposedAction'
    && !executablePreparationAction(record.action)
    && !(record.action === 'unavailable' && record.protectedContextCleanup?.status === 'cleaned');
export function hasUnsafeProtectedContext(kind, record) {
    return ['agentRun', 'proposedAction'].includes(kind)
        && (containsProtectedInput(record) || unavailableProtectedTarget(kind, record));
}
