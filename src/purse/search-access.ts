import type { AccessGrant } from './access';
import type { Actor } from './types';

const dimensions = ['departments', 'locations', 'projects', 'entities'] as const;
type Context = { actor: Actor; grants: AccessGrant[] };
type Dimension = typeof dimensions[number];
const restricted = (grant: AccessGrant) => Object.keys(grant.scope).length > 0 || Object.keys(grant.roleScope ?? {}).length > 0;
const reads = [[`s.kind IN ('request','quoteReading')`, 'request.read'], [`s.kind IN ('order','receipt')`, 'po.read'],
    [`(s.kind='invoice' OR (s.kind='invoiceReading' AND o.id IS NOT NULL))`, 'invoice.read']] as const;
const lists = JSON.stringify({ ...Object.fromEntries(dimensions.map(dimension => ['$.scope.' + dimension, dimension])), '$.costCentres': 'departments', '$.locations': 'locations', '$.projects': 'projects' });

/** A value must fit both the grant and its role scope, so each dimension keeps their intersection. */
function allowedValues(grant: AccessGrant) {
    const values = (list: unknown) => Array.isArray(list) ? list : [];
    return Object.fromEntries(dimensions.flatMap(dimension => {
        const scope = grant.scope[dimension], role = grant.roleScope?.[dimension];
        if (scope === undefined && role === undefined) return [];
        return [[dimension, scope === undefined ? values(role) : role === undefined ? values(scope) : values(scope).filter(value => values(role).includes(value))]];
    }));
}

/** recordContext ignores empty, '*' and missing values; every other one must be allowed. */
function fits(value: string, path: string) {
    return `(coalesce(${value},'') IN ('','*') OR json_type(access_grant.value,${path}) IS NULL OR ${value} IN (SELECT value FROM json_each(access_grant.value,${path})))`;
}
function codedFits(json: string, allocation = false) {
    return [fits(`coalesce(json_extract(${json},'$.costCentre'),json_extract(${json},'$.department'))`, `'$.departments'`),
        fits(`json_extract(${json},'$.location')`, `'$.locations'`), fits(`json_extract(${json},'$.project')`, `'$.projects'`),
        ...(allocation ? [] : [fits(`coalesce(json_extract(${json},'$.entity'),json_extract(${json},'$.entityId'))`, `'$.entities'`)])].join(' AND ');
}
/** Every coding value recordContext reads from a record: its header, coding lists,
 * each line and each split allocation.
 */
function codingFits(record: string) {
    const line = `CASE WHEN coding_line.type='object' THEN coding_line.value END`, split = `CASE WHEN coding_split.type='object' THEN coding_split.value END`;
    return `(${codedFits(record)}
        AND NOT EXISTS(SELECT 1 FROM json_each(${record},'$.lines') coding_line WHERE NOT (${codedFits(line)})
            OR EXISTS(SELECT 1 FROM json_each(${line},'$.allocations') coding_split WHERE NOT (${codedFits(split, true)})))
        AND (json_extract(${record},'$.scope','$.costCentres','$.locations','$.projects')='[null,null,null,null]'
            OR NOT EXISTS(SELECT 1 FROM json_each('${lists}') coding_list, json_each(${record},coding_list.key) coding_item WHERE NOT ${fits('coding_item.value', `'$.'||coding_list.value`)})))`;
}

/** The request header names an allowed value; for projects every line does. */
function presence(dimension: Dimension, allowed: string) {
    if (dimension === 'projects') return `json_type(scope_r.value,'$.lines')='array' AND json_array_length(scope_r.value,'$.lines')>0 AND NOT EXISTS(
        SELECT 1 FROM json_each(scope_r.value,'$.lines') scope_line
        WHERE scope_line.type<>'object'
        OR coalesce(json_type(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project'),'')<>'text'
        OR coalesce(json_extract(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project'),'')=''
        OR json_extract(CASE WHEN scope_line.type='object' THEN scope_line.value ELSE '{}' END,'$.project') NOT IN (${allowed}))`;
    if (dimension === 'entities') return `coalesce(nullif(json_extract(scope_r.value,'$.entity'),''),'main') IN (${allowed})`;
    const field = dimension === 'departments' ? 'costCentre' : 'location', value = `json_extract(scope_r.value,'$.${field}')`;
    return `json_type(scope_r.value,'$.${field}')='text' AND ${value}<>'' AND ${value} IN (${allowed})`;
}

/** Each grant is one SQL row: a result needs a single grant holding the kind's read
 * permission whose every restricted dimension covers all the coding of the request
 * and, for order-bound results, of the order. All grants share one bound JSON value,
 * so the statement stays the same size and within D1's parameter budget however many
 * grants a member holds. Ordinary unrestricted reads need neither purchasing JSON
 * nor an extra domain-table join.
 */
export function searchAccessGate(current: Context, bind: (value: unknown) => string) {
    const open: string[] = [], held: string[] = [], considered = new Set<number>();
    for (const [kinds, permission] of reads) {
        const indexes = current.grants.flatMap((grant, index) => grant.permissions.includes(permission) ? [index] : []);
        if (indexes.some(index => current.grants[index].role !== 'requester' && !restricted(current.grants[index]))) open.push(kinds);
        else if (indexes.length) { held.push(`(${kinds} AND access_grant.key IN (${indexes.join(',')}))`); indexes.forEach(index => considered.add(index)); }
    }
    const allowed = current.grants.map(allowedValues), checks = dimensions.filter(dimension => [...considered].some(index => allowed[index][dimension]))
        .map(dimension => `(json_type(access_grant.value,'$.${dimension}') IS NULL OR (scope_r.id IS NOT NULL AND ${presence(dimension, `SELECT value FROM json_each(access_grant.value,'$.${dimension}')`)}))`);
    const scoped = checks.length > 0;
    if (scoped) checks.push(codingFits('scope_r.value'), `(scope_o.id IS NULL OR ${codingFits('scope_o.value')})`);
    const own = [...considered].filter(index => current.grants[index].role === 'requester' && !(current.grants[index].departmentRead && current.grants[index].scope.departments?.length));
    if (own.length) checks.push(`(access_grant.key NOT IN (${own.join(',')}) OR r.requesterId=${bind(current.actor.id)} OR lower(r.requesterEmail)=${bind(current.actor.email.toLowerCase())})`);
    if (held.length) open.push(`EXISTS(SELECT 1 FROM json_each(search_acl.grants) access_grant WHERE (${held.join(' OR ')})${checks.map(check => ' AND ' + check).join('')})`);
    return {
        clause: `(r.id IS NOT NULL AND (${open.join(' OR ') || '0'}))`,
        join: held.length ? `CROSS JOIN (SELECT ? AS grants) search_acl${scoped ? ` LEFT JOIN p_records scope_r ON scope_r.business='main' AND scope_r.kind='request' AND scope_r.id=r.id
            LEFT JOIN p_records scope_o ON scope_o.business='main' AND scope_o.kind='order' AND scope_o.id=CASE WHEN s.kind='order' THEN s.id WHEN s.kind IN ('receipt','invoice','invoiceReading') THEN o.id END` : ''}` : '',
        scopeParameter: held.length ? JSON.stringify(allowed) : undefined,
        unrestrictedProcurement: current.grants.some(grant => grant.permissions.includes('procurement.manage') && !restricted(grant)),
    };
}
