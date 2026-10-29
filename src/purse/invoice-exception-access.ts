import { operationalOrder } from './adoption-position';
import { allowed } from './access';
import { all, get, type Actor, type Data, type State } from './types';

export function exceptionOrder(s: State, record: Data) {
    const source = get(s, 'order', record.order);
    return all(s, 'order').filter(o => o.request === source.request && o.revision >= source.revision && operationalOrder(s, o))
        .reduce((latest, o) => o.revision > latest.revision ? o : latest, source);
}
/** Historical invoice scope never lends access to a newer receiving context. */
export function mayReadInvoiceException(s: State, a: Actor, record: Data) {
    const invoice = s.get('invoice:' + record.invoice)?.value;
    return Boolean(invoice && allowed(s, a, 'invoice.read', invoice) && allowed(s, a, 'po.read', exceptionOrder(s, record)));
}
