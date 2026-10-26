import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

async function fixture(t) {
    const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-1801').digest('hex')});t.after(()=>h.close());const cmd=h.command;
    await cmd('business',{name:'Studio',currencies:['USD','AUD'],locations:['Denver'],costCentres:['IT','Operations'],projects:['General']});
    const requester=await h.member('synthetic-purse-1802@example.test',['requester']),other=await h.member('synthetic-purse-1803@example.test',['requester']),approver=await h.member('synthetic-purse-1804@example.test',['approver']),buyer=await h.member('synthetic-purse-1805@example.test',['buyer']);
    await cmd('buyer-role-limit',{role:'buyer',entity:'main',limits:{percent:10,quantityPercent:0}});
    await cmd('policy',{name:'Purchases',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-1804@example.test',limitMinor:10000000,budgetMinor:100000000});
    const supplier=await cmd('supplier',{name:'Studio Supplies',status:'active',reason:'Reviewed',contacts:[{name:'Contact',email:'synthetic-purse-1806@example.test'}]});
    const fields=(title,department,count=1)=>({title,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:department,terms:'Net 30',lines:Array.from({length:count},(_,index)=>({description:title+' item '+(index+1),quantity:'1',unitMinor:100000,category:'Goods',project:'General',unit:'kit',partNumber:'SKU-'+index}))});
    const approve=async(input,actor=requester)=>{const request=await cmd('request',input,actor);await cmd('submit',{id:request.id,revision:request.revision},actor);await cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Independent source approval'},approver);return request;};
    const entries=requests=>requests.flatMap(request=>request.lines.map(line=>({request:request.id,revision:request.revision,line:line.id})));
    return {h,cmd,requester,other,approver,buyer,supplier,fields,approve,entries};
}

test('Combined approved purchases preserve three source lines, current limits, shared references and exact invoice holds',async t=>{
    const {h,cmd,requester,other,buyer,fields,approve,entries}=await fixture(t);
    const splitInput=fields('IT kits','IT',2);splitInput.lines[0].allocations=[{costCentre:'IT',project:'General',basisPoints:6000},{costCentre:'Operations',project:'General',basisPoints:4000}];
    const a=await approve(splitInput),b=await approve(fields('Operations kit','Operations'),other),input={entries:entries([a,b]),issue:true,conversionEdits:{lines:[{request:a.id,id:a.lines[0].id,unitMinor:104000,unit:'box',partNumber:'Revised SKU'}],charges:[{kind:'freight',description:'Delivery',amountMinor:2500}],reason:'Buyer confirmed actual price and delivery'}};
    await cmd('po-combine',input,'',401);await cmd('po-combine',input,requester,403);
    const order=await cmd('po-combine',input,buyer);assert.equal(order.status,'issued');assert.equal(order.totalMinor,306500);assert.equal(order.lines.length,3);
    assert.deepEqual(order.lines.map(line=>[line.sourceRequest,line.sourceLine]),[[a.id,a.lines[0].id],[a.id,a.lines[1].id],[b.id,b.lines[0].id]]);assert.equal(order.lines[0].unit,'box');assert.equal(order.lines[0].partNumber,'Revised SKU');assert.equal(order.lines[2].costCentre,'Operations');assert.deepEqual(order.lines[0].allocations.map(allocation=>allocation.amountMinor),[62400,41600]);
    const state=(await h.state()).data;for(const request of [a,b]){const source=state.request.find(row=>row.id===request.id);assert.ok(source.sharedOrders.some(po=>po.id===order.id));await cmd('convert',{id:source.id,revision:source.revision},buyer,409);}
    const privateState=(await h.state(other)).data;assert.equal(privateState.order.some(po=>po.id===order.id),false);assert.ok(privateState.request.find(row=>row.id===b.id).sharedOrders.some(po=>po.id===order.id&&!po.mayRead));
    await cmd('po-combine',input,buyer,409);
    const invoice={order:order.id,reference:'synthetic-purse-1807',source:'Supplier original',invoiceDate:'2026-10-26',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:52000}]};
    const first=await cmd('invoice',invoice,buyer);assert.equal(first.allocations[0].sourceRequest,a.id);assert.equal((await cmd('invoice',invoice,buyer)).id,first.id);await cmd('invoice',{...invoice,source:'Conflicting evidence'},buyer,409);
    const duplicate=await cmd('invoice',{...invoice,reference:'synthetic-purse-1808'},buyer);assert.ok(duplicate.flags.some(flag=>flag.code==='near-duplicate'));
    const over=await cmd('invoice',{...invoice,reference:'synthetic-purse-1809',allocations:[{line:order.lines[1].id,quantity:'2.1',amountMinor:210000}]},buyer);assert.ok(over.flags.some(flag=>flag.code==='po-balance'));assert.equal(over.balance.faceMinor,306500);assert.equal(over.balance.billedMinor,104000);
    for(const invoice of [duplicate,over]){const payable=await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:invoice.invoiceDate,term:'Net 30',reason:'Source terms'},buyer);await cmd('approve-payable',{invoice:invoice.id,version:payable.version,reason:'Unresolved source hold'},buyer,409);}
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});

test('Combined amendments require every renewed source and retain prior billed balance against only the new issued face',async t=>{
    const {h,cmd,requester,other,approver,buyer,fields,approve,entries}=await fixture(t);
    const a=await approve(fields('First purchase','IT')),b=await approve(fields('Second purchase','Operations'),other),order=await cmd('po-combine',{entries:entries([a,b]),issue:true},buyer);
    const oldInvoice=await cmd('invoice',{order:order.id,reference:'synthetic-purse-1810',source:'Original combined invoice',invoiceDate:'2026-10-25',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:50000}]},buyer);
    const revised=[];
    for(const [request,actor]of [[a,requester],[b,other]]){
        const next=await cmd('amend',{...request,lines:request.lines.map(line=>({...line,unitMinor:110000})),reason:'Revised approved supplier price'},actor);await cmd('submit',{id:next.id,revision:next.revision},actor);await cmd('decision',{id:next.id,revision:next.revision,decision:'approved',reason:'Renew exact combined source'},approver);revised.push(next);
    }
    await cmd('convert',{id:revised[0].id,revision:revised[0].revision},buyer,409);
    await cmd('po-combine',{amends:order.id,entries:entries([revised[0]]),issue:true},buyer,409);
    const amendment=await cmd('po-combine',{amends:order.id,entries:entries(revised),issue:true},buyer);assert.equal(amendment.totalMinor,220000);assert.equal(amendment.combinationRoot,order.id);assert.equal((await h.state()).data.order.find(po=>po.id===order.id).amendedBy,amendment.id);
    const remaining=await cmd('invoice',{order:amendment.id,reference:'synthetic-purse-1811',source:'Remaining invoice',invoiceDate:'2026-10-26',allocations:[{line:amendment.lines[1].id,quantity:'1',amountMinor:170000}]},buyer);assert.equal(remaining.balance.faceMinor,220000);assert.equal(remaining.balance.billedMinor,oldInvoice.totalMinor);assert.ok(!remaining.flags.some(flag=>flag.code==='po-balance'));
    const excess=await cmd('invoice',{order:amendment.id,reference:'synthetic-purse-1812',source:'Excess invoice',invoiceDate:'2026-10-26',allocations:[{line:amendment.lines[0].id,quantity:'0.001',amountMinor:1}]},buyer);assert.ok(excess.flags.some(flag=>flag.code==='po-balance'));
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});
