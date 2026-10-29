import { adoptionFixture, importInput } from './order-adoption-fixture.mjs';
import assert from 'node:assert/strict';
import { termsPdf } from './po-documents-fixtures.mjs';
import { documentProfileFixture } from './document-profile-fixture.mjs';

export async function orderSendFixture(h, { kind = 'date' } = {}) {
    const business = { name: 'synthetic-purse-2801', currencies: ['USD'], locations: ['Austin','Denver'], costCentres: ['Operations'], projects: ['General'] };
    await h.command('business', business);
    const requester = await h.member('synthetic-purse-2802@example.test',['requester']);
    const approver = await h.member('synthetic-purse-2803@example.test',['approver']);
    const buyer = await h.member('synthetic-purse-2804@example.test',['buyer']);
    const outsider = await h.member('synthetic-purse-2805@example.test',['requester']);
    const supplier = await h.command('supplier',{name:'synthetic-purse-2806',status:'preferred',reason:'Reviewed supplier',address:'synthetic-purse-2807',remitTo:'synthetic-purse-2808',postalState:'TX'});
    await h.command('policy',{name:'synthetic-purse-2809',currency:'USD',category:'goods',project:'General',approver:'synthetic-purse-2803@example.test',limitMinor:1000000,budgetMinor:10000000});
    const terms = await termsPdf('synthetic-purse-2810 original purchase terms'), certificate = await termsPdf('synthetic-purse-2811 original certificate');
    const profile = await h.command('po-profile',{...documentProfileFixture(business,'Austin'),purchaseType:'goods',legalName:'synthetic-purse-2812',fieldLabels:{partNumber:'Vendor SKU'},termsFile:{name:'synthetic-purse-2813.pdf',base64:terms},certificate:{name:'synthetic-purse-2814.pdf',base64:certificate,supplierStates:['TX']}});
    const draft = {title:'synthetic-purse-2815',supplier:supplier.id,currency:'USD',needDate:'2026-11-01',location:'Austin',costCentre:'Operations',terms:'Net 30',freightMinor:1000,taxMinor:50,poDetails:{notes:'synthetic-purse-2816',depositTerms:'Text-only prepayment terms'},lines:[{description:'synthetic-purse-2817',quantity:'2',unitMinor:10000,category:'goods',project:'General',partNumber:'synthetic-purse-2818',shipTo:'synthetic-purse-2819',lineTaxMinor:50}]};
    let request = await h.command('request',draft,requester);
    await h.command('submit',{id:request.id,revision:1},requester);
    await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Exact initial approval'},approver);
    const initial = await h.command('convert',{id:request.id,revision:1,issue:true},buyer);
    let changed;
    if(kind==='quantity'){
        changed=await h.command('amend',{...request,id:request.id,revision:1,lines:request.lines.map(line=>({...line,quantity:'3'})),reason:'Supplier quantity amendment needs renewed approval'},requester);
        await h.command('submit',{id:request.id,revision:changed.revision},requester);
        await h.command('decision',{id:request.id,revision:changed.revision,decision:'approved',reason:'Exact quantity amendment approved'},approver);
        const issued=await h.command('convert',{id:request.id,revision:changed.revision,issue:true},buyer);
        changed={...changed,needDateEdit:{order:issued.id}};
    }else changed = await h.command('need-date-edit',{id:request.id,revision:1,line:request.lines[0].id,needDate:'2026-11-08',reason:'Requester corrected the needed date'},requester);
    const order = (await h.state()).data.order.find(order=>order.id===changed.needDateEdit.order);
    assert.equal(order.status,'issued');
    const send = async (body={}, cookie=buyer) => h.send('/api/purse/order-send',{order:order.id,revision:order.revision,recipient:'synthetic-purse-2820@example.test',reason:'Explicit supplier date correction',consent:true,...body},cookie);
    return {request:changed,initial,order,send,business,profile,supplier,terms,certificate,requester,approver,buyer,outsider};
}
export function orderMessage(h) { return h.messages.find(message=>message.subject.startsWith('Change order ')); }
export function orderLink(h) { return new URL(orderMessage(h).text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]); }

/** Qualified synthetic import remains historical even when a buyer explicitly sends it. */
export async function adoptedSendFixture(h) {
    const fixture = adoptionFixture({ base: 2903, number: 'synthetic-purse-2903', deposit: false });
    const input = { ...importInput(fixture), csv: fixture.csv.replaceAll('Fitout', 'General').replaceAll('Equipment', 'goods') };
    const preview = await h.send('/api/purse/import/preview', input, h.owner); assert.equal(preview.status, 200, JSON.stringify(preview.value));
    const committed = await h.send('/api/purse/import/commit', { ...input, fingerprint: preview.value.plan.fingerprint }, h.owner); assert.equal(committed.status, 200, JSON.stringify(committed.value));
    await h.command('screen-supplier', { id: fixture.ids.supplier });
    const members = (await h.state()).data.member;
    const policy = await h.command('policy', { name: 'synthetic-purse-2904', currency: 'USD', category: 'goods', project: 'General', approver: members.find(member => member.roles.includes('approver')).email, limitMinor: 1000000, budgetMinor: 10000000 });
    const selection = { id: fixture.ids.order, policy: policy.id, budget: fixture.ids.budget, location: 'Denver', costCentre: 'Operations', receiver: members.find(member => member.roles.includes('buyer')).email };
    const review = await h.command('adopt-order-preview', selection);
    const order = await h.command('adopt-order', { ...selection, fingerprint: review.fingerprint, reviewed: true, reason: 'synthetic-purse-2905' });
    return { order, fixture };
}
