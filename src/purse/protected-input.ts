import { Fault } from './types';

// Structured protected fields never enter preparation context or proposed input.
// Free text remains source data; this is not a general free-text redactor.
const protectedNames = new Set(['tin', 'ein', 'ssn', 'taxid', 'taxidentificationnumber',
    'bankaccount', 'bankaccountnumber', 'bankrouting', 'routingnumber',
    'connectorsecret', 'clientsecret', 'apikey', 'accesstoken', 'refreshtoken',
    'matching', 'suppliermatchingkey']);
export class ProtectedInputFault extends Fault {
    constructor() { super(400, 'Protected fields are unavailable to preparations and proposed actions'); }
}
export function rejectProtectedInput(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
        if (protectedNames.has(name.replace(/[^a-z0-9]/gi, '').toLowerCase())) throw new ProtectedInputFault();
        rejectProtectedInput(child);
    }
}
