import { extended, requireThat, type Data } from './types';

export const invoiceChargeTypes = ['freight', 'fuel', 'handling', 'small-order', 'other'] as const;

/** Classification is an explicit AP review of the retained original, never a parsed instruction. */
export function confirmedChargeMapping(order: Data, amounts: Data, mappings: Data[]) {
    const used = new Set<string>(), charges: Data[] = [];
    const goods = amounts.lines.flatMap((line: Data) => {
        const map = mappings.find(item => item.id === line.id);
        if (map?.chargeType !== undefined) {
            requireThat(!map.orderLine && invoiceChargeTypes.includes(map.chargeType) && line.q === 1000, 'A separately reviewed charge needs a supported type and quantity one');
            charges.push({sourceLine:line.id,type:map.chargeType,amountMinor:line.amountMinor});
            return [];
        }
        requireThat(map && order.lines.some((item: Data) => item.id === map.orderLine) && !used.has(map.orderLine), 'Map each invoice item to a unique line of this PO');
        used.add(map.orderLine);
        return [{...line,line:map.orderLine}];
    });
    requireThat(goods.length, 'Map at least one purchased goods line');
    const subtotal = order.lines.reduce((sum: number, line: Data) => sum + line.totalMinor, 0);
    const expected = goods.reduce((sum: number, line: Data) => sum + extended(line.q,order.lines.find((item: Data) => item.id === line.line).unitMinor),0);
    const plannedFreight = subtotal ? Number(BigInt(order.freightMinor)*BigInt(expected)/BigInt(subtotal)) : 0;
    if (amounts.freightMinor > plannedFreight) charges.push({sourceLine:'freightAmount',type:'freight',amountMinor:amounts.freightMinor-plannedFreight});
    return {goods,charges};
}

/** Every applicable owner rule must authorize the aggregate fee and agree on its explicit coding. */
export function matchInvoiceCharges(charges: Data[], rules: Data[], totalMinor: number) {
    const reasons: string[] = [], total = charges.reduce((sum,charge) => sum+charge.amountMinor,0);
    const evidence = charges.map(charge => {
        const codes = rules.map(rule => rule.chargeCodes?.[charge.type]);
        if (!codes.length || codes.some(code => !code) || new Set(codes).size !== 1) reasons.push('Unplanned charge requires consistent configured GL coding: ' + charge.type);
        return {...charge,glAccount:codes[0]};
    });
    if (charges.length && (!rules.length || rules.some(rule => total > (rule.chargeMinor ?? 0) || BigInt(total)*10000n > BigInt(totalMinor)*BigInt(rule.chargeBps ?? 0)))) reasons.push('Unplanned charges exceed tolerance');
    return {reasons,evidence};
}
