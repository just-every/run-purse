import { termDates } from './payment-terms';
import { audit, get, put, requireThat, type Actor, type Data, type State } from './types';

export function retainPantryReturn(state: State, a: Actor, sync: Data, returned: Data, generation: number) {
    const invoice=get(state,'invoice',sync.invoice),payable=get(state,'payable',sync.invoice);
    requireThat(returned.externalId===sync.externalId&&returned.vendorId===sync.externalVendorId&&returned.reference===invoice.reference&&returned.totalMinor===invoice.totalMinor,'Returned Pantry bill differs from the retained source identity or amount',409);
    const dates=termDates(returned.invoiceDate,payable.term);
    requireThat(dates.dueDate===returned.dueDate,'Pantry dates differ from the confirmed payment terms; review terms before applying the return',409);
    const at=new Date().toISOString(),url=sync.origin+'/app/sales/bill/'+encodeURIComponent(sync.externalId);
    const next={...sync,status:'synced',returned:{...returned,discountDate:dates.discountDate,discountPercent:dates.discountPercent},url,at};
    put(state,'pantrySync',sync.invoice,next);
    put(state,'invoice',invoice.id,{...invoice,pantry:{origin:sync.origin,url,externalId:sync.externalId,...next.returned,returnedAt:at}});
    audit(state,a,'pantry-sync-result',sync.invoice,{externalId:sync.externalId,origin:sync.origin,outcome:'synced',paymentStatus:returned.paymentStatus,paidMinor:returned.paidMinor,openMinor:returned.openMinor,paymentIds:returned.payments.map((payment:Data)=>payment.id),generation});
    return next;
}
