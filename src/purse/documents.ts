import { blanketPosition } from './blanket-orders';
import { visibleAgentValue, projectValueRecord } from './agent-value';
import { visibleAgreementReadings } from './agreement-reading';
import { visibleAgreements } from './agreements';
import { visibleEmailIntakes } from './email-intake';
import { visibleRfqs } from './rfq';
import { visibleInvoiceReadings } from './invoice-reading';
import { visibleInvoiceInbox } from './invoice-inbox';
import { visibleQuoteReadings } from './quote-reading';
import { mayReceive, receiptAssignment, receiptMatch, receiptVersion } from './receipt-routing';
import { poContent, poHtml } from './po-content';
import { cashRequirements } from './cash-requirements';
import { all, can, get, own, requireThat, qty, roles, type Actor, type Data, type State } from './types';
import { discrepancies, linePosition } from './orders';
import { supplierFamilies } from './supplier-merge';
import { supplierPublicValue } from './supplier-identity';
import { catalogueAllows } from './catalogue-access';
import { currentPrice } from './catalogue';
import { supplierScorecards } from './supplier-performance';
import { supplierDocumentStatus } from './supplier-documents';
export function visible(s: State, a: Actor, protectedViews?: Map<string, Data>) { const capabilities = roles(s, a); requireThat(capabilities.length, 'No active business membership', 403); const staff = capabilities.some(r => ['owner', 'approver', 'buyer', 'receiver'].includes(r)); const requests = all(s, 'request').filter(r => staff || r.requester === a.id || r.requesterEmail === a.email), ids = new Set(requests.map(r => r.id)); const orders = all(s, 'order').filter(o => ids.has(o.request)), orderIds = new Set(orders.map(o => o.id)); const data: Data = {}; for (const kind of ['business', 'supplier', 'catalogue', 'catalogueBundle', 'policy', 'delegation', 'code'])
    data[kind] = all(s, kind);
    Object.assign(data,visibleAgentValue(s,a,ids));
    Object.assign(data,visibleEmailIntakes(s,a),visibleRfqs(s,a),visibleQuoteReadings(s,ids),visibleInvoiceReadings(s,capabilities.includes('buyer')),visibleInvoiceInbox(s,capabilities.includes('buyer')));
    data.supplier = data.supplier.map((v: Data) => ({ ...supplierPublicValue(v,protectedViews?.get(v.id)), documents: (v.documents ?? []).filter((id: string) => capabilities.includes('buyer') || !s.get('attachment:' + id)?.value.privateSupplierDocument) }));
    Object.assign(data, capabilities.includes('buyer') ? {...visibleAgreements(s,a),...visibleAgreementReadings(s,a)} : {agreement:[], agreementInvoice:[], agreementReminder:[], agreementAward:[], agreementReading:[], agreementReadingEvent:[]});
    data.quoteAward = all(s, 'quoteAward').filter(q => ids.has(q.request));
    data.receiptRule = capabilities.includes('buyer') ? all(s,'receiptRule') : all(s,'receiptRule').filter(r=>r.order&&orderIds.has(r.order));
    data.receivers = capabilities.some(r=>['buyer','receiver'].includes(r)) ? all(s,'member').filter(m=>m.active&&m.roles.includes('receiver')).map(m=>({id:m.email,email:m.email,name:m.name})) : [];
    data.receiptPromptEvent = all(s,'receiptPromptEvent').filter(e=>orderIds.has(e.order));
    data.poProfile = a.owner ? all(s, 'poProfile') : [];
    data.payable = capabilities.includes('buyer') ? all(s, 'payable') : [];
    data.cashExpectation = capabilities.includes('buyer') ? all(s, 'cashExpectation') : [];
    data.cashRequirements = capabilities.includes('buyer') ? cashRequirements(s, a) : null;
    data.orderChasePolicy = capabilities.includes('buyer') ? all(s, 'orderChasePolicy').filter(p => orderIds.has(p.order)) : [];
    data.orderChaseEvent = all(s, 'orderChaseEvent').filter(e => orderIds.has(e.order));
    data.orderChaseEvidence = all(s, 'supplierOrderEvidence').filter(e => orderIds.has(e.order));
    data.supplierDocument = capabilities.includes('buyer') ? all(s, 'supplierDocument').map(d => ({ ...d, compliance: supplierDocumentStatus(s, d) })) : [];
    data.supplierDocumentReminder = capabilities.includes('buyer') ? all(s, 'supplierDocumentReminder') : [];
    data.supplierDocumentSubmission = capabilities.includes('buyer') ? all(s, 'supplierDocumentSubmission') : [];
    data.supplierFamilies = capabilities.includes('buyer') ? supplierFamilies(s) : [];
    const maintainCatalogue = capabilities.includes('buyer');
    const requestable = (item: Data) => item.approved && currentPrice(item) && catalogueAllows(s, a, item);
    data.catalogue = data.catalogue.filter((item: Data) => maintainCatalogue || requestable(item)).map((item: Data) => ({ ...item, requestable: requestable(item) }));
    data.catalogueBundle = data.catalogueBundle.filter((bundle: Data) => maintainCatalogue || (bundle.approved && catalogueAllows(s, a, bundle) && bundle.items.every((i: Data) => requestable(get(s, 'catalogue', i.catalogue))))).map((bundle: Data) => ({ ...bundle, requestable: bundle.approved && catalogueAllows(s, a, bundle) && bundle.items.every((i: Data) => requestable(get(s, 'catalogue', i.catalogue))) }));
    data.catalogueGrant = a.owner ? all(s, 'catalogueGrant') : [];
    data.supplierScorecards = capabilities.includes('buyer') ? supplierScorecards(s, a) : []; data.supplierOrderEvidence = capabilities.includes('buyer') ? all(s, 'supplierOrderEvidence') : []; data.supplierIssue = capabilities.includes('buyer') ? all(s, 'supplierIssue') : []; data.stockroom = capabilities.includes('buyer') ? all(s, 'stockroom') : []; data.request = requests; data.order = orders.map(o => ({ ...o, ...(o.poDetails?.blanket ? {blanketPosition: blanketPosition(s,o)} : {}), receiverAssignment: receiptAssignment(s,o), mayReceive: mayReceive(s,a,o), receiptVersion: receiptVersion(s,o), positions: o.lines.map((l: Data) => ({ line: l.id, ...linePosition(s, o.id, l) })) })); for (const kind of ['revision', 'decision', 'quote', 'commitment'])
    data[kind] = all(s, kind).filter(r => ids.has(r.request ?? (kind === 'revision' ? r.id : null)) && (kind!=='quote'||!r.rfq||capabilities.includes('buyer'))); data.receipt = all(s, 'receipt').filter(r => orderIds.has(r.order)); data.orderClosure = all(s, 'orderClosure').filter(r => orderIds.has(r.order)); data.invoice = all(s, 'invoice').filter(r => orderIds.has(r.order)); const invoiceIds = new Set(data.invoice.map((r: Data) => r.id)); data.invoice = data.invoice.map(({ evidenceHash, ...invoice }: Data) => ({ ...invoice, ...(!capabilities.includes('buyer') ? { document: undefined, documentHashes: undefined, remitPostal: undefined } : {}), receiptMatch: receiptMatch(s,invoice), flags: invoice.flags?.map((flag: Data) => invoiceIds.has(flag.relatedInvoice) || !flag.relatedInvoice ? flag : { ...flag, relatedInvoice: undefined }) })); data.attachment = all(s, 'attachment').filter(r => !['invoice','invoiceSource'].includes(r.kind) || capabilities.includes('buyer')).filter(r => !r.privateSupplierDocument || capabilities.includes('buyer')).filter(r => r.kind === 'agreement' && capabilities.includes('buyer') || r.kind === 'supplier' || r.kind === 'invoiceSource' && capabilities.includes('buyer') || ids.has(r.record) || orderIds.has(r.record) || invoiceIds.has(r.record)).map(({ base64, ...r }) => r); data.agentRun = all(s, 'agentRun').filter(r => a.owner || r.actor === a.id).map(r=>r.workflow==='value-realization'?projectValueRecord(s,a,r):r); data.proposedAction = all(s, 'proposedAction').filter(r => a.owner || r.actor === a.id); data.audit = all(s, 'audit').filter(r => a.owner || r.actor === a.id || ids.has(r.record) || orderIds.has(r.record)); data.member = a.owner ? all(s, 'member') : []; data.people = all(s, 'member').filter(m => m.active && (staff || m.email.toLowerCase() === a.email.toLowerCase())).map(m => ({ email: m.email, name: m.name, roles: m.roles })); data.discrepancies = discrepancies(s).filter(d => orders.some(o => o.id === d.orderId)); data.totals = data.commitment.reduce((m: Data, e: Data) => ({ ...m, [e.currency]: (m[e.currency] ?? 0) + e.amountMinor }), {}); return { actor: { id: a.id, email: a.email, roles: capabilities, dev: a.dev }, data }; }
