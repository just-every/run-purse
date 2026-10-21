import type { AccessGrant, AccessScope } from './access';
import type { Actor } from './types';

type Context = { actor: Actor; grants: AccessGrant[] };
const restricted = (grant: AccessGrant) => Object.keys(grant.scope).length > 0 || Object.keys(grant.roleScope ?? {}).length > 0;

/** Each SQL alternative represents one complete grant. Ordinary unrestricted
 * reads need neither purchasing JSON nor an extra domain-table join.
 */
export function searchAccessGate(current: Context, bind: (value: unknown) => string) {
    let scoped = false;
    function scopeSql(scope: AccessScope, index: number, root: 'scope' | 'roleScope') {
        const checks: string[] = [];
        for (const dimension of ['departments', 'locations', 'projects', 'entities'] as const) {
            if (scope[dimension] === undefined) continue;
            scoped = true;
            // All scope lists share one bound JSON value, keeping many grants
            // within D1's parameter budget without interpolating their values.
            const allowed = `SELECT value FROM json_each(json_extract(search_acl.grants,'$[${index}].${root}.${dimension}'))`;
            if (dimension === 'projects') {
                checks.push(`json_type(scope_r.value,'$.lines')='array' AND json_array_length(scope_r.value,'$.lines')>0 AND NOT EXISTS(
                    SELECT 1 FROM json_each(scope_r.value,'$.lines') scope_line
                    WHERE scope_line.type<>'object'
                    OR coalesce(json_type(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project'),'')<>'text'
                    OR coalesce(json_extract(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project'),'')=''
                    OR json_extract(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project') NOT IN (${allowed}))`);
            } else {
                const field = dimension === 'departments' ? 'costCentre' : dimension === 'locations' ? 'location' : 'entity';
                const value = `json_extract(scope_r.value,'$.${field}')`;
                checks.push(dimension === 'entities'
                    ? `coalesce(nullif(${value},''),'main') IN (${allowed})`
                    : `json_type(scope_r.value,'$.${field}')='text' AND ${value}<>'' AND ${value} IN (${allowed})`);
            }
        }
        return checks.length ? `(scope_r.id IS NOT NULL AND ${checks.map(check => '(' + check + ')').join(' AND ')})` : '1';
    }
    function permissionSql(permission: string) {
        const grants = current.grants.map((grant, index) => ({ grant, index })).filter(({ grant }) => grant.permissions.includes(permission));
        if (grants.some(({ grant }) => grant.role !== 'requester' && !restricted(grant))) return '1';
        if (!grants.length) return '0';
        const needsOwn = grants.some(({ grant }) => grant.role === 'requester' && !(grant.departmentRead && grant.scope.departments?.length));
        const own = needsOwn ? `(r.requesterId=${bind(current.actor.id)} OR lower(r.requesterEmail)=${bind(current.actor.email.toLowerCase())})` : '1';
        return '(' + grants.map(({ grant, index }) => {
            const scope = scopeSql(grant.scope, index, 'scope'), roleScope = scopeSql(grant.roleScope ?? {}, index, 'roleScope');
            const ownership = grant.role !== 'requester' || grant.departmentRead && grant.scope.departments?.length ? '1' : own;
            return `(${scope} AND ${roleScope} AND ${ownership})`;
        }).join(' OR ') + ')';
    }
    const request = permissionSql('request.read'), order = permissionSql('po.read'), invoice = permissionSql('invoice.read');
    return {
        clause: `(r.id IS NOT NULL AND ((s.kind IN ('request','quoteReading') AND (${request})) OR (s.kind IN ('order','receipt') AND (${order})) OR ((s.kind='invoice' OR (s.kind='invoiceReading' AND o.id IS NOT NULL)) AND (${invoice}))))`,
        join: scoped ? `CROSS JOIN (SELECT ? AS grants) search_acl LEFT JOIN p_records scope_r ON scope_r.business='main' AND scope_r.kind='request' AND scope_r.id=r.id` : '',
        scopeParameter: scoped ? JSON.stringify(current.grants) : undefined,
        unrestrictedProcurement: current.grants.some(grant => grant.permissions.includes('procurement.manage') && !restricted(grant)),
    };
}
