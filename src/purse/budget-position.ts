import { all, date, get, requireThat, type Data, type State } from './types';

/** Financial exposure keeps received-but-unbilled value committed. It is
 * separate from the physical outstanding-authority ledger used by REPORT-001. */
export function periodBudgetPosition(s: State, policy: Data) {
 const requests=all(s,'request'),orders=all(s,'order'),invoices=all(s,'invoice'),events=all(s,'commitment'),sources:Data[]=[];
 for(const request of requests) {
  const ledger=events.filter(event=>event.request===request.id&&event.policy===policy.id&&event.currency===policy.currency).reduce((sum,event)=>sum+event.amountMinor,0);
  const issued=orders.filter(order=>order.request===request.id&&order.policy===policy.id&&order.currency===policy.currency&&(order.issuedAt||order.adoption)&&['issued','adopted','amendment-pending','closed','cancelled'].includes(order.status)).sort((a,b)=>b.revision-a.revision)[0];
  const sourceOrders=orders.filter(order=>order.request===request.id&&order.policy===policy.id&&order.currency===policy.currency&&(order.issuedAt||order.adoption)),ids=new Set(sourceOrders.map(order=>order.id));
  const bills=invoices.filter(invoice=>ids.has(invoice.order)&&invoice.currency===policy.currency);
  const deposits=all(s,'deposit').filter(deposit=>ids.has(deposit.order));
  const actualMinor=bills.reduce((sum,bill)=>sum+bill.totalMinor,0)+deposits.reduce((sum,deposit)=>sum+deposit.amountMinor,0);
  if(!ledger&&!issued&&!actualMinor)continue;
  let faceMinor=0;
  if(issued) {
   const base=issued.lines.reduce((sum:number,line:Data)=>sum+line.totalMinor,0);
   const remaining=issued.lines.reduce((sum:number,line:Data)=>{
    if(line.service){const cancelled=(line.carriedCancelledMinor??0)+all(s,'receipt').filter(event=>event.order===issued.id&&event.line===line.id&&event.event==='cancel').reduce((n,event)=>n+(event.valueMinor??0),0);const closed=all(s,'orderClosure').filter(event=>event.order===issued.id&&event.active).flatMap(event=>event.lines).filter((event:Data)=>event.line===line.id).reduce((n:number,event:Data)=>n+(event.valueMinor??0),0);return sum+Math.max(0,line.totalMinor-cancelled-closed);}
    const cancelled=(line.carriedCancelled??0)+all(s,'receipt').filter(event=>event.order===issued.id&&event.line===line.id&&event.event==='cancel').reduce((n,event)=>n+event.q,0),closed=all(s,'orderClosure').filter(event=>event.order===issued.id&&event.active).flatMap(event=>event.lines).filter((event:Data)=>event.line===line.id).reduce((n:number,event:Data)=>n+event.q,0);
    return sum+Number((BigInt(Math.max(0,line.q-cancelled-closed))*BigInt(line.unitMinor)+500n)/1000n);
   },0);
   faceMinor=base?Number((BigInt(issued.totalMinor)*BigInt(remaining)+BigInt(base)/2n)/BigInt(base)):issued.totalMinor;
  }
  const committedMinor=Math.max(0,faceMinor-actualMinor),reservedMinor=Math.max(0,ledger-Math.max(faceMinor,actualMinor));
  if(!issued) sources.push({request:request.id,title:request.title,order:null,number:null,reservedMinor:Math.max(0,ledger),committedMinor:0,actualMinor,invoiceIds:bills.map(bill=>bill.id),depositIds:deposits.map(deposit=>deposit.id)});
  else sources.push({request:request.id,title:request.title,order:issued.id,number:issued.number,reservedMinor,committedMinor,actualMinor,invoiceIds:bills.map(bill=>bill.id),depositIds:deposits.map(deposit=>deposit.id)});
 }
 const total=(field:string)=>sources.reduce((sum,source)=>sum+source[field],0);
 const reservedMinor=total('reservedMinor'),committedMinor=total('committedMinor'),actualMinor=total('actualMinor');
 return {id:policy.id,name:policy.name,currency:policy.currency,from:policy.budgetPeriod?.from,through:policy.budgetPeriod?.through,department:policy.costCentre??'*',amountMinor:policy.budgetMinor,reservedMinor,committedMinor,actualMinor,availableMinor:policy.budgetMinor-reservedMinor-committedMinor-actualMinor,sources,basis:'Recorded invoice and imported-deposit evidence; not a matched, synced or paid claim'};
}
export function budgetPeriod(input: Data, prior?: Data) {
 const value=input.budgetPeriod===undefined?prior?.budgetPeriod:input.budgetPeriod;
 if(value===undefined||value===null)return undefined;
 const from=date(value.from,'Budget period start'),through=date(value.through,'Budget period end');
 requireThat(from<=through&&Date.parse(through)-Date.parse(from)<367*86400000,'Budget period must be at most one fiscal year');
 return {from,through};
}
export function budgetRoom(s: State, request: Data, policy: Data, delta: number) {
 if(delta<=0)return true;
 if(request.amends){const prior=get(s,'order',request.amends);if(policy.budgetPeriod||s.get('policy:'+prior.policy)?.value.budgetPeriod)requireThat(prior.policy===policy.id,'Cross-period budget amendments require an explicit remaining-balance disposition',409);}
 if(!policy.budgetPeriod)return undefined;
 const position=periodBudgetPosition(s,policy);
 return position.availableMinor>=delta;
}
