import { Fault, requireThat, text, type Data } from './types';

export const userSchema = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const enterpriseSchema = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export const listSchema = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export class ScimFault extends Fault {
    constructor(status: number, message: string, public scimType?: string) { super(status, message); }
}
export async function scimBody(request: Request): Promise<Data> {
    const raw = await request.text(); requireThat(new TextEncoder().encode(raw).length <= 32000, 'SCIM input too large', 413);
    try { const value = JSON.parse(raw); requireThat(value && typeof value === 'object' && !Array.isArray(value), 'SCIM object required'); return value; }
    catch (error) { if (error instanceof Fault) throw error; throw new ScimFault(400, 'Invalid JSON', 'invalidSyntax'); }
}
const optionalText = (v: unknown, label: string, max = 500) => v === undefined || v === null || v === '' ? '' : text(v, label, max);
export function userInput(b: Data, previous?: Data): Data {
    requireThat(Array.isArray(b.schemas) && b.schemas.includes(userSchema) && b.schemas.every((schema: string) => [userSchema, enterpriseSchema].includes(schema)), 'Supported User schema required');
    const userName = text(b.userName, 'userName', 254).toLowerCase();
    requireThat(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userName), 'userName must be an email address');
    const externalId = text(b.externalId, 'externalId', 500);
    if (previous && (userName !== previous.userName || externalId !== previous.externalId)) throw new ScimFault(400, 'userName and externalId are immutable; provision a separate identity', 'mutability');
    requireThat(b.active === undefined || typeof b.active === 'boolean', 'active must be boolean');
    // Provider role/group claims have no purchasing or native authority.
    for (const field of ['password', 'roles', 'entitlements', 'groups', 'grants', 'owner']) if (b[field] !== undefined) throw new ScimFault(400, 'Attribute is not writable: ' + field, 'mutability');
    const enterprise = b[enterpriseSchema] ?? {};
    requireThat(enterprise && typeof enterprise === 'object' && !Array.isArray(enterprise), 'Enterprise attributes must be an object');
    const manager = enterprise.manager;
    requireThat(manager === undefined || manager === null || typeof manager === 'object' && !Array.isArray(manager), 'manager must be an object');
    const department = optionalText(enterprise.department, 'department', 200), managerId = optionalText(manager?.value, 'manager.value', 200);
    const displayName = optionalText(b.displayName, 'displayName', 200) || optionalText(b.name?.formatted, 'name.formatted', 200) || userName;
    if (b.emails !== undefined) requireThat(Array.isArray(b.emails) && b.emails.length <= 10 && b.emails.every((email: Data) => email && typeof email.value === 'string' && email.value.toLowerCase() === userName), 'Only the immutable userName email is supported');
    return { userName, externalId, displayName, active: b.active !== false, department, manager: managerId };
}
export function userDocument(user: Data, origin: string): Data {
    return { schemas: [userSchema, enterpriseSchema], id: user.id, externalId: user.externalId, userName: user.userName, displayName: user.displayName, active: user.active,
        emails: [{ value: user.userName, primary: true }], [enterpriseSchema]: { department: user.department, ...(user.manager ? { manager: { value: user.manager, $ref: origin + '/scim/v2/Users/' + encodeURIComponent(user.manager) } } : {}) },
        meta: { resourceType: 'User', created: user.createdAt, lastModified: user.updatedAt, location: origin + '/scim/v2/Users/' + encodeURIComponent(user.id), version: 'W/"' + user.version + '"' } };
}
/** PATCH changes only declared User attributes. Unsupported paths fail atomically. */
export function patchedUser(previous: Data, body: Data, origin: string): Data {
    requireThat(Array.isArray(body.schemas) && body.schemas.includes(patchSchema) && Array.isArray(body.Operations) && body.Operations.length > 0 && body.Operations.length <= 50, 'SCIM PatchOp required');
    const result = userDocument(previous, origin);
    for (const operation of body.Operations) {
        requireThat(operation && typeof operation.op === 'string', 'PATCH operation required');
        const op = operation.op.toLowerCase(); requireThat(['add', 'replace', 'remove'].includes(op), 'Unsupported PATCH operation');
        const path = operation.path;
        if (path === undefined) {
            requireThat(op !== 'remove' && operation.value && typeof operation.value === 'object' && !Array.isArray(operation.value), 'PATCH value object required');
            for (const [field, value] of Object.entries(operation.value)) {
                requireThat(['userName', 'externalId', 'displayName', 'name', 'active', 'emails', enterpriseSchema].includes(field), 'Unsupported PATCH attribute');
                result[field] = field === enterpriseSchema ? { ...result[field], ...(value as Data) } : value;
            }
            continue;
        }
        requireThat(typeof path === 'string', 'PATCH path required');
        const enterprisePath = path.startsWith(enterpriseSchema + ':') ? path.slice(enterpriseSchema.length + 1) : null;
        if (enterprisePath !== null) {
            requireThat(['department', 'manager', 'manager.value'].includes(enterprisePath), 'Unsupported enterprise PATCH path');
            const value = result[enterpriseSchema];
            if (enterprisePath === 'manager.value') value.manager = op === 'remove' ? undefined : { value: operation.value };
            else value[enterprisePath] = op === 'remove' ? undefined : operation.value;
        } else if (path === enterpriseSchema) {
            requireThat(op !== 'remove' || !previous.department && !previous.manager, 'Remove department or manager explicitly');
            result[path] = op === 'remove' ? {} : { ...result[path], ...operation.value };
        } else {
            requireThat(['userName', 'externalId', 'displayName', 'active', 'emails', 'name.formatted'].includes(path), 'Unsupported PATCH path');
            if (op === 'remove' && ['userName', 'externalId', 'active'].includes(path)) throw new ScimFault(400, 'Required attribute cannot be removed', 'mutability');
            if (path === 'name.formatted') result.displayName = op === 'remove' ? undefined : operation.value;
            else result[path] = op === 'remove' ? undefined : operation.value;
        }
    }
    return userInput(result, previous);
}
