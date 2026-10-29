import { scopedInvoice } from './invoices';
import { allowed, requirePermission } from './access';
import { liveMatchingRule, matchingRuleFor } from './matching-rules';
import { openInvoiceFlags } from './invoice-status';
import { discrepancies, linePosition } from './orders';
import { paymentTerms, termDates } from './payment-terms';
import { all, audit, extended, get, put, requireThat, type Actor, type Data, type State } from './types';

const within = (delta: number, basis: number, bps: number, cap: number) => delta <= cap && BigInt(delta) * 10000n <= BigInt(basis) * BigInt(bps);
/** A historical approval permits its recorded variance, never a new risk or receipt exception. */
export function matchingDiscrepancyHeld(invoice: Data, row: Data): boolean {
    const proof = invoice.paymentApproval?.kind === 'native-matching' && invoice.paymentApproval.lines?.find((line:Data) => line.line === row.lineId);
    return Boolean(row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception || row.priceMismatch && !proof);
}
export function evaluateInvoiceMatch(s: State, a: Actor, invoiceId: string) {
    let invoice = get(s,'invoice',invoiceId);
    requirePermission(s,a,'payable.approve',invoice);
    if (invoice.paymentApproval) {
        requireThat(!invoice.disputed && !invoice.exception && !invoice.sourceValuesErased && !invoice.erasure && !openInvoiceFlags(invoice).length && !discrepancies(s).filter(row=>row.invoiceId===invoice.id).some(row=>matchingDiscrepancyHeld(invoice,row)), 'Historical invoice approval is held; resolve current risk and matching exceptions',409);
        return invoice;
    }
    const order = get(s,'order',invoice.order), request = get(s,'request',order.request), reasons:string[] = [];
    const reading = all(s,'invoiceReading').find(r => r.id === invoice.confirmedReading && r.status === 'confirmed' && r.invoice === invoice.id);
    if (order.imported || order.adoption || order.supplierGroup || order.recurring || order.recurringSeries || order.poDetails?.blanket || order.lines.some((l:Data)=>l.service || l.allocations?.length || l.supplier && l.supplier !== order.supplier) || request.purchaseType && request.purchaseType !== 'goods') reasons.push('Only ordinary native goods invoices are supported');
    if (order.status !== 'issued' || request.status !== 'approved' || request.revision !== order.revision) reasons.push('Current issued approved purchase revision required');
    if (invoice.sourceConfirmation !== 'confirmed' || !reading || reading.sourceDescriptor.sha256 !== invoice.document?.sha256 || invoice.erasure || invoice.sourceValuesErased) reasons.push('Current source-confirmed private original required');
    const attachment = reading && s.get('attachment:' + reading.sourceDescriptor.attachment)?.value;
    if (!attachment?.base64 || attachment.erasure || attachment.erased) reasons.push('Private original is unavailable');
    if (invoice.depositAppliedMinor || all(s,'deposit').some(d=>d.order===order.id)) reasons.push('Deposit matching requires qualified deposit terms');
    if (!['active','preferred'].includes(get(s,'supplier',order.supplier).status)) reasons.push('Supplier must remain active for automatic approval');
    if (invoice.disputed) reasons.push('Invoice is disputed');
    for (const flag of openInvoiceFlags(invoice)) reasons.push('Unresolved invoice risk: ' + flag.code);
    if (invoice.exception) reasons.push(invoice.exception);
    const term = reading?.terms?.value, priorTerms=s.get('payable:'+invoice.id)?.value;
    if(priorTerms?.approvedAt && (priorTerms.invoiceDate!==invoice.invoiceDate || priorTerms.term!==term)) reasons.push('Approved planning terms differ from the confirmed source');
    if (!paymentTerms.includes(term)) reasons.push('Confirm a supported source payment term');
    if (reading && paymentTerms.includes(term) && reading.dueDate?.value && reading.dueDate.value !== termDates(invoice.invoiceDate,term).dueDate) reasons.push('Source due date conflicts with the payment term');
    const proofs:Data[] = [], rows = discrepancies(s).filter(r=>r.invoiceId===invoice.id);
    for (const [index, allocation] of invoice.allocations.entries()) {
        const line = order.lines.find((l:Data)=>l.id===allocation.line), rule = matchingRuleFor(s,order,line.category), row=rows.find(r=>r.lineId===line.id)!;
        if (!rule) { reasons.push('No matching rule for ' + line.category); continue; }
        if (!liveMatchingRule(s,rule)) reasons.push('Matching rule is paused or owner consent is no longer current');
        const sourceLine = reading?.amounts?.lines[index];
        if (!sourceLine || sourceLine.q !== allocation.q) { reasons.push('Confirmed line mapping is unavailable'); continue; }
        const expected = extended(allocation.q,line.unitMinor), delta = Math.abs(sourceLine.amountMinor - expected);
        if (!within(delta,expected,rule.priceBps,rule.priceMinor)) reasons.push('Price exceeds tolerance for ' + line.description);
        // Quantity tolerance cannot authorize an unapproved balance or invent receipt.
        const excessQ = Math.max(0, allocation.q - line.q), quantityDelta=extended(excessQ,line.unitMinor);
        if (!within(quantityDelta,line.totalMinor,rule.quantityBps,rule.quantityMinor)) reasons.push('Quantity exceeds tolerance for ' + line.description);
        if (row.quantityMismatch) reasons.push('Invoice exceeds approved remaining quantity');
        if (row.receiptShortfall) reasons.push('Receipt shortfall for ' + line.description);
        if (row.closedBalance || linePosition(s,order.id,line).cancelled) reasons.push('Closed or cancelled balance requires review');
        proofs.push({line:line.id,rule:rule.id,ruleVersion:rule.version,ruleSnapshot:structuredClone(rule.history.at(-1)),expectedMinor:expected,billedMinor:sourceLine.amountMinor,q:allocation.q,acceptedQ:linePosition(s,order.id,line).accepted});
    }
    if (reading) {
        const subtotal = order.lines.reduce((n:number,l:Data)=>n+l.totalMinor,0);
        const expected = invoice.allocations.reduce((n:number,l:Data)=>n+extended(l.q,order.lines.find((x:Data)=>x.id===l.line).unitMinor),0);
        const share=(amount:number)=>subtotal?Number(BigInt(amount)*BigInt(expected)/BigInt(subtotal)):0;
        if (reading.amounts.freightMinor !== share(order.freightMinor) || reading.amounts.taxMinor !== share(order.taxMinor) || order.otherChargesMinor) reasons.push('Unplanned or differing charges require separate coding and review');
    }
    const matching = {status:reasons.length?'held':'approved',reasons:[...new Set(reasons)],at:new Date().toISOString()};
    invoice={...invoice,matching};
    if (!reasons.length) {
        const at=matching.at, approval={kind:'native-matching',invoice:invoice.id,order:order.id,revision:order.revision,reading:reading!.id,documentSha256:invoice.document.sha256,amountMinor:invoice.totalMinor,currency:invoice.currency,actor:a.id,at,match:'three-way',lines:proofs};
        invoice.paymentApproval=approval;
        const old=s.get('payable:'+invoice.id)?.value;
        if (!old?.approvedAt) {
            const dates=termDates(invoice.invoiceDate,term), version=(old?.version ?? 0)+1;
            const entry={...dates,version,reason:'Source-confirmed terms under owner-consented matching',actor:a.id,at};
            put(s,'payable',invoice.id,{invoice:invoice.id,...entry,version:version+1,history:[...(old?.history??[]),entry],approvedAt:at,approvedBy:a.id,approvalReason:'Genuine native matching approval',approvedMinor:invoice.totalMinor,matchingApprovalAt:at});
        }
        audit(s,a,'invoice-matched-approved',invoice.id,approval);
    }
    put(s,'invoice',invoice.id,invoice);
    return invoice;
}
export function matchInvoice(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'match-invoice') return;
    requirePermission(s,a,'payable.approve');
    const invoice=get(s,'invoice',b.invoice), order=get(s,'order',invoice.order);
    requirePermission(s,a,'payable.approve',invoice);
    requirePermission(s,a,'invoice.read',invoice);
    const rule=get(s,'matchingRule',b.rule);
    requireThat(b.version===rule.version && liveMatchingRule(s,rule) && invoice.allocations.every((l:Data)=>matchingRuleFor(s,order,order.lines.find((x:Data)=>x.id===l.line).category)?.id===rule.id), 'Matching rule changed or consent is no longer current',409);
    return scopedInvoice(s,a,evaluateInvoiceMatch(s,a,invoice.id));
}
export function matchConfirmedInvoices(s: State, a: Actor) {
    for (const invoice of all(s,'invoice')) if (invoice.confirmedReading && !invoice.paymentApproval && !invoice.supplierSubmission && all(s,'matchingRule').length && allowed(s,a,'payable.approve',invoice)) evaluateInvoiceMatch(s,a,invoice.id);
}
