import { createHash } from 'node:crypto';
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
const termKey = order => createHash('sha256').update(JSON.stringify([order.request,order.revision,order.supplier,order.currency,order.totalMinor,order.poDetails?.deposit])).digest('hex');
export function validateDeposits(all,get,check,same) {
    for(const purchase of [...all('request'),...all('revision'),...all('order')]) {
        const term=purchase.poDetails?.deposit; if(!term)continue;
        check(!purchase.imported && !purchase.adoption && !purchase.supplierGroup && !purchase.poDetails?.blanket && purchase.lines.every(line=>!line.service),'deposit_goods');
        check(['amount','percentage'].includes(term.basis) && money(term.amountMinor) && term.amountMinor>0 && term.amountMinor<=purchase.totalMinor
            && term.supplier===purchase.supplier && term.currency===purchase.currency && term.totalMinor===purchase.totalMinor && term.prepaidAccount===null && term.posting==='unmapped','deposit_term');
        check(term.basis==='amount' ? term.percentageBps===null : Number.isInteger(term.percentageBps) && term.percentageBps>0 && term.percentageBps<=10000 && term.amountMinor===Number((BigInt(purchase.totalMinor)*BigInt(term.percentageBps)+5000n)/10000n),'deposit_percentage');
        check(term.trigger==='issue' && term.dueDate===null || term.trigger==='date' && /^\d{4}-\d{2}-\d{2}$/.test(term.dueDate) && new Date(term.dueDate).toISOString().slice(0,10)===term.dueDate,'deposit_due');
    }
    for(const rule of all('depositRule')) {
        const order=get('order',rule.order); check(rule.id===order.id && rule.termKey===termKey(order) && rule.history?.length===rule.version,'deposit_rule');
        for(const [index,entry] of rule.history.entries()) {
            check(entry.version===index+1 && entry.order===order.id && entry.revision===order.revision && entry.termKey===rule.termKey
                && typeof entry.enabled==='boolean' && typeof entry.actor==='string' && Number.isSafeInteger(entry.operatorVersion) && entry.reason?.trim() && Number.isFinite(Date.parse(entry.at)),'deposit_rule_history');
            check(all('audit').some(event=>event.action==='deposit-rule' && event.record===order.id && event.version===entry.version && event.actor===entry.actor && event.at===entry.at),'deposit_rule_audit');
        }
        const {id,history,erasure,...current}=rule;
        check(same(current,history.at(-1)),'deposit_rule_snapshot');
    }
    for(const invoice of all('invoice').filter(invoice=>invoice.depositKind)) {
        const order=get('order',invoice.order), reading=get('invoiceReading',invoice.confirmedReading);
        check(['deposit','deposit-final'].includes(invoice.depositKind) && same(invoice.depositTerm,order.poDetails.deposit)
            && invoice.depositTermKey===termKey(order) && invoice.sourceConfirmation==='confirmed' && reading.invoice===invoice.id
            && reading.sourceDescriptor.sha256===invoice.document?.sha256,'deposit_invoice_source');
        const approval=invoice.paymentApproval;
        if(approval) {
            const rule=get('depositRule',order.id).history.find(entry=>entry.version===approval.ruleVersion);
            check(rule?.enabled && approval.termKey===rule.termKey && approval.owner===rule.actor && approval.operatorVersion===rule.operatorVersion
                && approval.invoice===invoice.id && approval.order===order.id && approval.revision===order.revision && approval.amountMinor===invoice.totalMinor
                && approval.currency===order.currency && approval.reading===reading.id && approval.documentSha256===invoice.document.sha256
                && approval.match===(invoice.depositKind==='deposit'?'deposit-two-way':'deposit-final-three-way'),'deposit_approval');
            check(all('audit').some(event=>event.action==='deposit-invoice-approved' && event.record===invoice.id && event.ruleVersion===approval.ruleVersion && event.at===approval.at),'deposit_approval_audit');
        }
        if(invoice.depositKind==='deposit') {
            check(invoice.allocations.every(line=>line.q===0 && line.quantity==='0') && !invoice.depositAppliedMinor,'deposit_no_goods');
            if(approval)check(invoice.totalMinor===order.poDetails.deposit.amountMinor
                && all('invoice').filter(other=>other.order===order.id && other.depositKind==='deposit' && other.paymentApproval).length===1,'deposit_approved_cap');
        } else {
            const deposit=get('invoice',invoice.nativeDepositInvoice);
            check(deposit.order===order.id && deposit.currency===invoice.currency && deposit.depositKind==='deposit' && deposit.paymentApproval
                && invoice.depositAppliedMinor===deposit.totalMinor && invoice.grossMinor===order.totalMinor,'deposit_final_gross');
            if(approval)check(get('depositApplication',invoice.id).depositInvoice===deposit.id,'deposit_final_application');
        }
    }
    const used=new Set();
    for(const application of all('depositApplication')) {
        const invoice=get('invoice',application.invoice),deposit=get('invoice',application.depositInvoice);
        check(application.id===invoice.id && invoice.depositKind==='deposit-final' && invoice.paymentApproval
            && deposit.order===application.order && invoice.order===application.order && application.currency===invoice.currency
            && application.amountMinor===invoice.depositAppliedMinor && application.amountMinor===deposit.totalMinor && !used.has(deposit.id),'deposit_application');
        used.add(deposit.id);
        check(all('audit').some(event=>event.action==='deposit-application' && event.invoice===invoice.id && event.depositInvoice===deposit.id && event.amountMinor===application.amountMinor),'deposit_application_audit');
    }
}
