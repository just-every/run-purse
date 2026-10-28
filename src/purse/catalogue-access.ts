import { unrestrictedPermission } from './access-records';
import { builtinRoles } from './access';
import { all, audit, can, get, put, roles, requireThat, text, type Actor, type Data, type State } from './types';

export const catalogueDimensions = ['departments', 'locations', 'entities', 'roles'] as const;
export function catalogueLists(input: unknown, label: string, s?: State): Data {
    requireThat(input === undefined || (input !== null && typeof input === 'object' && !Array.isArray(input)), label + ' must be an object');
    const value = (input ?? {}) as Data, result: Data = {};
    for (const field of catalogueDimensions) {
        requireThat(value[field] === undefined || Array.isArray(value[field]), field + ' must be a list');
        const list = value[field] ?? [];
        requireThat(list.length <= 100, field + ' allows at most 100 values');
        result[field] = list.map((v: unknown) => text(v, field, 200));
        requireThat(new Set(result[field]).size === result[field].length, field + ' contains duplicates');
        if (field === 'roles') requireThat(result[field].every((r: string) => builtinRoles.includes(r) || Boolean(s?.has('accessRole:' + r))), 'Unknown catalogue role');
    }
    return result;
}
export function catalogueAllows(s: State, a: Actor, record: Data) {
    if (a.owner) return true;
    const grant = all(s, 'catalogueGrant').find(g => g.email === a.email.toLowerCase());
    return catalogueDimensions.every(d => !record.access?.[d]?.length || record.access[d].some((v: string) => (d === 'roles' ? roles(s, a) : grant?.[d] ?? []).includes(v)));
}
export function requireCatalogueAccess(s: State, a: Actor, record: Data) {
    requireThat(catalogueAllows(s, a, record), 'Catalogue selection is outside requester access', 403);
}
export function catalogueGrants(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'catalogue-grant') return;
    can(s, a, 'owner');
    const email = text(b.email, 'Member email').toLowerCase();
    const member = get(s, 'member', email);
    requireThat(member.active, 'Choose an active member');
    // Roles always come from current native purchasing capabilities, never a grant.
    const { roles: ignored, ...scope } = catalogueLists(b, 'Catalogue membership', s);
    put(s, 'catalogueGrant', email, { email, ...scope });
    audit(s, a, op, email, scope);
    return get(s, 'catalogueGrant', email);
}

export function requireCatalogueManagement(s: State, a: Actor) {
    requireThat(a.owner || unrestrictedPermission(s, a, 'procurement.manage'), 'Unrestricted procurement permission required for catalogue import', 403);
}
