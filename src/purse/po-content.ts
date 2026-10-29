import { depositTermText } from './deposit-terms';
import { orderAdoption } from './adoption-position';
import { all, get, requireThat, type Data, type State } from './types';
import { poLabels } from './po-profiles';
import type { PoPdfContent } from './po-pdf';
const unknown = 'Not recorded';
const value = (v: unknown) => v === null || v === undefined || v === '' ? unknown : typeof v === 'object' ? JSON.stringify(v) : String(v);
const money = (n: number, c: string) => `${c} ${(n / 100).toFixed(2)}`;
export function poContent(s: State, order: Data): PoPdfContent {
    const p = order.documentProfile, supplier = order.supplierSnapshot;
    requireThat(order.imported || supplier?.id === order.supplier, 'Approved supplier identity is missing; renew purchasing authority', 409);
    const labels = { ...poLabels, ...p?.fieldLabels };
    const address = (a?: Data) => a ? [a.name, a.address, a.attention ? 'Attention: ' + a.attention : ''].filter(Boolean) : [unknown];
    const promised = all(s, 'supplierOrderEvidence').find(e => e.order === order.id)?.promisedDate;
    const sections = [
        { heading: p?.billTo.label || 'Bill to', lines: address(p?.billTo) },
        { heading: p?.shipTo.label || 'Ship to', lines: address(p?.shipTo) },
        { heading: labels.supplier, lines: [value(supplier?.name), 'Supplier ID: ' + order.supplier, value(supplier?.address), labels.remitTo + ': ' + value(supplier?.remitTo)] },
        { heading: 'Order terms', lines: [labels.paymentTerms + ': ' + value(order.terms), labels.shippingTerms + ': ' + value(p?.shippingTerms), 'Deposit / prepayment terms: ' + value(order.poDetails?.deposit ? depositTermText(order.poDetails.deposit,order.currency) : order.poDetails?.depositTerms), labels.needDate + ': ' + value(order.needDate), labels.promisedDate + ': ' + value(promised), 'Buyer contact: ' + value(p?.buyerContact), labels.notes + ': ' + value(p?.notes || order.poDetails?.notes)] },
        { heading: 'Order lines', lines: order.lines.map((l: Data, i: number) => `${i + 1}. ${labels.description}: ${l.description}\n${labels.partNumber}: ${value(l.partNumber)} · ${labels.quantity}: ${l.quantity} · ${labels.unit}: ${value(l.unit)} · ${labels.unitPrice}: ${money(l.unitMinor, order.currency)}\n${labels.lineTax}: ${l.lineTaxMinor == null ? unknown : money(l.lineTaxMinor, order.currency)} · ${labels.lineTotal}: ${money(l.totalMinor + (l.lineTaxMinor || 0), order.currency)}\n${p?.shipTo.label || 'Ship to'}: ${l.shipTo || address(p?.shipTo).join(', ')}${l.needDate?'\nNeed date: '+l.needDate:''}${l.notes?'\nNotes to supplier: '+l.notes:''}${l.supplierSnapshot?'\nLine supplier: '+l.supplierSnapshot.name:''}`) },
        { heading: 'Totals', lines: [labels.freight + ': ' + money(order.freightMinor, order.currency), labels.tax + ': ' + money(order.taxMinor, order.currency), ...(order.otherChargesMinor ? ['Other charges: '+money(order.otherChargesMinor,order.currency)] : []), labels.total + ': ' + money(order.totalMinor, order.currency)] },
        { heading: 'Purchase terms and conditions', lines: [value(p?.standardTerms)] },
    ];
    if(order.charges?.length)sections.splice(4,0,{heading:'Charge lines',lines:order.charges.map((charge:Data,index:number)=>`${index+1}. ${charge.kind}: ${charge.description} · ${money(charge.amountMinor,order.currency)}`)});
    if(order.poDetails?.blanket) sections.unshift({heading:'Blanket purchase order',lines:['Approved cap: '+money(order.totalMinor,order.currency),'Valid from: '+order.poDetails.blanket.validFrom,'Valid through (inclusive): '+order.poDetails.blanket.validThrough,'Draw-down basis: recorded invoice evidence; not a supplier send or payment']});
    for (const line of order.lines.filter((l: Data) => l.service)) sections.push({ heading: 'Service receiving: ' + line.description, lines: ['Basis: ' + line.service.mode, ...(line.service.milestones ?? []).map((m: Data) => m.name + ': ' + money(m.valueMinor, order.currency))] });
    if (order.recurring) sections.unshift({heading:'Scheduled recurring purchase',lines:['Scheduled for: '+order.recurring.scheduledFor,'Source PO: '+get(s,'order',order.recurring.sourceOrder).number,'Series: '+order.recurring.series,'Explicit recurring authorization version: '+order.recurring.authorizationVersion]});
    if (order.cancellation) sections.unshift({ heading: 'Approved cancellation', lines: ['Original PO: ' + order.cancellation.number, 'Cancellation requires current native approval; supplier send is recorded separately', ...order.cancellation.lines.map((line: Data) => 'Cancel source line ' + line.line + ': ' + line.q / 1000)] });
    if (order.adoptedDisposition) sections.unshift({ heading: 'Replacement of adopted remainder', lines: ['Original PO: ' + order.adoptedDisposition.number, order.adoptedDisposition.basis, 'Disposition: ' + order.adoptedDisposition.reason] });
    const adoption = orderAdoption(s, order);
    if (adoption && adoption.sourceOrder.number !== order.number) sections.unshift({ heading: 'Original adopted PO reference', lines: [adoption.sourceOrder.number, 'Original imported approval remains historical evidence; this revision requires native approval'] });
    const revision = s.get('revision:' + order.request + ':' + order.revision)?.value;
    if (revision?.amends) {
        const prior = get(s, 'order', revision.amends);
        let sequence = 1, ancestor = prior; const visited = new Set<string>();
        for (;;) {
            requireThat(!visited.has(ancestor.id), 'Invalid change-order ancestry', 409); visited.add(ancestor.id);
            const previous = s.get('revision:' + ancestor.request + ':' + ancestor.revision)?.value.amends;
            if (!previous) break;
            ancestor = get(s, 'order', previous); sequence++;
        }
        const changes: string[] = [];
        if(JSON.stringify(prior.poDetails?.deposit)!==JSON.stringify(order.poDetails?.deposit)) changes.push('Structured deposit: '+(prior.poDetails?.deposit ? depositTermText(prior.poDetails.deposit,prior.currency) : 'None')+' to '+(order.poDetails?.deposit ? depositTermText(order.poDetails.deposit,order.currency) : 'None'));
        changes.push(...order.lines.flatMap((l: Data) => {
            const old = prior.lines.find((v: Data) => v.id === l.id);
            return !old ? ['Added: ' + l.description] : ['description', 'quantity', 'unitMinor', 'partNumber', 'unit', 'shipTo', 'lineTaxMinor', 'service', 'needDate'].filter(k => JSON.stringify(old[k]) !== JSON.stringify(l[k])).map(k => `${l.description} · ${k}: ${value(old[k])} to ${value(l[k])}`);
        }));
        for (const k of ['supplier', 'currency', 'terms', 'needDate', 'freightMinor', 'taxMinor']) if (prior[k] !== order[k]) changes.push(`${k}: ${value(prior[k])} to ${value(order[k])}`);
        if(JSON.stringify(prior.charges??[])!==JSON.stringify(order.charges??[]))changes.push('Charge lines: '+JSON.stringify(prior.charges??[])+' to '+JSON.stringify(order.charges??[]));
        if(JSON.stringify(prior.poDetails?.blanket)!==JSON.stringify(order.poDetails?.blanket)) changes.push('Blanket validity: '+JSON.stringify(prior.poDetails?.blanket)+' to '+JSON.stringify(order.poDetails?.blanket));
        sections.unshift({ heading: 'Change order ' + sequence, lines: ['Change order revision: ' + sequence, 'Prior PO: ' + prior.number, 'Approved request/PO revision: ' + order.revision, ...changes] });
    }
    return { title: `${p?.legalName || 'Legal entity: Not recorded'} · ${order.number}`, subtitle: `${order.status.toUpperCase()} · Revision ${order.revision} · Issued ${order.issuedAt || 'Not issued'}${p ? '' : ' · Legacy document fields not recorded'}\nSource request ${order.request} · Generated ${order.generatedAt || 'Not recorded'}`,
        ...(p?.logo ? { logo: p.logo } : {}), sections, attachments: [p?.termsFile, p?.certificate].filter(file=>file&&!file.erasure) };
}
export function poHtml(content: PoPdfContent) {
    const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + escape(content.title) + '</title><style>body{font:16px Arial;margin:30px;max-width:900px;overflow-wrap:anywhere}p{white-space:pre-wrap}img{max-width:160px;max-height:90px}</style></head><body>' + (content.logo ? `<img alt="Configured bill-to logo" src="data:${content.logo.mediaType};base64,${content.logo.base64}">` : '') + '<h1>' + escape(content.title) + '</h1><p>' + escape(content.subtitle || '') + '</p>' + content.sections.map(s => '<section><h2>' + escape(s.heading) + '</h2>' + s.lines.map(l => '<p>' + escape(l) + '</p>').join('') + '</section>').join('') + (content.attachments || []).map(a => `<p><a download="${escape(a.name)}" href="data:application/pdf;base64,${a.base64}">${escape(a.name)}</a></p>`).join('') + '</body></html>';
}
