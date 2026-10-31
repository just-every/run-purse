/** Validate the entity graph before restoration writes any domain records.
 * Domain grants remain history; native identities and sessions are not restored. */
export function validateEntities(all, get, check, same) {
    const id = record => record.entity ?? 'main', nonempty = value => typeof value === 'string' && value.trim().length > 0;
    const entities = all('entity'), prefixes = new Set(['PO']);
    for (const entity of entities) {
        check(nonempty(entity.id) && entity.id !== 'main' && Number.isSafeInteger(entity.version) && entity.version > 0 && typeof entity.active === 'boolean', 'entity');
        check(entity.country === 'US' && entity.currency === 'USD' && entity.connection === 'unconfigured', 'entity_boundary');
        check(['legalName','billTo','shipTo'].every(field => nonempty(entity[field])), 'entity_identity');
        check(/^[A-Z][A-Z0-9]{1,11}$/.test(entity.prefix) && !prefixes.has(entity.prefix), 'entity_prefix'); prefixes.add(entity.prefix);
        check(all('audit').some(event => event.action === 'entity' && event.record === entity.id && same(event.after,entity)), 'entity_audit');
    }
    for (const policy of all('policy')) if (id(policy) !== 'main') check(get('entity',id(policy)).currency === policy.currency, 'entity_policy');
    for (const profile of all('poProfile')) if (id(profile) !== 'main') check(Number.isSafeInteger(profile.entityVersion) && profile.entityVersion > 0 && profile.entityVersion <= get('entity',id(profile)).version, 'entity_profile');
    for (const order of all('order')) if (id(order) !== 'main') check(!all('order').some(other=>other.id!==order.id && other.number===order.number), 'entity_number_unique');
    for (const kind of ['request','revision','order']) for (const record of all(kind)) {
        if (id(record) === 'main') { check(!record.entitySnapshot, 'entity_snapshot'); continue; }
        const entity = get('entity',id(record)), snapshot = record.entitySnapshot;
        check(snapshot?.id === entity.id && snapshot.currency === 'USD' && snapshot.country === 'US' && snapshot.prefix === entity.prefix && Number.isSafeInteger(snapshot.version) && snapshot.version > 0 && snapshot.version <= entity.version && ['legalName','billTo','shipTo'].every(field=>nonempty(snapshot[field])), 'entity_snapshot');
        check(all('audit').some(event=>event.action==='entity' && event.record===entity.id && event.after?.version===snapshot.version && same(snapshot,Object.fromEntries(['id','version','legalName','billTo','shipTo','currency','prefix','country'].map(field=>[field,event.after[field]])))), 'entity_snapshot_audit');
        check(record.currency === 'USD' && !record.imported && !record.adoption && !record.amends && !record.cancellation && !record.recurring && !record.supplierGroup && !record.buyerConversion && !record.travel && !record.poDetails?.blanket && !record.poDetails?.depositTerms && !record.poDetails?.deposit, 'entity_purchase_boundary');
        check(record.lines.every(line=>!line.service && !line.allocations?.length && (!line.supplier || line.supplier === record.supplier) && (!line.entity || line.entity === entity.id)), 'entity_lines');
        if (record.policy) check(id(get('policy',record.policy)) === entity.id, 'entity_budget');
        const request = kind === 'request' ? record : get('request',record.request);
        check(id(request) === entity.id, 'entity_transfer');
        if (kind === 'order') {
            const revision = get('revision',record.request + ':' + record.revision), profile = record.documentProfile;
            check(same(snapshot,revision.entitySnapshot), 'entity_order_revision');
            check(Number.isSafeInteger(record.sequence) && record.sequence > 0 && record.number === entity.prefix + '-' + String(record.sequence).padStart(6,'0'), 'entity_order_number');
            check(profile && id(profile) === entity.id && profile.entityVersion === snapshot.version && profile.legalName === snapshot.legalName && profile.billTo.address === snapshot.billTo && profile.shipTo.address === snapshot.shipTo, 'entity_frozen_profile');
        }
    }
    for (const event of all('commitment')) {
        const revision = get('revision',event.request + ':' + event.revision);
        check(id(event) === id(revision) && id(get('policy',event.policy)) === id(revision), 'entity_commitment');
        for (const allocation of event.budgetAllocations ?? []) check(id(get('policy',allocation.policy)) === id(revision), 'entity_allocation');
    }
}
