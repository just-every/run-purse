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
    const {h,cmd,requester,other,approver,buyer,fields,approve,entries}=await fixture(t);
    const splitInput=fields('IT kits','IT',2);splitInput.lines[0].allocations=[{costCentre:'IT',project:'General',basisPoints:6000},{costCentre:'Operations',project:'General',basisPoints:4000}];
    const a=await approve(splitInput),b=await approve({...fields('Operations kit','Operations'),terms:'Net 60',needDate:'2026-12-15'},other),input={entries:entries([a,b]),issue:true,conversionEdits:{lines:[{request:a.id,id:a.lines[0].id,unitMinor:104000,unit:'box',partNumber:'Revised SKU'}],charges:[{kind:'freight',description:'Delivery',amountMinor:2500}],reason:'Buyer confirmed actual price and delivery'}};
    await cmd('po-combine',input,'',401);await cmd('po-combine',input,requester,403);
    const order=await cmd('po-combine',input,buyer);assert.equal(order.status,'issued');assert.equal(order.totalMinor,306500);assert.equal(order.lines.length,3);assert.deepEqual(order.sources.map(source=>[source.request,source.terms,source.needDate]),[[a.id,'Net 30','2026-12-01'],[b.id,'Net 60','2026-12-15']]);
    assert.deepEqual(order.lines.map(line=>[line.sourceRequest,line.sourceLine]),[[a.id,a.lines[0].id],[a.id,a.lines[1].id],[b.id,b.lines[0].id]]);assert.equal(order.lines[0].unit,'box');assert.equal(order.lines[0].partNumber,'Revised SKU');assert.equal(order.lines[2].costCentre,'Operations');assert.deepEqual(order.lines[0].allocations.map(allocation=>allocation.amountMinor),[62400,41600]);
    const state=(await h.state()).data;for(const request of [a,b]){const original=state.revision.find(revision=>revision.request===request.id&&revision.revision===request.revision);for(const field of ['title','supplier','currency','terms','needDate','lines','freightMinor','taxMinor','totalMinor'])assert.deepEqual(original[field],request[field]);const source=state.request.find(row=>row.id===request.id);assert.ok(source.sharedOrders.some(po=>po.id===order.id));await cmd('convert',{id:source.id,revision:source.revision},buyer,409);}
    const privateState=(await h.state(other)).data;assert.equal(privateState.order.some(po=>po.id===order.id),false);assert.equal(privateState.poGenerationQueue.find(row=>row.request===b.id).mayReadOrder,false);assert.ok(privateState.request.find(row=>row.id===b.id).sharedOrders.some(po=>po.id===order.id&&!po.mayRead));
    await cmd('po-combine',input,buyer,409);
    const invoice={order:order.id,reference:'synthetic-purse-1807',source:'Supplier original',invoiceDate:'2026-10-26',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:52000}]};
    const first=await cmd('invoice',invoice,buyer);assert.equal(first.allocations[0].sourceRequest,a.id);assert.equal((await cmd('invoice',invoice,buyer)).id,first.id);await cmd('invoice',{...invoice,source:'Conflicting evidence'},buyer,409);
    const duplicate=await cmd('invoice',{...invoice,reference:'synthetic-purse-1808'},buyer);assert.ok(duplicate.flags.some(flag=>flag.code==='near-duplicate'));
    const over=await cmd('invoice',{...invoice,reference:'synthetic-purse-1809',allocations:[{line:order.lines[1].id,quantity:'2.1',amountMinor:210000}]},buyer);assert.ok(over.flags.some(flag=>flag.code==='po-balance'));assert.equal(over.balance.faceMinor,306500);assert.equal(over.balance.billedMinor,104000);
    for(const invoice of [duplicate,over]){const payable=await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:invoice.invoiceDate,term:'Net 30',reason:'Source terms'},buyer);await cmd('approve-payable',{invoice:invoice.id,version:payable.version,reason:'Unresolved source hold'},buyer,409);}
    const high=await approve(fields('Above buyer limit','IT')),companion=await approve(fields('Companion purchase','Operations'),other);
    const held=await cmd('po-combine',{entries:entries([high,companion]),issue:true,conversionEdits:{lines:[{request:high.id,id:high.lines[0].id,unitMinor:115000}],reason:'Supplier price exceeds buyer limit'}},buyer);assert.equal(held.conversionRouted,true);assert.ok(!(await h.state()).data.order.some(po=>po.sources?.some(source=>source.request===high.id)));
    const pending=(await h.state()).data.request.find(request=>request.id===high.id);await cmd('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Independent renewed supplier-price approval'},approver);
    const renewed=await cmd('po-combine',{entries:entries([pending,companion]),issue:true},buyer);assert.equal(renewed.status,'issued');assert.equal(renewed.totalMinor,215000);assert.equal(renewed.sources[0].conversionVariance.approvalRenewed,true);
    const alternate=await cmd('supplier',{name:'Northline Manufacturing',status:'active',reason:'Reviewed substitute supplier',contacts:[{name:'Dispatch',email:'synthetic-purse-1813@northline.example.test'}]});
    const correctionA=await approve(fields('Correctable IT quantity','IT')),correctionB=await approve(fields('Correctable Operations quantity','Operations'),other);
    const corrected=await cmd('po-combine',{entries:entries([correctionA,correctionB]),issue:true,conversionEdits:{supplier:alternate.id,lines:[{request:correctionA.id,id:correctionA.lines[0].id,quantity:'0.5',unit:'pack',partNumber:'Northline kit'}],reason:'Buyer confirmed reduced quantity and equivalent active supplier'}},buyer);
    assert.equal(corrected.supplier,alternate.id);assert.equal(corrected.lines[0].quantity,'0.5');assert.equal(corrected.lines[0].unit,'pack');assert.equal(corrected.lines[0].partNumber,'Northline kit');assert.equal(corrected.totalMinor,150000);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});

test('Combined amendments require every renewed source and retain prior billed balance against only the new issued face',async t=>{
    const {h,cmd,requester,other,approver,buyer,fields,approve,entries}=await fixture(t);
    const a=await approve(fields('First purchase','IT')),b=await approve(fields('Second purchase','Operations'),other);
    const racing=await Promise.all([h.send('/api/purse/command/po-combine',{entries:entries([a,b]),issue:true},buyer),h.send('/api/purse/command/po-combine',{entries:entries([a,b]),issue:true},buyer)]);assert.deepEqual(racing.map(response=>response.status).sort(),[200,409]);const order=racing.find(response=>response.status===200).value;
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
