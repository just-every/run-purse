import { PDFDocument, StandardFonts } from 'pdf-lib';

export const creditEmail = n => ['synthetic-purse-' + n, 'example.test'].join('@');
export async function creditDocument(reference, amount = '300.00') {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText(`Synthetic supplier original ${reference}. USD ${amount}. Returned equipment.`, { font, size: 16 });
    return { name: reference + '.pdf', mediaType: 'application/pdf', base64: Buffer.from(await pdf.save()).toString('base64') };
}
export async function supplierCreditsFixture(h) {
    const cmd = h.command;
    await cmd('business', { name: 'Synthetic equipment purchasing', currencies: ['USD', 'CAD'], locations: ['Denver', 'Austin'], costCentres: ['Operations'], projects: ['Equipment'] });
    const requester = await h.member(creditEmail(6201), ['requester']), buyer = await h.member(creditEmail(6202), ['buyer']), approver = await h.member(creditEmail(6203), ['approver']), ap = await h.member(creditEmail(6204), ['ap-clerk']), receiver = await h.member(creditEmail(6205), ['receiver']);
    const supplier = await cmd('supplier', { name: 'Synthetic equipment supplier', status: 'preferred', reason: 'Approved supplier', contacts: [{ name: 'Synthetic credit contact', email: creditEmail(6206) }] }, buyer);
    for (const currency of ['USD', 'CAD']) await cmd('policy', { name: currency + ' Equipment', currency, category: '*', project: '*', approver: creditEmail(6203), limitMinor: 10000000, budgetMinor: 10000000 });
    let serial = 0;
    const purchase = async (currency = 'USD', vendor = supplier, service = false) => {
        const request = await cmd('request', { title: 'Synthetic equipment purchase ' + ++serial, supplier: vendor.id, currency, needDate: '2099-12-01', location: 'Denver', costCentre: 'Operations', terms: 'Net 30', lines: [{ description: service ? 'Equipment service' : 'Equipment kit', quantity: '10', unitMinor: 10000, category: 'Equipment', project: 'Equipment', ...(service ? { service: { mode: 'amount' } } : {}) }] }, requester);
        await cmd('submit', { id: request.id, revision: 1 }, requester); await cmd('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'Equipment approved' }, approver);
        const order = await cmd('convert', { id: request.id, revision: 1 }, buyer); await cmd('issue', { id: order.id, revision: 1, reason: 'Reviewed issued equipment PO' }, buyer);
        if (!service) await cmd('receipt', { order: order.id, line: order.lines[0].id, event: 'receive', quantity: '10', reason: 'Equipment received' }, receiver);
        return order;
    };
    const order = await purchase(), returned = await cmd('receipt', { order: order.id, line: order.lines[0].id, event: 'return', quantity: '3', reason: 'Three damaged units physically returned' }, receiver);
    const laterOrder = await purchase(), billDocument = await creditDocument('synthetic-purse-6207', '1000.00');
    const bill = async (po, reference, amountMinor = 100000, document) => {
        document ??= await creditDocument(reference, (amountMinor / 100).toFixed(2));
        const invoice = await cmd('invoice', { order: po.id, reference, source: 'Reviewed supplier original', invoiceDate: '2026-10-25', document, allocations: [{ line: po.lines[0].id, quantity: '10', amountMinor }] }, ap);
        return { invoice, document };
    };
    const { invoice } = await bill(laterOrder, 'synthetic-purse-6207', 100000, billDocument);
    const terms = await cmd('payable-terms', { invoice: invoice.id, version: 0, invoiceDate: '2026-10-25', term: 'Net 30', reason: 'Original terms reviewed' }, ap);
    await cmd('approve-payable', { invoice: invoice.id, version: terms.version, reason: 'Received quantity and original checked' }, ap);
    const document = await creditDocument('synthetic-purse-6208');
    const capture = rma => ({ rma: rma.id, reference: 'synthetic-purse-6208', creditDate: '2026-10-24', currency: 'USD', amountMinor: 30000, source: 'Actual supplier credit memo reviewed by AP', document });
    const review = credit => ({ id: credit.id, version: credit.version, sourceHash: credit.document.sha256, consent: true, reason: 'Compared original supplier, return, PO, reference and amount' });
    const application = async (credit, target = invoice, amountMinor = 30000) => ({ credit: credit.id, version: (await h.state(ap)).data.supplierCredit.find(row => row.id === credit.id).version, invoice: target.id, invoiceVersion: (await h.state(ap)).data.invoice.find(row => row.id === target.id).creditVersion, amountMinor, reason: 'Allocate the reviewed returned-goods credit to this later bill' });
    return { h, requester, buyer, approver, ap, receiver, supplier, order, returned, laterOrder, invoice, document, billDocument, purchase, bill, capture, review, application };
}
