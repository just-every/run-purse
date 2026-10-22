import { Details, Field, Form, Table, when, type D } from './shared';
const names:D={glAccount:'GL account',costCentre:'Department',location:'Location',class:'Class',project:'Project',needDate:'Need date',shipTo:'Ship to',notes:'Notes to supplier'};
export function PendingHeaderEdit({current,data,mutate}:{current:D;data:D;mutate:(op:string,input:D)=>Promise<any>}) {
 const edit=current.approverEdit,business=data.business[0];
 return <>
 {current.approvalRoute && <section aria-label="Approval steps"><h3>Approval steps · revision {current.revision}</h3><ol>{current.approvalRoute.map((step:D)=><li key={step.id}>{step.email} · {data.decision.some((decision:D)=>decision.request===current.id&&decision.revision===current.revision&&decision.chainStep===step.id&&decision.decision==='approved')?'Approved':current.approvalHolder===step.email?'Waiting for decision':'Not yet approved'}</li>)}</ol></section>}
 {edit && <section aria-label="Approver revision changes"><h3>Approver revision changes</h3><p>{edit.email} · {when(edit.at)} · revision {edit.fromRevision} → {current.revision} · {edit.reason}</p><Table heads={['Field','Before','After']}>{edit.differences.map((difference:D)=><tr key={difference.field}><td>{names[difference.field]??difference.field}</td><td>{difference.before??'Not set'}</td><td>{difference.after}</td></tr>)}</Table><p>{edit.carried.length} earlier approval(s) carried forward; {edit.renewed.length} asked again. Each decision applies to this exact revision.</p></section>}
 {current.status==='pending' && current.mayApprove && current.approverEditRule && <Details label="Correct header and coding"><Form label="Save approver corrections" initial={{id:current.id,revision:current.revision}} onSubmit={input=>{const changes=Object.fromEntries(Object.keys(names).filter(field=>input[field]!==undefined&&String(input[field]).trim()!==String(current[field]??'')).map(field=>[field,input[field]]));return mutate('approver-edit',{id:current.id,revision:current.revision,changes,reason:input.reason});}}>
 <p>Review the new revision before deciding. Material changes renew affected approvals and move the budget reservation together.</p>
 {Object.entries(names).filter(([field])=>current.approverEditRule.allowed.includes(field)).map(([field,label])=><Field key={field} name={field} label={'Correct '+label} type={field==='needDate'?'date':'text'} defaultValue={current[field]??''} required={false} options={['costCentre','location','project'].includes(field)?business[({costCentre:'costCentres',location:'locations',project:'projects'} as D)[field]].map((value:string)=>({value,label:value})):undefined}/>)}
 <Field label="Correction reason" name="reason"/>
 </Form></Details>}
 </>;
}
