import { all, get, requireThat, type Data, type State } from './types';
function noticeSuppliers(state:State,value:Data):string[]{return (state.get('recurringScenario:'+value.scenario)?.value.snapshot?.sources??[]).filter((r:Data)=>r.kind==='agreement').map((r:Data)=>r.value.supplier);}
export type ErasureSubject = { kind:'member'|'contact'; id:string; email:string; values:string[]; operator?:string; supplier?:string };
export async function erasureSubject(db:D1Database,state:State,input:Data):Promise<ErasureSubject> {
 requireThat(['member','contact'].includes(input.kind),'Choose a departed member or supplier contact');
 if(input.kind==='member') {
  const member=get(state,'member',input.id);
  requireThat(member.active===false,'Deactivate this member before erasure',409);
  requireThat(!member.email.endsWith('@erased.invalid'),'This identity was already erased',409);
  const operator=await db.prepare('SELECT id,role,display_name FROM oa_operators WHERE email=?').bind(member.email).first<Data>();
  requireThat(operator?.role!=='owner','Native owners must transfer ownership before erasure',409);
  const scim=member.scim&&get(state,'scimUser',member.scim.user);
  return {kind:'member',id:member.id,email:member.email,operator:operator?.id,values:[member.email,member.name,operator?.id,operator?.display_name,...all(state,'comment').filter(c=>c.author===operator?.id).map(c=>c.authorName),scim?.externalId].filter(Boolean)};
 }
 const supplier=get(state,'supplier',input.id);
 requireThat(typeof input.email==='string','Select the exact contact email');
 const contacts=(supplier.contacts??[]).filter((c:Data)=>c.email.toLowerCase()===input.email.toLowerCase());
 // Historical nominated contacts remain selectable after a register edit.
 for(const row of state.values()) {
  const v=row.value;
  if(v.supplierSnapshot?.id===supplier.id)contacts.push(...v.supplierSnapshot.contacts.filter((c:Data)=>c.email.toLowerCase()===input.email.toLowerCase()));
  if(['orderSend','orderThreadMessage'].includes(row.kind)&&v.supplier===supplier.id&&v.recipient?.toLowerCase()===input.email.toLowerCase()&&!v.erasure)contacts.push({email:v.recipient});
  if(row.kind==='recurringNoticeSend'&&noticeSuppliers(state,v).includes(supplier.id)&&v.recipient?.toLowerCase()===input.email.toLowerCase()&&!v.erasure)contacts.push({email:v.recipient});
  if(row.kind==='rfq')contacts.push(...v.suppliers.filter((c:Data)=>c.id===supplier.id&&c.email.toLowerCase()===input.email.toLowerCase()).map((c:Data)=>({email:c.email,name:c.contactName,phone:c.phone,address:c.address})));
 }
 requireThat(contacts.length&&!input.email.endsWith('@erased.invalid'),'Supplier contact not found',404);
 // A link holder's stated name is not the register name: names stated on a
 // send to this recipient belong to the same reviewed inventory.
 const sends=new Set([...state.values()].filter(row=>row.kind==='orderSend'&&row.value.supplier===supplier.id&&row.value.recipient?.toLowerCase()===input.email.toLowerCase()&&!row.value.erasure).map(row=>row.id));
 for(const row of state.values()) {
  if(row.kind==='orderSend'&&sends.has(row.id))contacts.push({name:row.value.acknowledgment?.name,email:row.value.recipient});
  if(['orderAcknowledgment','orderSupplierResponse'].includes(row.kind)&&sends.has(row.value.send))contacts.push({name:row.value.name});
 }
 return {kind:'contact',id:supplier.id,supplier:supplier.id,email:input.email.toLowerCase(),values:[...new Set(contacts.flatMap((c:Data)=>[c.email,c.name,c.contactName,c.phone,c.address]).filter((v:unknown)=>typeof v==='string'&&v.length))] as string[]};
}
export function erasureChoices(state:State) {
 const contacts=new Map<string,Data>();
 for(const supplier of all(state,'supplier'))for(const contact of supplier.contacts??[])if(contact.email&&!contact.email.endsWith('@erased.invalid'))contacts.set(supplier.id+':'+contact.email,{kind:'contact',id:supplier.id,email:contact.email,label:supplier.name+' · '+contact.name+' · '+contact.email});
 for(const row of state.values()) {
  const v=row.value;
  if(['orderSend','orderThreadMessage'].includes(row.kind)&&!v.erasure&&v.recipient&&!v.recipient.endsWith('@erased.invalid')){const supplier=state.get('supplier:'+v.supplier)?.value;if(supplier)contacts.set(v.supplier+':'+v.recipient,{kind:'contact',id:v.supplier,email:v.recipient,label:supplier.name+' · '+v.recipient});}
  if(row.kind==='recurringNoticeSend'&&!v.erasure&&v.recipient&&!v.recipient.endsWith('@erased.invalid'))for(const id of noticeSuppliers(state,v)){const supplier=state.get('supplier:'+id)?.value;if(supplier)contacts.set(id+':'+v.recipient,{kind:'contact',id,email:v.recipient,label:supplier.name+' · '+v.recipient});}
  const entries=row.kind==='rfq'?v.suppliers:(v.supplierSnapshot?[{...v.supplierSnapshot,contacts:v.supplierSnapshot.contacts}]:[]);
  for(const supplier of entries)for(const contact of supplier.contacts??[supplier])if(contact.email&&!contact.email.endsWith('@erased.invalid')&&!contacts.has(supplier.id+':'+contact.email))contacts.set(supplier.id+':'+contact.email,{kind:'contact',id:supplier.id,email:contact.email,label:supplier.name+' · '+contact.email});
 }
 return [...all(state,'member').filter(m=>m.active===false&&!m.email.endsWith('@erased.invalid')).map(m=>({kind:'member',id:m.id,label:m.name+' · '+m.email})),...contacts.values()];
}
