import { minor, requireThat, text, uid, type Data } from './types';

/** Charge entries are separate from item quantities. Header sums are retained for
 * existing document and invoice readers and never added a second time. */
export function normalizePurchaseCharges(input: Data, previous: Data = {}) {
    const hasEntries = Object.hasOwn(input, 'charges');
    let charges: Data[] = [];
    if (hasEntries) {
        requireThat(Array.isArray(input.charges) && input.charges.length <= 30, 'Provide at most 30 charge lines');
        charges = input.charges.map((charge: Data) => {
            requireThat(charge && typeof charge === 'object' && !Array.isArray(charge) && Object.keys(charge).every(key => ['id','kind','description','amountMinor'].includes(key)), 'Invalid charge line');
            requireThat(['freight','tax','other'].includes(charge.kind), 'Choose freight, tax or other charge');
            if (charge.id !== undefined) requireThat(typeof charge.id === 'string' && (previous.charges ?? []).some((old: Data) => old.id === charge.id), 'Charge ID is outside this purchase');
            return { id: charge.id ?? uid(), kind: charge.kind, description: text(charge.description, 'Charge description', 200), amountMinor: minor(charge.amountMinor, 'Charge amount') };
        });
        requireThat(new Set(charges.map(charge => charge.id)).size === charges.length, 'Charge IDs must be unique');
    } else {
        charges = structuredClone(previous.charges ?? []);
        for (const [kind, field] of [['freight','freightMinor'],['tax','taxMinor']]) {
            if (Object.hasOwn(input, field) || !previous.charges && (previous[field] ?? 0) > 0) {
                const amountMinor = minor(input[field] ?? previous[field], field);
                const old = charges.find(charge => charge.kind === kind);
                charges = charges.filter(charge => charge.kind !== kind);
                if (amountMinor) charges.push({ id: old?.id ?? uid(), kind, description: kind === 'freight' ? 'Freight' : 'Supplied tax', amountMinor });
            }
        }
    }
    const sum = (kind: string) => minor(charges.filter(charge => charge.kind === kind).reduce((total, charge) => total + charge.amountMinor, 0), kind + ' charges');
    if(hasEntries)for(const [kind,field]of [['freight','freightMinor'],['tax','taxMinor'],['other','otherChargesMinor']])if(Object.hasOwn(input,field))requireThat(minor(input[field],field)===sum(kind),'Charge lines must reconcile to '+field);
    return { charges, freightMinor: sum('freight'), taxMinor: sum('tax'), otherChargesMinor: sum('other') };
}
