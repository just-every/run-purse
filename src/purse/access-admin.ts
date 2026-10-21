import { all, audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { allowed, requirePermission } from './access';
import { builtinPermissions, builtinRoles, permissions, scopeDimensions, type AccessScope, type BuyerLimit } from './access-permissions';
import { unrestrictedAccess } from './access-audit';
import { memberGrantList, zeroableBuyerGrants, zeroBuyerLimits } from './access-zero';

function scopeInput(s: State, input: unknown): AccessScope {
    if (input === undefined) return {};
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Grant scope must be an object');
    const scope = input as Data, business = s.get('business:main')?.value;
    requireThat(Object.keys(scope).every(field => scopeDimensions.includes(field as typeof scopeDimensions[number])), 'Unknown scope dimension');
    const choices: Data = { departments: business?.costCentres, locations: business?.locations, projects: business?.projects, entities: ['main', ...all(s, 'entity').map(entity => entity.id)] };
    const result: AccessScope = {};
    for (const dimension of scopeDimensions) if (Object.hasOwn(scope, dimension)) {
        const values = scope[dimension];
        requireThat(Array.isArray(values) && values.length > 0 && values.length <= 100 && values.every(value => typeof value === 'string' && value.length > 0 && choices[dimension]?.includes(value)), 'Use configured ' + dimension + ' in grant scope');
        requireThat(new Set(values).size === values.length, 'Duplicate grant scope value'); result[dimension] = [...values];
    }
    return result;
}
function limitInput(input: unknown): BuyerLimit {
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Buyer limits must be an object');
    const limits = input as Data, result: BuyerLimit = {};
    requireThat(Object.keys(limits).length > 0 && Object.keys(limits).every(field => ['absoluteMinor', 'percent', 'quantityPercent'].includes(field)), 'Invalid buyer limit');
    for (const field of ['absoluteMinor', 'percent', 'quantityPercent'] as const) if (Object.hasOwn(limits, field)) {
        const value = limits[field]; requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (field === 'absoluteMinor' ? 1e12 : 10000) && (field !== 'absoluteMinor' || Number.isSafeInteger(value)), 'Buyer limit must be a nonnegative amount or percentage'); result[field] = value;
    }
    return result;
}
function roleExists(s: State, role: unknown): role is string {
    return typeof role === 'string' && role !== 'owner' && (builtinRoles.includes(role) || s.get('accessRole:' + role)?.value.active === true);
}
function normalizeGrants(s: State, b: Data) {
    requireThat(b.grants === undefined || Array.isArray(b.grants), 'Grants must be an array');
    requireThat(b.roles === undefined || Array.isArray(b.roles), 'Roles must be an array');
    requireThat(b.grants !== undefined || b.roles !== undefined, 'Roles or grants required');
    const input: Data[] = b.grants ?? b.roles.map((role: string) => ({ role }));
    requireThat(input.length <= 100, 'Too many grants');
    return input.map(grant => {
        requireThat(grant && typeof grant === 'object' && !Array.isArray(grant) && roleExists(s, grant.role), 'Invalid role; native owner cannot be granted by membership');
        requireThat(Object.keys(grant).every(field => ['role', 'scope', 'limits', 'departmentRead'].includes(field)), 'Unknown grant field');
        const scope = scopeInput(s, grant.scope);
        requireThat(grant.departmentRead === undefined || typeof grant.departmentRead === 'boolean', 'Department read grant must be boolean');
        requireThat(!grant.departmentRead || grant.role === 'requester' && Boolean(scope.departments?.length), 'Department read requires a requester grant with explicit departments');
        const rolePermissions = builtinPermissions[grant.role] ?? s.get('accessRole:' + grant.role)?.value.permissions ?? [];
        requireThat(grant.limits === undefined || rolePermissions.includes('po.convert'), 'Only a conversion grant carries buyer limits');
        return { role: grant.role, scope, ...(grant.departmentRead === undefined ? {} : { departmentRead: grant.departmentRead }), ...(grant.limits === undefined ? {} : { limits: limitInput(grant.limits) }) };
    });
}
export function accessAdministration(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'buyer-zero-limit') {
        requirePermission(s, a, 'access.manage');
        requireThat(Object.keys(b).every(field => ['email', 'grantIndex'].includes(field)), 'Only a buyer grant can be selected; zero limits are fixed');
        const email = text(b.email, 'Email').toLowerCase(), before = get(s, 'member', email);
        requireThat(Number.isSafeInteger(b.grantIndex) && b.grantIndex >= 0, 'Choose an existing buyer grant');
        const subject = zeroableBuyerGrants(s, a, before).find(grant => grant.grantIndex === b.grantIndex);
        requireThat(subject, 'The whole buyer grant must fit one administrative grant', 403);
        const grants = memberGrantList(before).map((grant, index) => index === b.grantIndex ? { ...grant, limits: { ...zeroBuyerLimits } } : grant);
        const after = { ...before, grants };
        put(s, 'member', email, after);
        audit(s, a, 'member', email, { operation: op, grantIndex: b.grantIndex, before, after });
        return { ...subject, limits: { ...zeroBuyerLimits } };
    }
    if (op === 'member') {
        requireThat(a.owner, 'Current native owner required to change grants', 403);
        const email = text(b.email, 'Email').toLowerCase(); requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Valid email required');
        const grants = normalizeGrants(s, b), before = s.get('member:' + email)?.value ?? null;
        const after = { email, name: text(b.name, 'Name'), roles: [...new Set(grants.map(grant => grant.role))], grants, active: b.active !== false };
        put(s, 'member', email, after);
        audit(s, a, 'member', email, { roles: after.roles, active: after.active, before, after });
        return get(s, 'member', email);
    }
    if (op === 'access-role') {
        requirePermission(s, a, 'access.manage');
        const name = text(b.name, 'Role name', 100), id = text(b.id ?? b.role ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'Role id', 100);
        requireThat(!builtinRoles.includes(id), 'Built-in roles cannot be replaced');
        requireThat(Array.isArray(b.permissions) && b.permissions.length > 0 && b.permissions.every((permission: unknown) => typeof permission === 'string' && permissions.includes(permission as typeof permissions[number])), 'Choose explicit supported permissions');
        const before = s.get('accessRole:' + id)?.value ?? null, scope = scopeInput(s, b.scope ?? before?.scope);
        requireThat(b.limits === undefined || a.owner, 'Current native owner required to change buyer limits', 403);
        requireThat((b.active !== false && before?.active !== false) || a.owner, 'Current native owner required to revoke or reactivate a role', 403);
        const limits = b.limits === undefined ? before?.limits : limitInput(b.limits);
        const after = { name, permissions: [...new Set(b.permissions)], scope, active: b.active !== false, ...(limits === undefined ? {} : { limits }) };
        requireThat(b.limits === undefined || after.permissions.includes('po.convert'), 'Only a conversion role carries buyer limits');
        if (before) requirePermission(s, a, 'access.manage', before);
        requirePermission(s, a, 'access.manage', after);
        put(s, 'accessRole', id, after); audit(s, a, 'access-role', id, { before, after }); return get(s, 'accessRole', id);
    }
    if (op === 'buyer-role-limit') {
        requirePermission(s, a, 'access.manage');
        const role = b.role ?? 'buyer', entity = b.entity ?? 'main'; requireThat(roleExists(s, role), 'Invalid buyer role');
        const granted = builtinPermissions[role] ?? s.get('accessRole:' + role)?.value.permissions ?? [];
        requireThat(granted.includes('po.convert'), 'Role has no conversion permission'); scopeInput(s, { entities: [entity] });
        const limits = limitInput(b.limits ?? Object.fromEntries(['absoluteMinor', 'percent', 'quantityPercent'].filter(field => Object.hasOwn(b, field)).map(field => [field, b[field]])));
        requireThat(a.owner || unrestrictedAccess(s, a, 'access.manage') && Object.entries(zeroBuyerLimits).every(([field, value]) => limits[field as keyof BuyerLimit] === value), 'Only the native owner can raise buyer limits; unrestricted administration can set all limits to zero', 403);
        const id = role + ':' + entity, before = s.get('buyerRoleLimit:' + id)?.value ?? null, after = { role, entity, limits };
        put(s, 'buyerRoleLimit', id, after); audit(s, a, op, id, { before, after }); return get(s, 'buyerRoleLimit', id);
    }
}
/** Administrative edits must be authorized in both the old and new scope. */
export function requireAdministrativeEdit(s: State, a: Actor, before: Data | undefined, after: Data) {
    requireThat(allowed(s, a, 'access.manage'), 'Administrative capability required', 403);
    if (before) requirePermission(s, a, 'access.manage', before);
    requirePermission(s, a, 'access.manage', after);
}
