import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { allowed } from './access';

export const entityId = (record: Data) => record.entity ?? 'main';
export function activeEntity(s: State, id: string) {
    if (id === 'main') return;
    const entity = get(s, 'entity', id);
    requireThat(entity.active, 'Legal entity is inactive', 409);
    return entity;
}
export function entityIdentity(entity: Data): Data {
    return Object.fromEntries(['id', 'version', 'legalName', 'billTo', 'shipTo', 'currency', 'prefix', 'country'].map(field => [field, structuredClone(entity[field])]));
}
export function entities(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (op !== 'entity') return;
    requireThat(a.owner, 'Current native owner required to manage legal entities', 403);
    requireThat(Object.keys(input).every(field => ['id','version','legalName','billTo','shipTo','currency','prefix','country','active'].includes(field)), 'Only domestic legal identity and addresses are supported; accounting connections are unconfigured');
    const prior = input.id ? get(s, 'entity', input.id) : undefined;
    requireThat(input.version === (prior?.version ?? 0), 'Legal entity changed; reload', 409);
    const prefix = text(input.prefix, 'PO numbering prefix', 12);
    requireThat(/^[A-Z][A-Z0-9]{1,11}$/.test(prefix) && prefix !== 'PO', 'Use a distinct uppercase prefix of 2–12 letters or digits');
    requireThat(!prior || prior.prefix === prefix, 'An entity numbering prefix is immutable', 409);
    requireThat(!all(s, 'entity').some(entity => entity.id !== prior?.id && entity.prefix === prefix), 'Entity numbering prefix is already used', 409);
    requireThat(input.country === 'US' && input.currency === 'USD', 'This native entity door supports US entities in USD only');
    requireThat(get(s, 'business', 'main').currencies.includes('USD'), 'Enable USD for this installation first');
    requireThat(typeof input.active === 'boolean', 'Choose active or inactive');
    const id = prior?.id ?? uid(), next = { id, version: (prior?.version ?? 0) + 1, legalName: text(input.legalName, 'Legal name', 200),
        billTo: text(input.billTo, 'Bill-to address'), shipTo: text(input.shipTo, 'Ship-to address'), currency: 'USD', country: 'US', prefix, active: input.active, connection: 'unconfigured' };
    put(s, 'entity', id, next);
    audit(s, a, op, id, { before: prior ?? null, after: next, entity: id });
    return next;
}
export function visibleEntities(s: State, a: Actor) {
    return all(s, 'entity').filter(entity => a.owner || ['request.create','request.read','po.read','report.read','audit.read'].some(permission => allowed(s, a, permission, { entity: entity.id })));
}
/** The new door is deliberately limited to ordinary native goods. Shared
 * registers and historical main records keep their existing behaviour. */
export function requireEntityPurchase(s: State, record: Data) {
    const entity = activeEntity(s, entityId(record));
    if (!entity) return;
    requireThat(record.currency === 'USD' && record.entitySnapshot?.id === entity.id && record.entitySnapshot?.prefix === entity.prefix, 'Exact entity identity is missing', 409);
    requireThat(record.entitySnapshot.version === entity.version, 'Legal entity changed; revise the draft and renew approval', 409);
    requireThat(!record.imported && !record.adoption && !record.amends && !record.cancellation && !record.recurring && !record.supplierGroup && !record.buyerConversion && !record.travel && !record.poDetails?.blanket && !record.poDetails?.depositTerms,
        'Additional entities support new ordinary goods only; this purchasing door is not qualified', 409);
    requireThat(record.lines.every((line: Data) => !line.service && !line.allocations?.length && (!line.supplier || line.supplier === record.supplier) && (!line.entity || line.entity === entity.id)), 'Additional entities require unsplit goods from one supplier', 409);
}
export function bindRequestEntity(s: State, input: Data, prior?: Data) {
    const id = input.entity ?? prior?.entity ?? 'main';
    requireThat(!prior || id === entityId(prior), 'A request cannot transfer between legal entities', 409);
    for (const line of input.lines ?? []) {
        requireThat(!line.entity || line.entity === id, 'A line cannot charge a different legal entity', 409);
        requireThat(!line.entityId || line.entityId === id, 'A line cannot charge a different legal entity', 409);
        for (const allocation of line.allocations ?? []) requireThat(!allocation.entity || allocation.entity === id, 'A split cannot charge a different legal entity', 409);
    }
    for (const charge of input.charges ?? []) requireThat(!charge.entity || charge.entity === id, 'A charge cannot use another legal entity', 409);
    const entity = activeEntity(s, id);
    if (!entity) return {};
    requireThat(!prior || !all(s, 'order').some(order => order.request === prior.id), 'Additional-entity amendments and allocated revisions are not qualified', 409);
    requireThat(!input.documentProfile && !input.entitySnapshot && !input.poProfile, 'Entity identity and document profiles are selected by the server');
    return { entity: id, entitySnapshot: entityIdentity(entity) };
}
export function entityCommandGuard(s: State, op: string, input: Data) {
    if (['entity','policy','po-profile','member','access-role','buyer-role-limit'].includes(op)) return;
    const records: Data[] = [];
    for (const kind of ['request','order','invoice','intakeDraft','agentRun','proposedAction']) {
        for (const id of [input.id, input[kind], input.record]) {
            if (typeof id !== 'string') continue;
            const record = s.get(kind + ':' + id)?.value;
            if (record) records.push(record, ...(record.request ? [s.get('request:' + record.request)?.value ?? {}] : []));
        }
    }
    const added = input.entity && input.entity !== 'main' || records.some(record => entityId(record) !== 'main');
    if (!added) return;
    requireThat(['request','amend','submit','decision','convert','issue','attachment'].includes(op), 'This door is not qualified for additional entities', 409);
    requireThat(!input.conversionEdits, 'Additional-entity conversion edits are not qualified', 409);
    if (input.entity && op !== 'request' && op !== 'amend') requireThat(records.every(record => entityId(record) === input.entity), 'Entity substitution is refused', 409);
    for (const record of records) if (entityId(record) !== 'main') {
        activeEntity(s, entityId(record));
        if (record.lines && !['request','amend'].includes(op)) requireEntityPurchase(s, record);
    }
}
