import { currentPrice } from './catalogue';
import { requireCatalogueAccess } from './catalogue-access';
import { requests } from './requests';
import { audit, can, get, requireThat, type Actor, type Data, type State } from './types';

// A request has one supplier/currency. A mixed bundle creates one ordinary
// draft per supplier/currency, atomically in the command's existing transaction.
export function catalogueRequests(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'request-bundle') return;
    can(s, a, 'requester');
    const bundle = get(s, 'catalogueBundle', b.bundle);
    requireCatalogueAccess(s, a, bundle);
    requireThat(bundle.approved, 'Catalogue bundle is not approved', 409);
    const groups = new Map<string, Data>();
    for (const component of bundle.items) {
        const item = get(s, 'catalogue', component.catalogue);
        requireCatalogueAccess(s, a, item);
        requireThat(item.approved && currentPrice(item), 'Bundle item is unapproved or outside price validity: ' + item.description, 409);
        const key = JSON.stringify([item.supplier, item.currency]);
        const group = groups.get(key) ?? { supplier: item.supplier, currency: item.currency, lines: [] };
        group.lines.push({ catalogue: item.id, quantity: component.quantity });
        groups.set(key, group);
    }
    const drafts = [...groups.values()].map(group => requests(s, a, 'request', {
        ...b, id: undefined, revision: undefined, title: b.title || bundle.name,
        supplier: group.supplier, currency: group.currency,
        location: b.location || get(s, 'catalogue', group.lines[0].catalogue).location,
        costCentre: b.costCentre || get(s, 'catalogue', group.lines[0].catalogue).costCentre,
        lines: group.lines.map((line: Data) => ({ ...line, project: b.project || undefined })),
    })!);
    for (const draft of drafts) audit(s, a, op, draft.id, { bundle: bundle.id });
    return { bundle: bundle.id, requests: drafts };
}
