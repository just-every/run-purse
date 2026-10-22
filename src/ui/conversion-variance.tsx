import { amountText, Form, money, type D } from './shared';

function unitMinor(value: string) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative amount with up to two decimal places.');
    const [whole, fraction = ''] = value.split('.'), amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (amount > 1000000000000n) throw new Error('Amount exceeds the supported range.');
    return Number(amount);
}
export function ConversionVariance({ request, limit, suppliers = [], mutate }: { request: D; limit?: D; suppliers?: D[]; mutate: (op: string, input: D) => Promise<any> }) {
    const priceCaps = limit ? [limit.absoluteMinor !== undefined ? money(limit.absoluteMinor, request.currency) : null, limit.percent !== undefined ? limit.percent + '%' : null].filter(Boolean) : [];
    return <details className="disclosure">
        <summary>Adjust price or quantity at conversion</summary>
        <div className="disclosure-body">
            <p>Each change creates a buyer-attributed request revision. Within your limit and budget, the approved decisions carry forward and the purchase order is issued. Larger changes go to the current approval chain before an order can be issued.</p>
            {limit && <p>{limit.unlimited ? 'The current native owner has no buyer variance cap.' : 'Your displayed buyer limit: ' + (priceCaps.length ? priceCaps.join(' and ') + ' price increase' : 'no price increase') + (priceCaps.length > 1 ? ' (both caps apply; the lower governs)' : '') + '; ' + (limit.quantityPercent ?? 0) + '% quantity increase. A single current grant must cover the complete edit.'}</p>}
            <p>Leave fields blank to keep their approved values. A zero price limit refuses increases. A budget overage requires the configured budget owner.</p>
            <Form label="Generate purchase order with conversion edits" onSubmit={async input => {
                const lines = request.lines.flatMap((line: D) => {
                    const price = String(input['price:' + line.id] ?? '').trim(), quantity = String(input['quantity:' + line.id] ?? '').trim();
                    const unit=String(input['unit:'+line.id]??'').trim(),partNumber=String(input['part:'+line.id]??'').trim();
                    return price || quantity || unit || partNumber ? [{ id: line.id,...(unit?{unit}:{}),...(partNumber?{partNumber}:{}), ...(price ? { unitMinor: unitMinor(price) } : {}), ...(quantity ? { quantity } : {}) }] : [];
                });
                const charges = [...(request.charges ?? [])];
                if (!request.charges) for(const [kind,field]of [['freight','freightMinor'],['tax','taxMinor']])if(request[field])charges.push({kind,description:kind==='freight'?'Freight':'Supplied tax',amountMinor:request[field]});
                let chargesChanged=false;
                for(const [kind,field,label]of [['freight','freightMinor','Freight'],['tax','taxMinor','Supplied tax'],['other','otherChargesMinor','Other charge']]) {
                    const value=String(input[field]??'').trim();if(!value)continue;
                    chargesChanged=true;
                    const amountMinor=unitMinor(value), existing=charges.findIndex((charge:D)=>charge.kind===kind);
                    const charge:D={kind,description:kind==='other'?String(input.otherDescription??'').trim()||label:label,amountMinor};
                    if(existing>=0){charge.id=charges[existing].id;charges.splice(existing,1,charge);}else charges.push(charge);
                    for(let index=charges.length-1;index>=0;index--)if(charges[index].kind===kind&&charges[index]!==charge)charges.splice(index,1);
                }
                const supplier=String(input.supplier??'');
                return mutate('convert', { id: request.id, revision: request.revision, issue:true, ...(lines.length || chargesChanged || supplier&&supplier!==request.supplier ? { conversionEdits: { lines, ...(chargesChanged?{charges}:{}), ...(supplier?{supplier}:{}), reason: input.reason } } : {}) });
            }}>
                {request.lines.map((line: D, index: number) => <fieldset className="wide" key={line.id} style={{ minWidth: 0 }}>
                    <legend>Line {index + 1}: {line.description}</legend>
                    <p>Approved quantity {line.quantity} {line.unit}; unit price {money(line.unitMinor, request.currency)}; line total {money(line.totalMinor, request.currency)}.</p>
                    <label className="field">Conversion unit price for line {index + 1}<input name={'price:' + line.id} inputMode="decimal" placeholder={amountText(line.unitMinor)} autoComplete="off"/></label>
                    <label className="field">Conversion quantity for line {index + 1}<input name={'quantity:' + line.id} inputMode="decimal" placeholder={line.quantity} autoComplete="off"/></label>
                    <label className="field">Conversion unit of measure for line {index+1}<input name={'unit:'+line.id} placeholder={line.unit} maxLength={200}/></label>
                    <label className="field">Conversion SKU for line {index+1}<input name={'part:'+line.id} placeholder={line.partNumber} maxLength={200}/></label>
                </fieldset>)}
                <label className="field">Conversion supplier<select name="supplier" defaultValue={request.supplier}><option value={request.supplier}>{request.supplierSnapshot?.name}</option>{suppliers.filter(supplier=>supplier.id!==request.supplier).map(supplier=><option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.status}</option>)}</select></label>
                <label className="field">Conversion freight<input name="freightMinor" inputMode="decimal" placeholder={amountText(request.freightMinor)}/></label>
                <label className="field">Conversion supplied tax<input name="taxMinor" inputMode="decimal" placeholder={amountText(request.taxMinor)}/></label>
                <label className="field">Conversion other charge<input name="otherChargesMinor" inputMode="decimal" placeholder={amountText(request.otherChargesMinor??0)}/></label>
                <label className="field">Other charge description<input name="otherDescription" maxLength={200}/></label>
                <label className="field">Conversion edit reason<input name="reason" maxLength={2000} required/></label>
            </Form>
        </div>
    </details>;
}

