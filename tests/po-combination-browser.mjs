import assert from 'node:assert/strict';
import {join} from 'node:path';

export async function combinedProcureJourney({h,page,width,evidence}) {
    const cmd=h.command,current=(await h.state()).data.business[0];
    await cmd('business',{...current,costCentres:[...new Set([...current.costCentres,'Operations'])]});
    const requester=await h.member('synthetic-purse-1821@example.test',['requester']),other=await h.member('synthetic-purse-1822@example.test',['requester']),approver=await h.member('synthetic-purse-1823@example.test',['approver']),buyer=await h.member('synthetic-purse-1824@example.test',['buyer']);
    await cmd('buyer-role-limit',{role:'buyer',entity:'main',limits:{percent:10,quantityPercent:0}});
    const supplier=await cmd('supplier',{name:'Combined office supplier',status:'active',reason:'Reviewed source',contacts:[{name:'Contact',email:'synthetic-purse-1825@office.example.test'}]});
    await cmd('policy',{name:'Combined office authority',currency:'USD',category:'Combined goods',project:'*',approver:'synthetic-purse-1823@example.test',limitMinor:500000,budgetMinor:2000000});
    const make=async(title,department,actor,count)=>{
        const request=await cmd('request',{title,supplier:supplier.id,currency:'USD',location:current.locations[0],costCentre:department,needDate:'2026-12-01',terms:'Net 30',lines:Array.from({length:count},(_,index)=>({description:title+' line '+(index+1),quantity:'1',unitMinor:100000,category:'Combined goods',project:current.projects[0],unit:'kit'}))},actor);
        await cmd('submit',{id:request.id,revision:request.revision},actor);await cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Reviewed department source'},approver);return request;
    };
    const a=await make('Combined IT purchase',current.costCentres[0],requester,2),b=await make('Combined Operations purchase','Operations',other,1);
    const decisionsBefore=(await h.state()).data.decision.filter(decision=>[a.id,b.id].includes(decision.request)&&decision.decision==='approved');
    const [name,value]=buyer.split('=');await page.context().addCookies([{name,value,url:h.origin}]);
    await page.goto(h.origin+'/app?tab=Orders');const panel=page.getByRole('region',{name:'Procure',exact:true});await panel.getByText('Combine approved request lines',{exact:true}).click();
    for(const request of [a,b])for(const line of request.lines)await panel.getByRole('checkbox',{name:'Select '+request.title+' '+line.description,exact:true}).check();
    await panel.getByText('Correct selected lines and add charges',{exact:true}).click();
    await panel.getByLabel('Unit price '+a.lines[0].description,{exact:true}).fill('1040.00');await panel.getByLabel('Additional freight',{exact:true}).fill('25.00');await panel.getByLabel('Combined correction reason',{exact:true}).fill('Buyer confirmed supplier price and delivery');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await panel.screenshot({path:join(evidence,`PO-008-combined-corrections-${width}.png`)});
    const saved=page.waitForResponse(response=>response.url().endsWith('/po-combine'));await panel.getByRole('button',{name:'Combine and issue purchase order',exact:true}).click();const response=await saved;assert.equal(response.status(),200,await response.text());
    const order=await response.json();const after=(await h.state()).data;for(const request of [a,b]){assert.equal(after.request.find(source=>source.id===request.id).status,'approved');const original=decisionsBefore.find(decision=>decision.request===request.id);assert.ok(after.decision.some(decision=>decision.request===request.id&&decision.carriedFrom===original.id));}
    assert.equal(order.status,'issued');assert.equal(order.lines.length,3);assert.equal(order.totalMinor,306500);
    for(const request of [a,b])for(const line of request.lines){const checkbox=panel.getByRole('checkbox',{name:'Select '+request.title+' '+line.description,exact:true});await page.waitForFunction(label=>document.querySelector('input[aria-label='+JSON.stringify(label)+']')?.disabled,'Select '+request.title+' '+line.description);assert.equal(await checkbox.isDisabled(),true);}
    await panel.screenshot({path:join(evidence,`PO-008-combined-allocated-${width}.png`)});
    for(const [request,cookie]of [[a,requester],[b,other]]) {
        const [name,value]=cookie.split('=');await page.context().addCookies([{name,value,url:h.origin}]);await page.goto(h.origin+'/app?request='+encodeURIComponent(request.id));const sources=page.getByRole('region',{name:'Source purchase orders',exact:true});await sources.getByText(order.number,{exact:true}).waitFor();assert.equal(await sources.getByRole('link').count(),0);
        await page.getByRole('region',{name:'Buyer conversion source changes',exact:true}).waitFor();
        await page.locator('.record').screenshot({path:join(evidence,`PO-008-shared-source-${request.id===a.id?'IT':'Operations'}-${width}.png`)});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    const [ownerName,ownerValue]=h.owner.split('=');await page.context().addCookies([{name:ownerName,value:ownerValue,url:h.origin}]);
    return order;
}
