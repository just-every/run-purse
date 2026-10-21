import assert from 'node:assert/strict';
import {signedInbound} from './email-intake-fixture.mjs';
export async function accessSources(f,edge){
 const {h,cookies,suppliers}=f;await h.command('catalogue',{description:'Approved Denver safety kit',supplier:suppliers[0].id,currency:'USD',unitMinor:1000,category:'Equipment',project:'Safety',approved:true});await h.command('email-intake-config',{address:'requests@example.test'});
 for(const [id,email]of [['synthetic-purse-301','requester@example.test'],['synthetic-purse-302','engineering@example.test'],['synthetic-purse-303','unknown@example.test']]){edge.addMail(id,email);const result=await h.mf.dispatchFetch(h.origin+'/api/purse/email-intake/inbound',signedInbound(id));assert.equal(result.status,202);}
 const draft=await h.command('request',f.draft(0,'Denver supplier quotation review'),cookies.requester);
 const rfq=await h.command('rfq-create',{request:draft.id,revision:1,scope:'Ten safety kits for Denver',suppliers:[suppliers[0].id],deadline:new Date(Date.now()+86400000).toISOString(),reminderAt:new Date(Date.now()+3600000).toISOString(),questions:['Can all ten ship together?']},cookies.buyer);
 const link=await h.send('/api/purse/rfq/send',{rfq:rfq.id,supplier:suppliers[0].id},cookies.buyer);assert.equal(link.status,200);
 const response=await fetch(link.value.url,{method:'POST',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({currency:'USD',freightAmount:'0',taxAmount:'0',leadTime:'Seven days',validity:'Thirty days',conditions:'Net 30',answers:['Yes'],lines:rfq.lines.map(line=>({requestLine:line.id,description:line.description,quantity:line.quantity,unit:line.unit,partNumber:line.partNumber,unitAmount:'10.00'})),files:[{name:'denver-quote.txt',mediaType:'text/plain',base64:Buffer.from('Supplier original for ten Denver kits').toString('base64')}]})});assert.equal(response.status,200);
 return {rfqDraft:draft,rfq,intakes:(await h.state()).data.emailIntake};
}
