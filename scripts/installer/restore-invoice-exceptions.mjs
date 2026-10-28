/** Assignment history is portable evidence, never native member authority. */
export function validateInvoiceExceptions(all, get, check, same) {
    for (const record of all('invoiceException')) {
        const invoice = get('invoice', record.invoice);
        check(record.id === invoice.id && record.order === invoice.order && Number.isFinite(Date.parse(record.openedAt)), 'invoice_exception_source');
        check(Number.isInteger(record.version) && record.version >= 0 && Array.isArray(record.history) && record.history.length === record.version, 'invoice_exception_history');
        for (const [index, event] of record.history.entries()) {
            check(event.version === index + 1 && typeof event.assignee === 'string' && Number.isInteger(event.assigneeVersion)
                && typeof event.actor === 'string' && typeof event.reason === 'string' && event.reason.trim() && Number.isFinite(Date.parse(event.at)), 'invoice_exception_assignment');
            check(all('audit').some(a => a.action === 'assign-invoice-exception' && a.record === invoice.id && a.version === event.version
                && a.assignee === event.assignee && a.reason === event.reason), 'invoice_exception_audit');
        }
        if (record.version) check(Object.keys(record.history.at(-1)).every(key => same(record[key], record.history.at(-1)[key])), 'invoice_exception_snapshot');
    }
    const attempts = new Set();
    for (const original of all('receipt').filter(r => r.event === 'receive' && !r.correctionOf)) {
        const corrections = all('receipt').filter(r => r.correctionOf === original.id);
        let before = original.q;
        for (const correction of corrections.sort((a, b) => a.correctionSequence - b.correctionSequence)) {
            const order = get('order', correction.order), line = order.lines.find(l => l.id === correction.line);
            check(correction.order === original.order && correction.line === original.line && line && !line.service && !original.imported
                && correction.correctionSequence === corrections.indexOf(correction) + 1, 'receipt_correction_source');
            check(correction.correctionBeforeQ === before && Number.isSafeInteger(correction.correctedQ) && correction.correctedQ >= 0
                && correction.correctedQ <= line.q && correction.correctionDelta === correction.correctedQ - before && correction.correctionDelta !== 0
                && correction.q === Math.abs(correction.correctionDelta) && correction.event === (correction.correctionDelta > 0 ? 'receive' : 'return'), 'receipt_correction_quantity');
            check(typeof correction.reason === 'string' && correction.reason.trim() && typeof correction.actor === 'string' && Number.isFinite(Date.parse(correction.at)), 'receipt_correction_reason');
            check(typeof correction.correctionAttempt === 'string' && correction.correctionAttempt.length && !attempts.has(correction.correctionAttempt), 'receipt_correction_capture');
            attempts.add(correction.correctionAttempt);
            check(all('audit').some(a => a.action === 'receipt-correction' && a.receipt === correction.id && a.originalReceipt === original.id
                && a.correctedQ === correction.correctedQ && a.reason === correction.reason), 'receipt_correction_audit');
            before = correction.correctedQ;
        }
    }
    for (const correction of all('receipt').filter(r => r.correctionOf)) {
        const original = get('receipt', correction.correctionOf);
        check(original.event === 'receive' && !original.correctionOf, 'receipt_correction_original');
    }
}
