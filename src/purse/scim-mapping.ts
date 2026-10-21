import { builtinPermissions, builtinRoles, scopeDimensions } from './access-permissions';
import { all, requireThat, text, type Data, type State } from './types';

/** This parser runs only behind the current native owner's fresh proof. */
export function scimMappings(s: State, input: unknown): Data[] {
    requireThat(Array.isArray(input) && input.length <= 100, 'Provide department mappings');
    const business = s.get('business:main')?.value;
    const choices: Data = { departments: business?.costCentres ?? [], locations: business?.locations ?? [], projects: business?.projects ?? [], entities: ['main', ...all(s, 'entity').map(e => e.id)] };
    const result = input.map(mapping => {
        requireThat(mapping && typeof mapping === 'object', 'Department mapping required');
        const department = text(mapping.department, 'Mapped department', 200);
        requireThat(choices.departments.includes(department), 'Map a configured purchasing department');
        requireThat(Array.isArray(mapping.grants) && mapping.grants.length <= 30, 'Explicit grants required');
        const grants = mapping.grants.map((grant: Data) => {
            requireThat(grant && typeof grant === 'object' && Object.keys(grant).every(k => ['role', 'scope', 'limits', 'departmentRead'].includes(k)), 'Invalid mapped grant');
            requireThat(typeof grant.role === 'string' && grant.role !== 'owner' && (builtinRoles.includes(grant.role) || s.get('accessRole:' + grant.role)?.value.active === true), 'Mapped role must be a current purchasing role; native owner is prohibited');
            const scope = grant.scope ?? {}; requireThat(scope && typeof scope === 'object' && !Array.isArray(scope) && Object.keys(scope).every(k => scopeDimensions.includes(k as typeof scopeDimensions[number])), 'Invalid mapped scope');
            const normalized: Data = {};
            for (const dimension of scopeDimensions) if (Object.hasOwn(scope, dimension)) {
                const values = scope[dimension]; requireThat(Array.isArray(values) && values.length > 0 && values.length <= 100 && values.every(v => choices[dimension].includes(v)) && new Set(values).size === values.length, 'Use configured mapped scope values'); normalized[dimension] = [...values];
            }
            // A provider-controlled department can never carry the previous department's scope.
            requireThat(normalized.departments?.length === 1 && normalized.departments[0] === department, 'Every SCIM grant must be scoped to its mapped department');
            requireThat(grant.departmentRead === undefined || typeof grant.departmentRead === 'boolean' && grant.role === 'requester', 'Department read belongs to requester grants');
            const permissions = builtinPermissions[grant.role] ?? s.get('accessRole:' + grant.role)?.value.permissions ?? [];
            let limits: Data | undefined;
            if (grant.limits !== undefined) {
                requireThat(permissions.includes('po.convert') && grant.limits && typeof grant.limits === 'object' && !Array.isArray(grant.limits), 'Only conversion grants carry limits'); limits = {};
                requireThat(Object.keys(grant.limits).length > 0 && Object.keys(grant.limits).every(k => ['absoluteMinor', 'percent', 'quantityPercent'].includes(k)), 'Invalid mapped buyer limits');
                for (const [field, value] of Object.entries(grant.limits)) { requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (field === 'absoluteMinor' ? 1e12 : 10000) && (field !== 'absoluteMinor' || Number.isSafeInteger(value)), 'Invalid mapped buyer limit'); limits[field] = value; }
            }
            return { role: grant.role, scope: normalized, ...(grant.departmentRead === undefined ? {} : { departmentRead: grant.departmentRead }), ...(limits ? { limits } : {}) };
        });
        return { department, grants };
    });
    requireThat(new Set(result.map(m => m.department)).size === result.length, 'Duplicate department mapping'); return result;
}
export function mappedScimMember(s: State, config: Data, user: Data): Data {
    const template = config.mappings.find((mapping: Data) => mapping.department === user.department);
    // Revalidate current role definitions and configured scope before every provisioning event.
    const grants: Data[] = template ? scimMappings(s, [template])[0].grants : [];
    return { email: user.userName, name: user.displayName, active: user.active, roles: [...new Set(grants.map(g => g.role))], grants, department: user.department, manager: user.manager, scim: { user: user.id, issuer: user.issuer, externalId: user.externalId } };
}