function Changes({edit,currency}:{edit:D;currency:string}) {
    return <><p>{edit.email} · approved source revision {edit.sourceRevision} · {edit.reason}</p><p>Approved total {money(edit.before.totalMinor,currency)} → PO total {money(edit.after.totalMinor,currency)}. Price limit {edit.limit.unlimited?'Native owner authority':[edit.limit.absoluteMinor!==undefined?money(edit.limit.absoluteMinor,currency):null,edit.limit.percent!==undefined?edit.limit.percent+'%':null].filter(Boolean).join(' and ')+'; quantity increase '+(edit.limit.quantityPercent??0)+'%'}.</p>{edit.before.lines.map((before:D,index:number)=>{const after=edit.after.lines[index];return <p key={before.id}>{before.description}: quantity {before.quantity} → {after.quantity}; unit {before.unit} → {after.unit}; SKU {before.partNumber||'Not set'} → {after.partNumber||'Not set'}; unit price {money(before.unitMinor,currency)} → {money(after.unitMinor,currency)}.</p>;})}{edit.before.supplier!==edit.after.supplier&&<p>Supplier {edit.before.supplierSnapshot?.name} → {edit.after.supplierSnapshot?.name}.</p>}<p>Freight {money(edit.before.freightMinor,currency)} → {money(edit.after.freightMinor,currency)}; supplied tax {money(edit.before.taxMinor,currency)} → {money(edit.after.taxMinor,currency)}; other charges {money(edit.before.otherChargesMinor??0,currency)} → {money(edit.after.otherChargesMinor??0,currency)}.</p>{edit.after.charges?.map((charge:D)=><p key={charge.id}>{charge.kind}: {charge.description} · {money(charge.amountMinor,currency)}</p>)}</>;
}
export function ConversionHistory({request,orders}:{request:D;orders:D[]}) {
    const own=orders.filter(order=>order.request===request.id&&order.conversionVariance);
    return <>{request.buyerConversion&&request.status==='pending'&&<section aria-label="Buyer conversion awaiting approval"><h3>Buyer conversion awaiting approval</h3><p>{request.buyerConversion.routing==='budget-owner'?'Budget-owner review required.':'The current approval chain must approve this amendment.'} No purchase order has been issued for this revision.</p><Changes edit={request.buyerConversion} currency={request.currency}/></section>}{own.map(order=><section key={order.id} aria-label={'Buyer conversion changes '+order.number}><h3>Buyer conversion changes · {order.number}</h3><Changes edit={order.conversionVariance} currency={order.currency}/></section>)}</>;
}
export function NeedDateEdit({request,mutate}:{request:D;mutate:(op:string,input:D)=>Promise<any>}) {
    return <>{request.mayChangeNeedDate&&request.status==='approved'&&<details className="disclosure"><summary>Correct need date</summary><Form label="Save need date correction" onSubmit={input=>mutate('need-date-edit',{id:request.id,revision:request.revision,...input})}><p>A date correction carries approved decisions forward. Supplier change-order delivery is pending PO-004 sending.</p><label className="field">Need date line<select name="line" defaultValue=""><option value="">All lines</option>{request.lines.map((line:D)=><option key={line.id} value={line.id}>{line.description}</option>)}</select></label><label className="field">Corrected need date<input type="date" name="needDate" required defaultValue={request.needDate}/></label><label className="field">Need date correction reason<input name="reason" required maxLength={2000}/></label></Form></details>}{request.needDateEdit&&<section aria-label="Need date correction"><h3>Need date correction</h3><p>{request.needDateEdit.email} · {request.needDateEdit.reason}</p>{request.needDateEdit.differences.map((difference:D)=><p key={difference.line}>{request.lines.find((line:D)=>line.id===difference.line)?.description}: {difference.before} → {difference.after}</p>)}<p>{request.needDateEdit.carried.length} approval(s) carried forward. {request.needDateEdit.supplierDelivery==='not-sent'?'Supplier change order has not been sent: PO-004 sending is not implemented.':'Supplier delivery follows issuance.'}</p></section>}</>;
}
