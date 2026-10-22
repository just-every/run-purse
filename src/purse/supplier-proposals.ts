import { containsProtectedInput } from './protected-context-fields.mjs';
import { supplierMatches } from './supplier-matching';
import { supplier } from './admin';
import { all, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

export function proposedSupplier(s: State, a: Actor, input: Data) {
    requirePermission(s, a, 'request.create');
    requireThat(!containsProtectedInput(input), 'Protected supplier fields require the dedicated native owner door');
    requireThat(input.consent === true, 'Confirm proposing this supplier for review');
    const name = text(input.name, 'Proposed supplier name', 200);
    requireThat(!all(s, 'supplier').some(v => !v.mergedInto && v.name.toLowerCase() === name.toLowerCase()), 'Supplier already exists; select it from the register', 409);
    const contactEmail = text(input.contactEmail, 'Supplier contact email', 254);
    requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail), 'Use a valid supplier email');
    requireThat(!supplierMatches(s, {name,contacts:[{name:input.contactName||name,email:contactEmail}],website:input.website||''}).length, 'A possible existing supplier matches this name or email domain; choose it from the register or ask a supplier administrator to review', 409);
    const id = uid();
    put(s, 'supplier', id, { name, status: 'proposed', requestedStatus: 'proposed', reason: 'Requester proposal awaiting supplier review', address: '', remitTo: '', postalState: '', contacts: [], contractRef: '', screenings: [], documents: [], proposedBy: a.id });
    put(s, 'supplierProposal', id, { supplier: id, requester: a.id, requesterEmail: a.email, name, contactEmail,
        contactName: input.contactName ? text(input.contactName, 'Supplier contact name', 200) : name, category: input.category ? text(input.category, 'Supplier category', 200) : '',
        website: input.website ? text(input.website,'Website',500) : '', phone: input.phone ? text(input.phone, 'Supplier phone', 100) : '', address: input.address ? text(input.address, 'Supplier address') : '', reason: text(input.reason, 'Why this supplier'),
        status: 'pending', consent: true, at: new Date().toISOString() });
    audit(s, a, 'supplier-proposal', id, { consent: true }); return id;
}
export function requestSupplier(s: State, a: Actor, id: string, request?: Data) {
    const value = get(s, 'supplier', id);
    if (value.status !== 'proposed') return supplier(s, id);
    requireThat(value.proposedBy === a.id || request?.supplier === id && request.requester === value.proposedBy, 'Pending supplier belongs to another requester', 403);
    return value;
}
