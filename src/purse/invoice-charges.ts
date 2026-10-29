import { invoiceChargeTypes } from './invoice-charge-types';
import { extended, type Data } from './types';

/** Only the source-confirmation door supplies this breakdown, never capture input. */
export function sourceInvoiceCharges(order: Data, mapped: Data[], amounts: Data) {
    const base = order.lines.reduce((n:number,line:Data)=>n+line.totalMinor,0);
    const expected = mapped.reduce((n:number,line:Data)=>n+extended(line.q,order.lines.find((item:Data)=>item.id===line.line).unitMinor),0);
    const share = (value:number) => base ? Number(BigInt(value)*BigInt(expected)/BigInt(base)) : 0;
    const plannedFreightMinor=share(order.freightMinor), plannedTaxMinor=share(order.taxMinor);
    const charges=invoiceChargeTypes.map(({type})=>({type,amountMinor:type==='freight'?amounts.freightMinor:amounts.otherCharges?.find((charge:Data)=>charge.type===type)?.amountMinor??0}))
        .filter(charge=>charge.amountMinor>0 && (charge.type!=='freight'||plannedFreightMinor===0));
    return {plannedFreightMinor,plannedTaxMinor,charges,unplannedMinor:charges.reduce((n,charge)=>n+charge.amountMinor,0)};
}

/** Original allocations stay inclusive; separate coded charge rows conserve the gross. */
export function codedInvoiceCharges(invoice: Data) {
    return invoice.paymentApproval?.kind==='native-matching' ? invoice.paymentApproval.charges ?? [] : [];
}
export function invoiceLineChargeShare(invoice: Data, index:number): number {
    const amount=codedInvoiceCharges(invoice).reduce((n:number,charge:Data)=>n+charge.amountMinor,0);
    if(!amount)return 0;
    const weights=invoice.allocations.map((line:Data)=>line.amountMinor),base=weights.reduce((n:number,value:number)=>n+value,0);
    const parts=weights.map((value:number)=>Number(BigInt(amount)*BigInt(value)/BigInt(base)));
    parts[0]+=amount-parts.reduce((n:number,value:number)=>n+value,0);
    return parts[index];
}
