import { containsProtectedInput } from './protected-context-fields.mjs';
import { supplierMatches } from './supplier-matching';
import { supplier } from './admin';
import { all, allowed, accessGrants, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** Proposal contacts stay private to their requester and the native owner. */
export function mayReadProposal(s: State, a: Actor, proposal: Data) {
    return a.owner || proposal.requester === a.id && proposal.requesterEmail === a.email && allowed(s,a,'request.create');
}
export function mayChooseSupplier(s: State, a: Actor, value: Data) {
    const proposal = s.get('supplierProposal:' + value.id)?.value;
    return !proposal || mayReadProposal(s,a,proposal) || accessGrants(s,a).some(grant=>grant.permissions.includes('procurement.manage') && !Object.keys(grant.scope).length && !Object.keys(grant.roleScope??{}).length);
}
const hostname = (value: string) => {
    if (!value) return '';
    try { return new URL(value.includes('://') ? value : 'https://' + value).hostname.toLowerCase().replace(/^www\./,''); }
    catch { return ''; }
};
function proposalInput(input: Data) {
    requireThat(!containsProtectedInput(input), 'Protected supplier fields require the dedicated native owner door');
    const name = text(input.name,'Proposed supplier name',200), contactEmail = text(input.contactEmail,'Supplier contact email',254).toLowerCase();
    requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail),'Use a valid supplier email');
    const website = input.website ? text(input.website,'Website',500) : '';
    requireThat(!website || hostname(website), 'Use a valid supplier website');
    return { name, contactEmail, website,
        contactName: input.contactName ? text(input.contactName,'Supplier contact name',200) : name,
        phone: input.phone ? text(input.phone,'Supplier phone',100) : '',
        address: input.address ? text(input.address,'Supplier address') : '',
        category: input.category ? text(input.category,'Supplier category',200) : '' };
}
function matches(s: State, input: Data) {
    const others = all(s,'supplier').filter(v=>!v.mergedInto).map(v=>{
        const proposal = s.get('supplierProposal:' + v.id)?.value;
        return proposal ? {...v, contacts:[{email:proposal.contactEmail}],website:proposal.website} : v;
    });
    const found = supplierMatches(s,{...input,contacts:[{email:input.contactEmail}]},others);
    const website = hostname(input.website);
    for (const other of others) if (website && (website === hostname(other.website ?? '') || (other.contacts ?? []).some((c:Data)=>c.email.split('@')[1]?.toLowerCase()===website))) {
        const match = found.find(m=>m.id===other.id);
        if (match) match.reasons.push('website');
        else found.push({id:other.id,name:other.name,status:other.status,mergedInto:null,reasons:['website']});
    }
    return found;
}
export function proposalChoices(s: State, a: Actor, input: Data) {
    requirePermission(s,a,'request.create');
    const found = matches(s,proposalInput(input)), visible = found.filter(m=>mayChooseSupplier(s,a,get(s,'supplier',m.id)));
    return { matches: visible.map(m=>({id:m.id,name:m.name,status:m.status,reasons:m.reasons,selectable:['active','preferred'].includes(m.status)})),
        needsAdministrator: visible.length !== found.length };
}
export function proposedSupplier(s: State, a: Actor, input: Data) {
    requirePermission(s, a, 'request.create');
    const fields = proposalInput(input);
    requireThat(input.consent === true, 'Confirm proposing this supplier for review');
    requireThat(!matches(s,fields).length, 'A possible existing supplier matches; review available choices or ask the native owner', 409);
    const id = uid();
    put(s, 'supplier', id, { name:fields.name, status:'proposed', requestedStatus:'proposed', reason:'Requester proposal awaiting supplier review', address:'', remitTo:'', postalState:'', contacts:[], contractRef:'', screenings:[], documents:[], proposedBy:a.id });
    put(s, 'supplierProposal', id, { supplier:id, requester:a.id, requesterEmail:a.email, ...fields,
        reason:text(input.reason,'Why this supplier'), status:'pending', version:1, consent:true, at:new Date().toISOString() });
    audit(s, a, 'supplier-proposal', id, { consent:true }); return id;
}
export function requestSupplier(s: State, a: Actor, id: string, request?: Data) {
    const value = get(s, 'supplier', id), proposal = s.get('supplierProposal:' + id)?.value;
    if (value.status !== 'proposed') return supplier(s, id);
    requireThat(proposal?.status === 'pending' && !proposal.erasure, 'Supplier proposal is no longer available; choose another supplier',409);
    requireThat(value.proposedBy === a.id && proposal.requesterEmail === a.email || request?.supplier === id && request.requester === value.proposedBy, 'Pending supplier belongs to another requester', 403);
    return value;
}
