import assert from 'node:assert/strict';
import {harness} from './purse-harness.mjs';
export const apiMail=n=>['synthetic-purse-'+n,'example.test'].join(String.fromCharCode(64));
export async function publicApiFixture(options={}){
 const h=await harness({protectedKey:'12'.repeat(32),...options});
 try{
  await h.command('business',{name:'Canyon purchasing',currencies:['USD'],locations:['Denver'],costCentres:['Operations','Research'],projects:['Safety']});
  const requester=await h.member(apiMail(5101),['requester']),approver=await h.member(apiMail(5102),['approver']),buyer=await h.member(apiMail(5103),['buyer']);
  const supplier=await h.command('supplier',{name:'Canyon Field Supply',status:'preferred',reason:'Reviewed native supplier',contacts:[]});
  const policy=await h.command('policy',{name:'Safety budget',currency:'USD',category:'*',project:'*',approver:apiMail(5102),limitMinor:1000000,budgetMinor:1000000});
  const draft={title:'synthetic-purse-5104',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Field inspection kit',quantity:'10',unitMinor:5000,category:'Equipment',project:'Safety'}]};
  const principal=async cookie=>{const response=await h.send('/api/purse/state',undefined,cookie);assert.equal(response.status,200);return response.value.actor.id;};
  const ownerId=(await h.db.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active'").first()).id;
  const key=async(scopes,member=ownerId,recordScope={})=>{const response=await h.send('/api/purse/api-keys',{name:'synthetic-purse-5105',principal:member,scopes,recordScope},h.owner);assert.equal(response.status,200,JSON.stringify(response.value));return response.value;};
  const call=async(token,path,body,idempotency='synthetic-purse-'+crypto.randomUUID())=>{
   const response=await h.mf.dispatchFetch(h.origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':idempotency},...(body===undefined?{}:{body:JSON.stringify(body)})});
   let value;const raw=await response.text();try{value=JSON.parse(raw);}catch{value=raw;}return {status:response.status,value,headers:response.headers};
  };
  const issue=async(request)=>{await h.command('submit',{id:request.id,revision:1},requester);await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Independent current approval'},approver);const order=await h.command('convert',{id:request.id,revision:1},buyer);await h.command('issue',{id:order.id,revision:1,reason:'Approved native document'},buyer);return order;};
  return {h,requester,approver,buyer,supplier,policy,draft,key,call,principal,ownerId,issue,close:()=>h.close()};
 }catch(error){await h.close();throw error;}
}
