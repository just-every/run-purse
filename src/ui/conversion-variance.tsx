import { amountText, Form, money, type D } from './shared';

function unitMinor(value: string) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative unit price with up to two decimal places.');
    const [whole, fraction = ''] = value.split('.'), amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (amount > 1000000000000n) throw new Error('Unit price exceeds the supported amount.');
    return Number(amount);
}
/** Keeps the approved request visible; the native converter authorizes every entered edit. */
export function ConversionVariance({ request, limit, mutate }: { request: D; limit?: D; mutate: (op: string, input: D) => Promise<any> }) {
    const priceCaps = limit ? [limit.absoluteMinor !== undefined ? money(limit.absoluteMinor, request.currency) : null, limit.percent !== undefined ? limit.percent + '%' : null].filter(Boolean) : [];
    return <details className="disclosure">
        <summary>Adjust price or quantity at conversion</summary>
        <div className="disclosure-body">
            <p>Leave a field blank to keep its approved value. The PO retains the approved request and decision as its source and records every conversion change. Issue the prepared document separately in Orders.</p>
            {limit && <p>{limit.unlimited ? 'The current native owner has no buyer variance cap.' : 'Your displayed buyer limit: ' + (priceCaps.length ? priceCaps.join(' and ') + ' price increase' : 'no price increase') + (priceCaps.length > 1 ? ' (both caps apply; the lower governs)' : '') + '; ' + (limit.quantityPercent ?? 0) + '% quantity increase. A single current grant must cover the complete edit.'}</p>}
            <p>Decreases are allowed. Increases require your current price and quantity allowances and available budget. An edit outside those allowances is refused; amend the request and obtain renewed approval.</p>
            <Form label="Generate purchase order with conversion edits" onSubmit={async input => {
                const lines = request.lines.flatMap((line: D) => {
                    const price = String(input['price:' + line.id] ?? '').trim(), quantity = String(input['quantity:' + line.id] ?? '').trim();
                    const unit=String(input['unit:'+line.id]??'').trim(),partNumber=String(input['part:'+line.id]??'').trim();
                    return price || quantity || unit || partNumber ? [{ id: line.id,...(unit?{unit}:{}),...(partNumber?{partNumber}:{}), ...(price ? { unitMinor: unitMinor(price) } : {}), ...(quantity ? { quantity } : {}) }] : [];
                });
                const costs=Object.fromEntries(['freightMinor','taxMinor'].filter(field=>String(input[field]??'').trim()).map(field=>[field,unitMinor(String(input[field]).trim())]));
                return mutate('convert', { id: request.id, revision: request.revision, ...(lines.length || Object.keys(costs).length ? { conversionEdits: { lines, ...costs, reason: input.reason } } : {}) });
            }}>
                {request.lines.map((line: D, index: number) => <fieldset className="wide" key={line.id} style={{ minWidth: 0 }}>
                    <legend>Line {index + 1}: {line.description}</legend>
                    <p>Approved quantity {line.quantity} {line.unit}; unit price {money(line.unitMinor, request.currency)}; line total {money(line.totalMinor, request.currency)}.</p>
                    <label className="field">Conversion unit price for line {index + 1}<input name={'price:' + line.id} inputMode="decimal" placeholder={amountText(line.unitMinor)} autoComplete="off"/></label>
                    <label className="field">Conversion quantity for line {index + 1}<input name={'quantity:' + line.id} inputMode="decimal" placeholder={line.quantity} autoComplete="off"/></label>
                    <label className="field">Conversion unit of measure for line {index+1}<input name={'unit:'+line.id} placeholder={line.unit} maxLength={200}/></label>
                    <label className="field">Conversion SKU for line {index+1}<input name={'part:'+line.id} placeholder={line.partNumber} maxLength={200}/></label>
                </fieldset>)}
                <label className="field">Conversion freight<input name="freightMinor" inputMode="decimal" placeholder={amountText(request.freightMinor)}/></label>
                <label className="field">Conversion supplied tax<input name="taxMinor" inputMode="decimal" placeholder={amountText(request.taxMinor)}/></label>
                <label className="field">Conversion edit reason<input name="reason" maxLength={2000} required/></label>
            </Form>
        </div>
    </details>;
}

export function ConversionHistory({request,orders}:{request:D;orders:D[]}) {
 return <>{orders.filter(order=>order.request===request.id&&order.conversionVariance).map(order=>{
  const edit=order.conversionVariance;
  return <section key={order.id} aria-label={'Buyer conversion changes '+order.number}><h3>Buyer conversion changes · {order.number}</h3><p>{edit.email} · approved source revision {edit.sourceRevision} · {edit.reason}</p><p>Approved total {money(edit.before.totalMinor,order.currency)} → PO total {money(edit.after.totalMinor,order.currency)}. Price limit {edit.limit.unlimited?'Native owner authority':[edit.limit.absoluteMinor!==undefined?money(edit.limit.absoluteMinor,order.currency):null,edit.limit.percent!==undefined?edit.limit.percent+'%':null].filter(Boolean).join(' and ')+'; quantity increase '+(edit.limit.quantityPercent??0)+'%'}.</p>{edit.before.lines.map((before:D,index:number)=>{const after=edit.after.lines[index];return <p key={before.id}>{before.description}: quantity {before.quantity} → {after.quantity}; unit {before.unit} → {after.unit}; SKU {before.partNumber||'Not set'} → {after.partNumber||'Not set'}; unit price {money(before.unitMinor,order.currency)} → {money(after.unitMinor,order.currency)}.</p>;})}<p>Freight {money(edit.before.freightMinor,order.currency)} → {money(edit.after.freightMinor,order.currency)}; supplied tax {money(edit.before.taxMinor,order.currency)} → {money(edit.after.taxMinor,order.currency)}.</p></section>;
 })}</>;
}
