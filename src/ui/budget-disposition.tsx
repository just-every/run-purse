import { useState } from 'react';
import { call, Details, Field, Form, Table, money, type D } from './shared';

/** Uses the order's existing review disclosure and record forms. */
export function BudgetDisposition({order,data,actor,mutate}:{order:D;data:D;actor:D;mutate:(op:string,input:D)=>Promise<any>}) {
 const [review,setReview]=useState<D|null>(null);
 if(!actor.roles.includes('owner') || !['issued','amendment-pending'].includes(order.status) || order.adoptionBasis || order.lines.some((line:D)=>line.service))return null;
 const request=data.request.find((row:D)=>row.id===order.request);
 if(!request)return null;
 const name=(id:string)=>data.periodBudgets.find((row:D)=>row.id===id)?.name ?? id;
 return <Details label="Move commitment to another budget period"><section aria-label="Budget period disposition"><p>Review unchanged, wholly unreceived and unbilled goods. Purchase approval and every destination budget owner must approve again. The old commitment stays until amendment issuance.</p>
  <Form label="Preview budget disposition" initial={{id:order.id,revision:request.revision}} onSubmit={async input=>{setReview(null);setReview(await call('command/budget-disposition-preview',input));}}>
   <Field label="Destination need date" name="needDate" type="date"/>
  </Form>
  {review && <><h4>Reviewed budget movement</h4><p>Same remaining commitment: {money(review.amountMinor,review.currency)} · Destination date {review.needDate}</p>
   <Table heads={['Movement','Budget','Commitment']} figures={['Commitment']}>{['source','destination'].flatMap(side=>review[side].map((share:D)=><tr key={side+share.policy}><td>{side==='source'?'Release on issuance':'Commit on issuance'}</td><td>{name(share.policy)}</td><td>{money(share.amountMinor,review.currency)}</td></tr>))}</Table>
   <p>Destination budget amounts stay unchanged. Insufficient capacity refuses the move.</p>
   <Form label="Prepare reviewed budget amendment" initial={{id:order.id,revision:review.sourceRevision,needDate:review.needDate,review:review.review}} onSubmit={async input=>{await mutate('budget-disposition-amend',{...input,consent:input.consent==='yes'});setReview(null);}}>
    <Field label="Budget disposition reason" name="reason"/>
    <label className="field"><span><input type="checkbox" name="consent" value="yes" required/> I reviewed these exact source and destination allocations</span></label>
   </Form></>}
 </section></Details>;
}
