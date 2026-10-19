import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {session,api,current} from './browser-journey.mjs';

/** Sources come from real signed inbound + RER archive import; only the provider edge is faked. */
export async function emailIntakeJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),requester=await session(browser,root,origin,'requester',width);
 try{
  const data=(await current(owner.context,origin)).data,intake=data.emailIntake.find(i=>i.providerEmailId==='browser_unknown_quote_'+width);assert.ok(intake);assert.equal(intake.status,'held');
  const supplier=data.supplier.find(s=>s.name.startsWith('Canyon lifting equipment'))??await api(owner.context,origin,'supplier',{name:'Canyon lifting equipment',status:'preferred',reason:'Known supplier from retained quotation',contacts:[{name:'Sales',email:'sales@canyon.example.test'}]});
  await api(owner.context,origin,'policy',{name:'Email equipment '+width,currency:'USD',category:'Email '+width,project:data.business[0].projects[0],approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:2000000});
  await owner.page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click();
  const ownerRegion=owner.page.getByRole('region',{name:'Email request intake'});await ownerRegion.getByText('Request email address',{exact:true}).click();await ownerRegion.getByLabel('Business request email address',{exact:true}).fill('requests@example.test');
  const saved=owner.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/email-intake-config'));await ownerRegion.getByRole('button',{name:'Save request email address',exact:true}).click();assert.equal((await saved).status(),200);
  await ownerRegion.getByRole('row').filter({hasText:'Lift equipment quote '+width}).getByRole('button',{name:'Open email intake',exact:true}).click();
  const held=owner.page.getByRole('region',{name:'Email intake draft'});await held.getByText(/Held: Sender has no active native requester membership/).waitFor();await held.getByRole('link',{name:'quote.pdf',exact:true}).waitFor();
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await owner.page.screenshot({path:join(evidence,`INTAKE-004-held-${width}.png`),fullPage:true});
  await held.getByLabel('Assign to active requester',{exact:true}).selectOption('requester@dev.localhost');await held.getByLabel('Assignment reason',{exact:true}).fill('Owner reviewed supplier quote and assigned the field requester');
  const assigned=owner.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/email-intake-assign'));await held.getByRole('button',{name:'Assign held email',exact:true}).click();assert.equal((await assigned).status(),200);
  assert.equal(await owner.page.getByRole('button',{name:'Create purchase request draft',exact:true}).count(),0,'Owner does not complete another requester draft');
  await requester.page.goto(origin+'/app?intake='+intake.id);
  const draft=requester.page.getByRole('region',{name:'Email intake draft'});await draft.getByLabel('Email draft title',{exact:true}).waitFor();assert.equal(await draft.getByLabel('Email draft title',{exact:true}).inputValue(),'Lift equipment quote '+width);assert.match(await draft.innerText(),/Provider-reported sender; employee authorship is not verified/);
  assert.equal((await requester.context.request.get(origin+`/api/purse/email-intake/${intake.id}/files/${intake.files[0].id}`)).status(),200);const original=await requester.context.request.get(origin+`/api/purse/email-intake/${intake.id}/files/${intake.files[0].id}`);assert.equal(createHash('sha256').update(await original.body()).digest('hex'),intake.files[0].sha256);
  const title='North Ridge lifting harnesses '+width;await draft.getByLabel('Email draft title',{exact:true}).fill(title);await draft.getByLabel('Email draft notes',{exact:true}).fill('Two harnesses needed for the North Ridge field crew.');
  const corrected=requester.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/email-intake-edit'));await draft.getByRole('button',{name:'Save email draft corrections',exact:true}).click();assert.equal((await corrected).status(),200);await draft.getByRole('heading',{name:title,exact:true}).waitFor();
  const form=draft.locator('form').filter({has:requester.page.getByRole('button',{name:'Create purchase request draft',exact:true})});assert.equal(await form.getByLabel('Request title',{exact:true}).inputValue(),title);
  await form.getByLabel('Supplier',{exact:true}).selectOption(supplier.id);await form.getByLabel('Currency',{exact:true}).selectOption('USD');await form.getByLabel('Need date',{exact:true}).fill('2026-12-01');await form.getByLabel('Location',{exact:true}).selectOption(data.business[0].locations[0]);await form.getByLabel('Cost centre',{exact:true}).selectOption(data.business[0].costCentres[0]);
  for(const [name,value]of [['Description','Lifting harness'],['Quantity','2'],['Unit price','125.00'],['Category','Email '+width],['Freight','0.00'],['Supplied tax','0.00'],['Supplier-supplied terms','Net 30']])await form.getByLabel(name,{exact:true}).fill(value);await form.getByLabel('Project',{exact:true}).selectOption(data.business[0].projects[0]);
  assert.equal(await requester.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await requester.page.screenshot({path:join(evidence,`INTAKE-004-prefilled-draft-${width}.png`),fullPage:true});
  const completed=requester.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/email-intake-complete'));await form.getByRole('button',{name:'Create purchase request draft',exact:true}).click();assert.equal((await completed).status(),200);await draft.getByText('A purchase request draft was created.',{exact:false}).waitFor();
  let state=(await current(requester.context,origin)).data;const request=state.request.find(r=>r.emailIntake===intake.id);assert.ok(request);assert.equal(request.title,title);assert.equal(request.status,'draft');assert.equal(request.totalMinor,25000);assert.equal(state.decision.filter(d=>d.request===request.id).length,0);
  await requester.page.getByRole('row').filter({hasText:title}).getByRole('button',{name:'Open request',exact:true}).click();await requester.page.getByRole('heading',{name:title+' · revision 1',exact:true}).waitFor();
  const submit=requester.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/submit'));await requester.page.getByRole('button',{name:'Submit for approval',exact:true}).click();assert.equal((await submit).status(),200);state=(await current(requester.context,origin)).data;assert.equal(state.request.find(r=>r.id===request.id).status,'pending');
  await requester.page.screenshot({path:join(evidence,`INTAKE-004-request-submitted-${width}.png`),fullPage:true});assert.equal(await requester.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  return {clause:'INTAKE-004',width,intake:intake.id,request:request.id};
 }catch(error){await owner.page.screenshot({path:join(evidence,`INTAKE-004-owner-failure-${width}.png`),fullPage:true});await requester.page.screenshot({path:join(evidence,`INTAKE-004-requester-failure-${width}.png`),fullPage:true});throw error;}finally{await owner.context.close();await requester.context.close();}
}
