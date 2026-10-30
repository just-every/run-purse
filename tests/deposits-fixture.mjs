import { PDFDocument, StandardFonts } from 'pdf-lib';
export const depositEmail = n => ['synthetic-purse-' + n, 'example.test'].join('@');
export async function depositDocument(order, reference, amountMinor, kind = 'deposit', extra = '') {
    const total = (amountMinor / 100).toFixed(2), quantity = kind === 'deposit' ? '1' : '10', unit = (amountMinor / (kind === 'deposit' ? 100 : 1000)).toFixed(2);
    const rows = ['Supplier: Synthetic machinery supplier', 'Invoice number: ' + reference, 'Invoice date: 2026-10-20', 'Payment terms: Net 30',
        'PO number: ' + order.number, 'Currency: ' + order.currency, 'Item: Machinery', 'Quantity: ' + quantity, 'Unit price: ' + unit,
        'Line amount: ' + total, 'Subtotal: ' + total, 'Freight: 0.00', 'Tax: 0.00', 'Total: ' + total, extra].filter(Boolean);
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), page = pdf.addPage([650, 790]);
    rows.forEach((line, index) => page.drawText(line, { x: 25, y: 750 - index * 24, size: 12, font }));
    return { name: reference + '.pdf', mediaType: 'application/pdf', base64: Buffer.from(await pdf.save()).toString('base64') };
}
export async function depositsFixture(h) {
    const cmd = h.command;
    await cmd('business', { name: 'Synthetic machinery purchasing', currencies: ['USD', 'CAD'], locations: ['Denver', 'Austin'], costCentres: ['Operations'], projects: ['Equipment'] });
    const requester = await h.member(depositEmail(7201), ['requester']), approver = await h.member(depositEmail(7202), ['approver']),
        ap = await h.member(depositEmail(7203), ['ap-clerk']), buyer = await h.member(depositEmail(7204), ['buyer']), receiver = await h.member(depositEmail(7205), ['receiver']);
    const supplier = await cmd('supplier', { name: 'Synthetic machinery supplier', status: 'preferred', reason: 'Reviewed machinery supply', contacts: [{ name: 'Synthetic contact', email: depositEmail(7206) }] }, buyer);
    for (const currency of ['USD', 'CAD']) await cmd('policy', { name: currency + ' machinery budget', currency, category: '*', project: '*', approver: depositEmail(7202), limitMinor: 100000000, budgetMinor: 100000000, budgetPeriod: { from: '2099-01-01', through: '2099-12-31' } });
    let sequence = 0;
    const input = (term = { basis: 'percentage', percentage: '50', trigger: 'issue' }, currency = 'USD') => ({ title: 'Machinery ' + ++sequence, supplier: supplier.id, currency, location: 'Denver', costCentre: 'Operations', needDate: '2099-06-01', terms: 'Net 30',
        poDetails: { deposit: term }, lines: [{ description: 'Machinery', quantity: '10', unitMinor: 200000, category: 'Equipment', project: 'Equipment' }] });
    const purchase = async (term, currency) => {
        const request = await cmd('request', input(term, currency), requester);
        await cmd('submit', { id: request.id, revision: 1 }, requester);
        await cmd('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'Independent purchase approval' }, approver);
        const prepared = await cmd('convert', { id: request.id, revision: 1 }, buyer);
        const order = await cmd('issue', { id: prepared.id, revision: 1, reason: 'Reviewed exact approved PO' }, buyer);
        return { request, order };
    };
    const ruleInput = async (order, enabled = true) => {
        const current = (await h.state()).data.order.find(row => row.id === order.id);
        return { order: order.id, revision: order.revision, version: current.nativeDepositPosition.ruleVersion, termKey: current.nativeDepositPosition.termKey, enabled, consent: true, reason: 'Owner authorizes exact-term two-way deposit and final-bill approval' };
    };
    const stage = async (order, reference, amount = 1000000, kind = 'deposit', document) => {
        document ??= await depositDocument(order, reference, amount, kind);
        const source = await cmd('invoice-source', { order: order.id, document }, ap), reading = await cmd('invoice-extract', { source: source.id }, ap);
        return { source, reading, document, confirm: { id: reading.id, version: reading.version, reviewed: true, reason: 'AP compared the complete private original with this exact term', invoiceKind: kind, lines: reading.lines.map(line => ({ id: line.id, orderLine: order.lines[0].id })) } };
    };
    const confirm = async staged => {
        const reading = await cmd('invoice-reading-confirm', staged.confirm, ap);
        return (await h.state()).data.invoice.find(row => row.id === reading.invoice);
    };
    const receive = order => cmd('receipt', { order: order.id, line: order.lines[0].id, event: 'receive', quantity: '10', reason: 'Full machinery physically received' }, receiver);
    return { h, cmd, requester, approver, ap, buyer, receiver, supplier, input, purchase, ruleInput, stage, confirm, receive };
}
