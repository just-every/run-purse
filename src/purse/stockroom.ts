import { supplier } from './admin';
import { linePosition } from './orders';
import { requests } from './requests';
import { all, audit, can, date, get, put, quantity, qty, requireThat, text, uid, type Actor, type Data, type State } from './types';

function countQuantity(value: unknown) {
    if (typeof value === 'string' && /^0(?:\.0{1,3})?$/.test(value)) return 0;
    return quantity(value);
}

// A submitted request still covers this need. Only a fully received/cancelled
// current PO releases the link; returned/rejected drafts remain for human review.
function outstanding(s: State, id: string | null) {
    if (!id) return false;
    const request = get(s, 'request', id);
    if (request.status !== 'approved') return true;
    const orders = all(s, 'order').filter(o => o.request === id && o.revision === request.revision && o.status === 'issued');
    return !orders.length || orders.some(o => o.lines.some((l: Data) => linePosition(s, o.id, l).outstanding > 0));
}

function preferredItem(s: State, id: string) {
    const item = get(s, 'catalogue', id);
    requireThat(item.approved, 'Stockroom replenishment requires an approved catalogue item', 409);
    requireThat(supplier(s, item.supplier).status === 'preferred', 'Stockroom replenishment requires a preferred supplier', 409);
    return item;
}

export function stockroom(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'stockroom-item' && op !== 'stockroom-count') return;
    can(s, a, 'buyer');
    if (op === 'stockroom-item') {
        const old = b.id ? get(s, 'stockroom', b.id) : undefined;
        const item = preferredItem(s, text(b.catalogue, 'Catalogue item'));
        const business = get(s, 'business', 'main');
        const location = text(b.location, 'Location'), costCentre = text(b.costCentre, 'Cost centre'), project = text(b.project, 'Project');
        requireThat(business.locations.includes(location) && business.costCentres.includes(costCentre) && business.projects.includes(project), 'Use configured location, cost centre and project');
        requireThat(!all(s, 'stockroom').some(x => x.id !== old?.id && x.catalogue === item.id && x.location === location), 'This catalogue item already has a stockroom at this location', 409);
        requireThat(!old || !outstanding(s, old.request) || (old.catalogue === item.id && old.location === location), 'Resolve the outstanding replenishment before changing its item or location', 409);
        const reorderPointQ = quantity(b.reorderPoint), replenishToQ = quantity(b.replenishTo ?? b.reorderPoint);
        requireThat(replenishToQ >= reorderPointQ, 'Replenish-to quantity must meet the reorder point');
        const id = old?.id ?? uid();
        put(s, 'stockroom', id, { ...old, name: text(b.name ?? item.description, 'Stockroom item name'), catalogue: item.id,
            location, costCentre, project, reorderPoint: qty(reorderPointQ), reorderPointQ,
            replenishTo: qty(replenishToQ), replenishToQ, needDate: date(b.needDate), terms: text(b.terms, 'Supplier-supplied terms'),
            count: old?.count ?? null, countQ: old?.countQ ?? null, request: old?.request ?? null });
        audit(s, a, op, id);
        return get(s, 'stockroom', id);
    }

    const stock = get(s, 'stockroom', b.id), countQ = countQuantity(b.count);
    const needDate = b.needDate === undefined ? stock.needDate : date(b.needDate);
    let request = stock.request, requestCreated = false;
    if (countQ < stock.reorderPointQ && !outstanding(s, request)) {
        const item = preferredItem(s, stock.catalogue);
        // The ordinary buyer amendment door also permits a new draft. It keeps
        // the real counting actor as requester; a native owner can submit it.
        const draft = requests(s, a, 'amend', { title: 'Replenish ' + stock.name, supplier: item.supplier,
            currency: item.currency, location: stock.location, costCentre: stock.costCentre, needDate,
            terms: stock.terms, lines: [{ catalogue: item.id, quantity: qty(stock.replenishToQ - countQ), project: stock.project }] })!;
        request = draft.id;
        requestCreated = true;
    }
    put(s, 'stockroom', stock.id, { ...stock, count: qty(countQ), countQ, needDate, request,
        countedAt: new Date().toISOString(), countedBy: a.id });
    audit(s, a, op, stock.id, { previousCount: stock.count, count: qty(countQ), request, requestCreated });
    return { ...get(s, 'stockroom', stock.id), requestCreated };
}