export function recordScope(s: State, a: Actor, kind: string, r: Data) { requireThat(roles(s, a).length, 'No active membership', 403); if(kind==='attachment'){if(r.privateSupplierDocument||['invoice','invoiceSource'].includes(r.kind))can(s,a,'buyer');recordScope(s,a,r.kind,get(s,r.kind,r.record));return;} if(kind==='invoiceSource'){can(s,a,'buyer');recordScope(s,a,'order',get(s,'order',r.order));return;} if(kind==='agreement')can(s,a,'buyer'); if (kind === 'request')
    own(s, a, r); if (kind === 'order')
    own(s, a, get(s, 'request', r.request)); if (kind === 'invoice')
    recordScope(s, a, 'order', get(s, 'order', r.order)); if(kind==='agentRun'&&r.workflow==='value-realization'){own(s,a,get(s,'request',r.request));return;} if (kind === 'agentRun')
    requireThat(a.owner || r.actor === a.id, 'Draft outside scope', 403); }
export function download(s: State, a: Actor, kind: string, id: string) { const r = get(s, kind, id); if (kind === 'attachment') {
    recordScope(s, a, 'attachment', r);
    return new Response(Uint8Array.from(atob(r.base64), c => c.charCodeAt(0)), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${r.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"` } });
} recordScope(s, a, kind, r); if(kind==='agentRun'&&r.workflow==='value-realization')return new Response(JSON.stringify(projectValueRecord(s,a,r),null,2),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="value-report.json"'}}); if (kind === 'agentRun')
    return new Response(r.draft + '\n\nMissing: ' + r.missing.join(', ') + '\nSources: ' + JSON.stringify(r.references), { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="preparation.txt"' } }); requireThat(kind === 'order', 'Unsupported document', 404); const business = get(s, 'business', 'main'), supplier = r.imported ? get(s, 'supplier', r.supplier) : r.supplierSnapshot; requireThat(supplier?.id === r.supplier, 'Approved supplier identity is missing; renew purchasing authority', 409); const body = poHtml(poContent(s, r)); return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `attachment; filename="${r.number.replace(/[^a-zA-Z0-9._-]/g,'_')}.html"`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } }); }
export function accounting(s: State, a: Actor) { can(s, a, 'buyer'); const cell = (v: unknown) => '"' + String(v).replace(/"/g, '""').replace(/^[=+@-]/, "' $&") + '"'; const byAllocation = new Map(discrepancies(s).map(d => [JSON.stringify([d.invoiceId, d.lineId]), d])); const rows = [['invoice', 'po', 'line', 'currency', 'quantity', 'amount_minor', 'price_mismatch', 'quantity_mismatch', 'receipt_shortfall'], ...all(s, 'invoice').flatMap(i => i.allocations.map((l: Data) => { const o = get(s, 'order', i.order), d = byAllocation.get(JSON.stringify([i.id, l.line]))!; return [i.reference, o.number, l.line, i.currency, l.quantity, l.amountMinor, d.priceMismatch, d.quantityMismatch, d.receiptShortfall]; }))]; return new Response(rows.map(row => row.map(cell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="purse-accounting.csv"' } }); }
