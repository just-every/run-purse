import { Details, Field, Form, Table, when, type D } from './shared';
import {correctionNames as names} from './approver-edit-rules';
function correctionChanges(input:D,current:D) {
 const changed=(before:D,prefix='')=>Object.fromEntries(Object.keys(names).filter(field=>input[prefix+field]!==undefined&&String(input[prefix+field]).trim()!==String(before[field]??'')).map(field=>[field,input[prefix+field]]));
 const lines=current.lines.map((line:D)=>({id:line.id,...changed(line,'line:'+line.id+':')})).filter((line:D)=>Object.keys(line).length>1);
 return {...changed(current),...(lines.length?{lines}:{})};
}
export function PendingHeaderEdit({current,data,mutate}:{current:D;data:D;mutate:(op:string,input:D)=>Promise<any>}) {
 const edit=current.approverEdit,business=data.business[0];
 const fields=(value:D,prefix='',lineNumber?:number)=>Object.entries(names).filter(([field])=>current.approverEditRule.allowed.includes(field)).map(([field,label])=>{
  const options=field==='supplier'?data.supplier.filter((supplier:D)=>['active','preferred'].includes(supplier.status)&&!supplier.mergedInto).map((supplier:D)=>({value:supplier.id,label:supplier.name})):['costCentre','location','project'].includes(field)?business[({costCentre:'costCentres',location:'locations',project:'projects'} as D)[field]].map((value:string)=>({value,label:value})):undefined;
  return <Field key={field} name={prefix+field} label={lineNumber?'Correct line '+lineNumber+' '+label:'Correct '+label} type={field==='needDate'?'date':'text'} defaultValue={value[field]??''} required={false} options={options?[{value:'',label:'Not set'},...options]:undefined}/>;
 });
 return <>
 {current.approvalRoute && <section aria-label="Approval steps"><h3>Approval steps · revision {current.revision}</h3><ol>{current.approvalRoute.map((step:D)=><li key={step.id}>{step.email} · {data.decision.some((decision:D)=>decision.request===current.id&&decision.revision===current.revision&&decision.chainStep===step.id&&decision.decision==='approved')?'Approved':current.approvalHolder===step.email?'Waiting for decision':'Not yet approved'}</li>)}</ol>{current.approvalHolder&&<p>Current holder: {current.approvalHolder}</p>}</section>}
 {edit && <section aria-label="Approver revision changes"><h3>Approver revision changes</h3>{edit.snapshotBasis&&<p>{edit.snapshotBasis}</p>}<p>{edit.email} · {when(edit.at)} · revision {edit.fromRevision} → {current.revision} · {edit.reason}</p><Table heads={['Field','Before','After']}>{edit.differences.map((difference:D)=><tr key={difference.field}><td>{difference.line?'Line '+difference.lineDescription+' · ':''}{names[difference.codingField??difference.field]??difference.field}</td><td>{difference.before??'Not set'}</td><td>{difference.after}</td></tr>)}</Table>{edit.detailsRestricted?<p>Earlier approval details are outside your current purchase scope.</p>:<p>{edit.carried.length} earlier approval(s) carried forward; {edit.renewed.length} asked again. Each decision applies to this exact revision.</p>}</section>}
 {current.status==='pending' && current.mayApprove && current.approverEditRule && <Details label="Correct header and coding"><Form label="Save approver corrections" initial={{id:current.id,revision:current.revision}} onSubmit={input=>mutate('approver-edit',{id:current.id,revision:current.revision,changes:correctionChanges(input,current),reason:input.reason})}>
 <p>Review the new revision before deciding. Material changes renew affected approvals and move the budget reservation together.</p>
 {fields(current)}
 {current.lines.map((line:D,index:number)=><fieldset className="wide" key={line.id}><legend>Line {index+1} · {line.description}</legend>{fields(line,'line:'+line.id+':',index+1)}</fieldset>)}
 <Field label="Correction reason" name="reason"/>
 </Form></Details>}
 </>;
}
