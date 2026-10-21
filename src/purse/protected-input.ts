import { Fault } from './types';
import { containsProtectedInput } from '../../scripts/installer/protected-context-fields.mjs';
export { containsProtectedInput, stripProtectedInput } from '../../scripts/installer/protected-context-fields.mjs';

// Structured protected fields never enter preparation context or proposed input.
// Free text remains source data; this is not a general free-text redactor.
export class ProtectedInputFault extends Fault {
    constructor() { super(400, 'Protected fields are unavailable to preparations and proposed actions'); }
}
export function rejectProtectedInput(value: unknown): void {
    if (containsProtectedInput(value)) throw new ProtectedInputFault();
}
