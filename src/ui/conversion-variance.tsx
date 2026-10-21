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
                    return price || quantity ? [{ id: line.id, ...(price ? { unitMinor: unitMinor(price) } : {}), ...(quantity ? { quantity } : {}) }] : [];
                });
                return mutate('convert', { id: request.id, revision: request.revision, ...(lines.length ? { conversionEdits: { lines, reason: input.reason } } : {}) });
            }}>
                {request.lines.map((line: D, index: number) => <fieldset className="wide" key={line.id} style={{ minWidth: 0 }}>
                    <legend>Line {index + 1}: {line.description}</legend>
                    <p>Approved quantity {line.quantity} {line.unit}; unit price {money(line.unitMinor, request.currency)}; line total {money(line.totalMinor, request.currency)}.</p>
                    <label className="field">Conversion unit price for line {index + 1}<input name={'price:' + line.id} inputMode="decimal" placeholder={amountText(line.unitMinor)} autoComplete="off"/></label>
                    <label className="field">Conversion quantity for line {index + 1}<input name={'quantity:' + line.id} inputMode="decimal" placeholder={line.quantity} autoComplete="off"/></label>
                </fieldset>)}
                <label className="field">Conversion edit reason<input name="reason" maxLength={2000} required/></label>
            </Form>
        </div>
    </details>;
}
