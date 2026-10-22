export function adoptionFixture({ base = 100, number = 'PO-000001', deposit = true, missingDate = false } = {}) {
    const key = offset => 'synthetic-purse-' + (base + offset);
    const supplier = key(1), request = key(2), order = key(3), receipt = key(4), invoice = key(5), prepaid = key(6);
    const supplierEmail = 'invoices@' + supplier + '.example.test';
    const documentText = ['Supplier: ' + supplier, 'Invoice number: ' + invoice, 'Invoice date: 2026-10-19', 'Due date: 2026-11-18', 'Payment terms: Net 30', 'PO number: ' + number, 'Currency: USD', 'Sender: ' + supplierEmail, 'Item: ' + key(7), 'Quantity: 2', 'Unit price: 10.00', 'Line amount: 20.00', 'Subtotal: 20.00', 'Freight: 0.00', 'Tax: 0.00', 'Total: 20.00'].join('\n');
    const document = { name: invoice + '.txt', mediaType: 'text/plain', base64: Buffer.from(documentText).toString('base64') };
    const headers = ['kind','sourceId','name','status','supplierId','requestId','orderId','currency','description','quantity','unitPrice','needDate','date','category','project','terms','number','email','location','costCentre','budget','approvalEvidence','amount','appliedAmount','paymentEvidence','documentName','documentMediaType','documentBase64'];
    const common = { name: key(8), supplierId: supplier, currency: 'USD', description: key(7), quantity: '10', unitPrice: '10.00', needDate: '2026-11-30', category: 'Equipment', project: 'Fitout', terms: 'Net 30', location: 'Denver', costCentre: 'Operations', budget: key(9) };
    const rows = [{ kind: 'budget', sourceId:key(9), name:key(9), status:'active', currency:'USD', amount:'1000.00', location:'Denver', costCentre:'Operations', project:'Fitout' }, { kind: 'supplier', sourceId: supplier, name: supplier, status: 'active', email: supplierEmail },
        { ...common, kind: 'request', sourceId: request, status: 'approved', approvalEvidence: key(10) },
        { ...common, kind: 'order', sourceId: order, status: 'issued', requestId: request, number, approvalEvidence: key(10) },
        { kind: 'receipt', sourceId: receipt, name: key(11), status: 'received', orderId: order, quantity: '4', date: '2026-10-18' },
        { kind: 'invoice', sourceId: invoice, name: invoice, status: 'approved', orderId: order, currency: 'USD', quantity: '2', unitPrice: '10.00', date: missingDate ? '' : '2026-10-19', number: invoice, email: supplierEmail, approvalEvidence: key(12), documentName: document.name, documentMediaType: document.mediaType, documentBase64: document.base64 }];
    if (deposit) rows.push({ kind: 'deposit', sourceId: prepaid, name: prepaid, status: 'paid', orderId: order, currency: 'USD', amount: '10.00', appliedAmount: '0.00', number: prepaid, paymentEvidence: key(13) });
    const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    return { csv: headers.join(',') + '\n' + rows.map(row => headers.map(header => cell(row[header])).join(',')).join('\n') + '\n', filename: key(14) + '.csv', mapping: { columns: {}, decimal: '.', date: 'YYYY-MM-DD', statuses: { active:'active', approved:'historical-approved', issued:'historical-issued', received:'historical-received', paid:'historical-paid' } },
        ids: { supplier: 'procurify:supplier:' + supplier, request: 'procurify:request:' + request, order: 'procurify:order:' + order, invoice: 'procurify:invoice:' + invoice, deposit: 'procurify:deposit:' + prepaid, budget:'procurify:budget:' + key(9) }, document, documentText, number, reference: invoice, supplierEmail };
}
export const importInput = fixture => ({ csv: fixture.csv, filename: fixture.filename, mapping: fixture.mapping });
