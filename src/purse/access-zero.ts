import { accessGrants } from './access';
import { builtinPermissions, scopeDimensions, type AccessGrant } from './access-permissions';
import { all, type Actor, type Data, type State } from './types';

export const zeroBuyerLimits = { absoluteMinor: 0, percent: 0, quantityPercent: 0 };
export const memberGrantList = (member: Data): Data[] => member.grants ?? (member.roles ?? []).map((role: string) => ({ role }));

function dimensionValues(grant: Pick<AccessGrant, 'scope' | 'roleScope'>, dimension: typeof scopeDimensions[number]) {
    const direct = grant.scope[dimension], role = grant.roleScope?.[dimension];
    return direct && role ? direct.filter(value => role.includes(value)) : direct ?? role;
}
/** Containment covers the entire grant, including unrestricted dimensions.
 * Separate administrator grants cannot lend dimensions to one another.
 */
function contains(manager: AccessGrant, target: Pick<AccessGrant, 'scope' | 'roleScope'>) {
    return scopeDimensions.every(dimension => {
        const permitted = dimensionValues(manager, dimension), values = dimensionValues(target, dimension);
        return permitted === undefined || values !== undefined && values.every(value => permitted.includes(value));
    });
}
function subjectsForMember(s: State, managers: AccessGrant[], member: Data) {
    return memberGrantList(member).flatMap((grant, grantIndex) => {
        const custom = s.get('accessRole:' + grant.role)?.value;
        const permissions = builtinPermissions[grant.role] ?? (custom?.active !== false ? custom?.permissions : undefined);
        if (!permissions?.includes('po.convert') || grant.role === 'owner') return [];
        const scope = grant.scope ?? {}, roleScope = custom?.scope;
        if (!managers.some(manager => contains(manager, { scope, roleScope }))) return [];
        return [{ email: member.email, name: member.name, grantIndex, role: grant.role, scope,
            ...(roleScope ? { roleScope } : {}) }];
    });
}
export function zeroableBuyerGrants(s: State, a: Actor, member: Data) {
    return subjectsForMember(s, accessGrants(s, a).filter(grant => grant.permissions.includes('access.manage')), member);
}
export function buyerZeroSubjects(s: State, a: Actor) {
    const managers = accessGrants(s, a).filter(grant => grant.permissions.includes('access.manage'));
    return managers.length ? all(s, 'member').flatMap(member => subjectsForMember(s, managers, member)) : [];
}
