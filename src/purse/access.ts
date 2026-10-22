import { all, requireThat, type Actor, type Data, type State } from './types';
import { builtinPermissions, permissions, scopeDimensions, type AccessGrant, type AccessScope, type BuyerLimit } from './access-permissions';
export { builtinRoles, permissions, type Permission, type AccessScope, type AccessGrant, type BuyerLimit } from './access-permissions';

export function accessGrants(s: State, a: Actor): AccessGrant[] {
    if (a.owner) return [{ role: 'owner', permissions: [...permissions], scope: {} }];
    const member = all(s, 'member').find(m => m.active && m.email?.toLowerCase() === a.email.toLowerCase());
    if (!member) return [];
    const grants: Data[] = Array.isArray(member.grants) ? member.grants : (member.roles ?? []).map((role: string) => ({ role }));
    return grants.flatMap(grant => {
        if (grant.role === 'owner') return [];
        const custom = s.get('accessRole:' + grant.role)?.value;
        const granted = builtinPermissions[grant.role] ?? (custom?.active !== false ? custom?.permissions : undefined);
        if (!Array.isArray(granted)) return [];
        return [{ role: grant.role, permissions: granted.filter((p: string) => permissions.includes(p as typeof permissions[number])), scope: grant.scope ?? {},
            ...(custom?.scope ? { roleScope: custom.scope } : {}), departmentRead: grant.departmentRead === true,
            ...(grant.limits ? { limits: grant.limits } : {}) }];
    });
}
type Context = { dimensions: Record<string, string[]>; requester?: string; requesterEmail?: string; known: boolean };
/** Follow real source relationships, retaining every dimension of mixed lines.
 * A scoped grant cannot authorize an unidentified child or missing dimension.
 */
function recordContext(s: State, record: Data, visited = new Set<Data>()): Context {
    const dimensions: Record<string, string[]> = { departments: [], locations: [], projects: [], entities: [] };
    if (visited.has(record)) return { dimensions, known: false };
    visited.add(record);
    const add = (dimension: string, value: unknown) => { if (typeof value === 'string' && value && value !== '*') dimensions[dimension].push(value); };
    let requester = record.requester, requesterEmail = record.requesterEmail;
    add('departments', record.costCentre ?? record.department); add('locations', record.location); add('projects', record.project); add('entities', record.entity ?? record.entityId);
    for (const dimension of scopeDimensions) for (const value of record.scope?.[dimension] ?? []) add(dimension, value);
    for (const value of record.costCentres ?? []) add('departments', value);
    for (const value of record.locations ?? []) add('locations', value);
    for (const value of record.projects ?? []) add('projects', value);
    for (const line of record.lines ?? []) {
        add('projects', line.project); add('departments', line.costCentre ?? line.department); add('locations', line.location); add('entities', line.entity ?? line.entityId);
        for (const allocation of line.allocations ?? []) { add('departments', allocation.costCentre ?? allocation.department); add('projects', allocation.project); }
    }
    const references: [string, unknown][] = [['request', record.request ?? record.requestId], ['order', record.order ?? record.orderId], ['invoice', record.invoice ?? record.invoiceId], ['rfq', record.rfq], ['emailIntake', record.intake ?? record.emailIntake], ['invoiceReading', record.reading]];
    if (typeof record.record === 'string') {
        const candidates = record.kind ? [s.get(record.kind + ':' + record.record)] : [...s.values()].filter(row => row.id === record.record && row.value !== record);
        if (candidates.filter(Boolean).length === 1) {
            const row = candidates.find(Boolean)!; references.push([row.kind, row.id]);
        }
    }
    let linked = false;
    for (const [kind, id] of references) {
        if (typeof id !== 'string') continue;
        const parent = s.get(kind + ':' + id)?.value; if (!parent) continue;
        const context = recordContext(s, parent, visited); linked ||= context.known;
        requester ??= context.requester; requesterEmail ??= context.requesterEmail;
        for (const dimension of scopeDimensions) dimensions[dimension].push(...context.dimensions[dimension]);
    }
    const known = linked || Object.values(dimensions).some(values => values.length > 0) || Boolean(requester || requesterEmail);
    if (known && !dimensions.entities.length) dimensions.entities.push('main');
    for (const dimension of scopeDimensions) dimensions[dimension] = [...new Set(dimensions[dimension])];
    return { dimensions, requester, requesterEmail, known };
}
function scopeMatches(scope: AccessScope, context: Context) {
    return scopeDimensions.every(dimension => scope[dimension] === undefined || context.known && context.dimensions[dimension].length > 0 && context.dimensions[dimension].every(value => scope[dimension]!.includes(value)));
}
function grantMatches(s: State, a: Actor, grant: AccessGrant, record: Data, permission?: string) {
    const context = recordContext(s, record);
    if (!scopeMatches(grant.scope, context) || grant.roleScope && !scopeMatches(grant.roleScope, context)) return false;
    if (grant.role !== 'requester' || permission === 'request.create') return true;
    if (context.requester === a.id || context.requesterEmail?.toLowerCase() === a.email.toLowerCase()) return true;
    return permission !== 'request.edit' && grant.departmentRead === true && Boolean(grant.scope.departments?.length) && context.dimensions.departments.length > 0;
}
export function grantAllows(s:State,a:Actor,grant:AccessGrant,permission:string,record?:Data){return grant.permissions.includes(permission) && (record===undefined || grantMatches(s,a,grant,record,permission));}
export function allowed(s: State, a: Actor, permission: string, record?: Data) {
    if (!permissions.includes(permission as typeof permissions[number])) return false;
    return accessGrants(s, a).some(grant => grant.permissions.includes(permission) && (record === undefined || grantMatches(s, a, grant, record, permission)));
}
export function requirePermission(s: State, a: Actor, permission: string, record?: Data) { requireThat(allowed(s, a, permission, record), 'Permission or record scope required: ' + permission, 403); }
export function recordInScope(s: State, a: Actor, record: Data, permission?: string) {
    return permission ? allowed(s, a, permission, record) : accessGrants(s, a).some(grant => grantMatches(s, a, grant, record));
}
export function resolvedPermissions(s: State, a: Actor) { return [...new Set(accessGrants(s, a).flatMap(grant => grant.permissions))]; }
export function buyerLimits(s: State, a: Actor, record: Data): BuyerLimit[] {
    if (a.owner) return [{ unlimited: true }];
    const entity = recordContext(s, record).dimensions.entities[0] ?? 'main';
    return accessGrants(s, a).filter(grant => grant.permissions.includes('po.convert') && grantMatches(s, a, grant, record)).map(grant => {
        const role = s.get('accessRole:' + grant.role)?.value;
        const defaults = s.get('buyerRoleLimit:' + grant.role + ':' + entity)?.value.limits ?? role?.limits ?? {};
        const limits: BuyerLimit = { quantityPercent: 0, ...defaults, ...grant.limits };
        if (limits.absoluteMinor === undefined && limits.percent === undefined) limits.absoluteMinor = 0;
        return limits;
    });
}
export function buyerLimit(s: State, a: Actor, record: Data) { return buyerLimits(s, a, record)[0]; }
