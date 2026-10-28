import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';
/** Drafts are private content, never restored authentication or purchasing authority. */
export function validateIntake(all,get,check) {
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const fields=list=>Array.isArray(list)&&list.length<=30&&new Set(list.map(f=>f.id)).size===list.length&&list.every((f,index)=>/^[a-z][a-z0-9_]*$/.test(f.id)&&typeof f.label==='string'&&!containsProtectedInput({field:f.id})&&!containsProtectedInput({field:f.label})&&['text','choice','number','date','boolean'].includes(f.type)&&typeof f.active==='boolean'&&Array.isArray(f.options)&&(f.inactiveOptions===undefined||Array.isArray(f.inactiveOptions)&&f.inactiveOptions.every(value=>f.options.includes(value)))&&(!f.when||list.slice(0,index).some(prior=>prior.id===f.when.field&&prior.type==='choice'&&prior.options.includes(f.when.equals))));
 const shares=(list,total)=>{
  check(Array.isArray(list)&&list.length<=20,'intake_splits');if(!list.length)return;
  check(list.every(x=>typeof x.costCentre==='string'&&typeof x.project==='string'&&Number.isInteger(x.basisPoints)&&x.basisPoints>0)&&list.reduce((n,x)=>n+x.basisPoints,0)===10000,'intake_split_shares');
  if(total!==undefined){
   const amounts=list.map(x=>Number(BigInt(total)*BigInt(x.basisPoints)/10000n)),ranked=list.map((x,index)=>({index,remainder:BigInt(total)*BigInt(x.basisPoints)%10000n})).sort((a,b)=>Number(b.remainder-a.remainder)||a.index-b.index);
   ranked.slice(0,total-amounts.reduce((n,x)=>n+x,0)).forEach(x=>amounts[x.index]++);
   check(list.every((x,index)=>x.amountMinor===amounts[index]),'intake_split_amounts');
  }
 };
 for(const form of all('intakeForm')){
  check(Number.isSafeInteger(form.version)&&form.version>0&&typeof form.name==='string'&&['goods','software','services','contractors','equipment'].includes(form.purchaseType),'intake_form');
  check(fields(form.questions)&&fields(form.headerFields)&&fields(form.lineFields)&&Array.isArray(form.requiredFiles)&&form.requiredFiles.every(x=>typeof x==='string')&&object(form.defaults),'intake_form_fields');shares(form.defaults.allocations);
  check(all('audit').some(e=>e.action==='intake-form'&&e.record===form.id&&e.version===form.version&&e.consent===true),'intake_form_publication');
 }
 for(const invoice of all('invoice'))if(invoice.intakeForm){
  const order=get('order',invoice.order);
  check(invoice.sourceOrderRevision===order.revision,'invoice_custom_source');
  for(const key of ['intakeForm','intakeFormVersion','intakeFormSnapshot','customFields'])check(same(invoice[key],order[key]),'invoice_custom_header');
  for(const allocation of invoice.allocations)check(allocation.sourceOrderRevision===order.revision&&same(allocation.customFields,order.lines.find(line=>line.id===allocation.line)?.customFields),'invoice_custom_line');
 }
 for(const draft of all('intakeDraft')){
  get('intakeForm',draft.fields?.intakeForm);
  check(typeof draft.requester==='string'&&typeof draft.requesterEmail==='string'&&object(draft.fields)&&Array.isArray(draft.fields.lines)&&Number.isSafeInteger(draft.version)&&draft.version>0&&['draft','completed'].includes(draft.status),'intake_draft');
  check(!containsProtectedInput(draft.fields),'intake_draft_protected');
  check(!['policy','decision','integration','emailIntake','id','status','revision'].some(key=>Object.hasOwn(draft.fields,key)),'intake_draft_authority');
  if(draft.emailIntake)check(get('emailIntake',draft.emailIntake).requester===draft.requester&&Number.isSafeInteger(draft.emailIntakeVersion)&&draft.emailIntakeVersion>0&&draft.emailIntakeVersion<=get('emailIntake',draft.emailIntake).version,'intake_email_assignment');
  if(draft.status==='completed')check(get('request',draft.request).requester===draft.requester&&all('audit').some(e=>e.action==='intake-complete'&&e.record===draft.request&&e.draft===draft.id&&e.consent===true),'intake_completion');
 }
 for(const proposal of all('supplierProposal')){
  get('supplier',proposal.supplier);
  check(proposal.id===proposal.supplier&&proposal.status==='pending'&&proposal.consent===true&&typeof proposal.requester==='string'&&typeof proposal.contactEmail==='string'&&typeof proposal.reason==='string','intake_supplier_proposal');
  check(all('audit').some(e=>e.action==='supplier-proposal'&&e.record===proposal.id&&e.consent===true),'intake_supplier_proposal_audit');
 }
 for(const kind of ['request','revision','order'])for(const request of all(kind)){
  for(const line of request.lines??[])if(line.allocations)shares(line.allocations,line.totalMinor);
  if(!request.intakeForm)continue;
  get('intakeForm',request.intakeForm);const snapshot=request.intakeFormSnapshot;
  check(snapshot?.id===request.intakeForm&&snapshot.version===request.intakeFormVersion&&fields(snapshot.questions)&&fields(snapshot.headerFields)&&fields(snapshot.lineFields)&&object(request.answers)&&object(request.customFields),'intake_revision_fields');
  for(const [values,defs]of [[request.answers,snapshot.questions],[request.customFields,snapshot.headerFields],...request.lines.map(line=>[line.customFields,snapshot.lineFields])])check(object(values)&&Object.entries(values).every(([key,value])=>defs.some(f=>f.id===key&&f.active&&typeof value==='string'&&(f.type!=='choice'||f.options.includes(value)&&!(f.inactiveOptions??[]).includes(value))&&(f.type!=='number'||/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=Number.MAX_SAFE_INTEGER)&&(f.type!=='date'||/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)&&(f.type!=='boolean'||['Yes','No'].includes(value)))),'intake_revision_answers');
  if(kind==='request'){
   const revision=get('revision',request.id+':'+request.revision);
   for(const key of ['intakeForm','intakeFormVersion','intakeFormSnapshot','answers','customFields','attachmentIds'])check(same(request[key],revision[key]),'intake_revision_snapshot');
  }
  for(const id of request.attachmentIds??[])check(get('attachment',id).record===(kind==='revision'?request.request:request.id),'intake_revision_files');
 }
}
