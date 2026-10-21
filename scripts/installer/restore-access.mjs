import { check, same } from './restore-validation.mjs';
import { validateScimMember } from './restore-scim.mjs';

// Installer-side schema for the native access-permissions/access-admin doors.
const permissions = new Set(['access.manage','procurement.manage','request.create','request.read','request.edit','request.approve','po.read','po.convert','po.issue','receive','invoice.read','invoice.capture','invoice.review','payable.terms','payable.approve','cash.read','report.read','performance.read','audit.read','audit.export','rfq.manage','rfq.read','intake.admin']);
const builtins = new Set(['owner','admin','requester','approver','buyer','receiver','ap-clerk','finance-viewer','auditor']);
const dimensions = { departments: 'costCentres', locations: 'locations', projects: 'projects', entities: null };
export const accessObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const accessText = (value, max = 2000) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
export const accessShape = (value, required, optional = []) => accessObject(value) && required.every(field => Object.hasOwn(value, field)) && Object.keys(value).every(field => required.includes(field) || optional.includes(field));
export function validateBuyerLimit(limit, complete = false) {
    const fields = ['absoluteMinor','percent','quantityPercent'];
    check(accessObject(limit) && Object.keys(limit).length > 0 && Object.keys(limit).every(field => fields.includes(field)) && (!complete || fields.every(field => Object.hasOwn(limit, field))), 'access_buyer_limit');
    for (const [field, value] of Object.entries(limit)) check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (field === 'absoluteMinor' ? 1e12 : 10000) && (field !== 'absoluteMinor' || Number.isSafeInteger(value)), 'access_buyer_limit');
}
function scope(value, business) {
    check(accessObject(value) && Object.keys(value).every(field => Object.hasOwn(dimensions, field)), 'access_scope');
    for (const [field, values] of Object.entries(value)) {
        const choices = field === 'entities' ? ['main'] : business[dimensions[field]];
        check(Array.isArray(values) && values.length > 0 && values.length <= 100 && Array.isArray(choices) && values.every(value => typeof value === 'string' && choices.includes(value)) && new Set(values).size === values.length, 'access_scope');
    }
}
export function validateAccess(all, get) {
    const business = get('business','main'), roles = new Map(all('accessRole').map(role => [role.id, role]));
    const exists = role => typeof role === 'string' && role !== 'owner' && (builtins.has(role) || roles.has(role));
    const canHaveLimits = role => role === 'buyer' || roles.has(role);
    const evidence = (row, action) => all('audit').some(event => event.action === action && event.record === row.id && accessText(event.actor) && accessText(event.email) && Number.isFinite(Date.parse(event.at)) && accessObject(event.after) && (!Object.hasOwn(event.after,'id') || event.after.id === row.id) && same({ ...event.after, id: row.id }, row));
    for (const role of roles.values()) {
        check(accessShape(role, ['id','name','permissions','scope','active'], ['limits']) && accessText(role.id, 100) && !builtins.has(role.id) && accessText(role.name, 100) && typeof role.active === 'boolean', 'access_role');
        check(Array.isArray(role.permissions) && role.permissions.length > 0 && role.permissions.every(permission => permissions.has(permission)) && new Set(role.permissions).size === role.permissions.length, 'access_role_permissions');
        scope(role.scope, business);
        if (Object.hasOwn(role, 'limits')) validateBuyerLimit(role.limits);
        check(evidence(role, 'access-role'), 'access_role_audit');
    }
    for (const member of all('member')) {
        check(accessShape(member, ['id','email','name','roles','active'], ['grants','scim','department','manager']) && accessText(member.email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(member.email) && member.id === member.email && member.email === member.email.toLowerCase() && accessText(member.name) && typeof member.active === 'boolean', 'access_member');
        check(Array.isArray(member.roles) && member.roles.every(exists), 'access_member_roles');
        // Pre-ACCESS archives keep their supported roles-only representation.
        if (!Object.hasOwn(member, 'grants')) { check(!['scim','department','manager'].some(field => Object.hasOwn(member,field)),'access_member_provenance'); continue; }
        check(Array.isArray(member.grants) && member.grants.length <= 100, 'access_member_grants');
        for (const grant of member.grants) {
            check(accessShape(grant, ['role','scope'], ['departmentRead','limits']) && exists(grant.role), 'access_grant');
            scope(grant.scope, business);
            check(!Object.hasOwn(grant, 'departmentRead') || typeof grant.departmentRead === 'boolean', 'access_department_read');
            check(!grant.departmentRead || grant.role === 'requester' && grant.scope.departments?.length > 0, 'access_department_read');
            if (Object.hasOwn(grant, 'limits')) { check(canHaveLimits(grant.role), 'access_grant_limit_role'); validateBuyerLimit(grant.limits); }
        }
        check(same(member.roles, [...new Set(member.grants.map(grant => grant.role))]), 'access_member_grant_roles');
        if (Object.hasOwn(member, 'scim')) validateScimMember(member,all,get);
        else { check(!Object.hasOwn(member,'department') && !Object.hasOwn(member,'manager'),'access_member_provenance'); check(evidence(member, 'member'), 'access_member_audit'); }
    }
    for (const row of all('buyerRoleLimit')) {
        // A revoked custom role may retain inert historical defaults. Restoring
        // them never recreates native identity or bypasses today's role checks.
        check(accessShape(row, ['id','role','entity','limits']) && exists(row.role) && canHaveLimits(row.role) && row.entity === 'main' && row.id === row.role + ':main', 'access_role_limit');
        validateBuyerLimit(row.limits); check(evidence(row, 'buyer-role-limit'), 'access_role_limit_audit');
    }
}
