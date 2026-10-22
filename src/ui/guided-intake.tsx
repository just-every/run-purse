import { useEffect, useRef, useState } from 'react';
import { call, amountText, type D } from './shared';
import { shown } from '../purse/intake-fields';
import { SplitEditor } from './intake-settings';

export function AnswerFields({definitions,value,change}:{definitions:D[];value:D;change:(value:D)=>void}) {
    return <>{definitions.filter(field=>field.active&&shown(field,value)).map(field=><label key={field.id} className="field">{field.label}{field.type==='choice'?<select required={field.required} value={value[field.id]??''} onChange={e=>change({...value,[field.id]:e.target.value})}><option value="">Choose…</option>{field.options.map((v:string)=><option key={v}>{v}</option>)}</select>:<input required={field.required} value={value[field.id]??''} onChange={e=>change({...value,[field.id]:e.target.value})}/>}</label>)}</>;
}
export function GuidedIntake({data,mutate,intake}:{data:D;mutate:(op:string,b:D)=>Promise<any>;intake?:D}) {
    const [selected,setSelected]=useState(''),[serial,setSerial]=useState(0),[resuming,setResuming]=useState<D>();
    const forms=(data.intakeForm??[]).filter((form:D)=>form.active), drafts=(data.intakeDraft??[]).filter((draft:D)=>intake?draft.emailIntake===intake.id:!draft.emailIntake);
    const draft=drafts.find((draft:D)=>draft.id===selected)??(resuming?.id===selected?resuming:undefined),form=forms.find((form:D)=>form.id===(draft?.fields.intakeForm??selected));
    if(!forms.length)return null;
    return <section className="panel" aria-label="Guided purchase intake"><h3>Purchase by category</h3>
        <label>Start a category request<select value={form&&!draft?form.id:''} onChange={e=>{setSelected(e.target.value);setResuming(undefined);setSerial(serial+1);}}><option value="">Choose a form…</option>{forms.map((form:D)=><option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
        {drafts.length>0&&<ul>{drafts.map((draft:D)=><li key={draft.id}><button type="button" onClick={()=>{setSelected(draft.id);setResuming(draft);setSerial(serial+1);}}>Resume {draft.fields.title||'Untitled draft'}</button></li>)}</ul>}
        {form&&<GuidedForm key={serial} data={data} form={form} initial={draft} intake={intake} mutate={mutate}/>}
    </section>;
}
function GuidedForm({data,form,initial,intake,mutate}:{data:D;form:D;initial?:D;intake?:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const business=data.business[0],defaults=form.defaults;
    const blankLine=()=>({description:'',quantity:'1',unitAmount:'',category:defaults.category,project:defaults.project,allocations:structuredClone(defaults.allocations),customFields:{}});
    const [fields,setFields]=useState<D>(initial?.fields??{title:intake?.title??'',intakeForm:form.id,supplier:'',currency:defaults.currency||business.currencies[0],location:defaults.location,costCentre:defaults.costCentre,needDate:'',terms:'',freightAmount:'0',taxAmount:'0',answers:{},customFields:{},lines:[blankLine()]}),
        [status,setStatus]=useState(initial?'Saved draft':'Saving draft…'),[error,setError]=useState(''),[route,setRoute]=useState<D>(),[completed,setCompleted]=useState<D>(),
        [files,setFiles]=useState<D[]>(data.attachment.filter((file:D)=>file.kind==='intakeDraft'&&file.record===initial?.id)),[proposal,setProposal]=useState<D>({name:'',contactName:'',contactEmail:'',address:'',website:'',phone:'',category:defaults.category,reason:'',consent:false}),[proposing,setProposing]=useState(false);
    const saved=useRef<D|undefined>(initial),last=useRef(initial?JSON.stringify(initial.fields):''),queue=useRef<Promise<any>>(Promise.resolve()),latest=useRef(fields);latest.current=fields;
    const enqueue=(work:()=>Promise<any>)=>{const next=queue.current.catch(()=>{}).then(work);queue.current=next;return next;};
    const save=(value:D)=>enqueue(async()=>{
        if(saved.current&&last.current===JSON.stringify(value))return saved.current;
        setStatus('Saving draft…');
        const next=await call('command/intake-draft',{id:saved.current?.id,version:saved.current?.version,fields:value,...(intake?{emailIntake:intake.id,emailIntakeVersion:intake.version}:{})});
        saved.current=next;last.current=JSON.stringify(value);setStatus(JSON.stringify(latest.current)===last.current?'Saved draft':'Unsaved changes');return next;
    });
    const run=async(work:()=>Promise<any>)=>{setError('');try{return await work();}catch(e){setError((e as Error).message);setStatus('Draft needs attention');}};
    useEffect(()=>{if(completed)return;setStatus('Unsaved changes');const timer=setTimeout(()=>{void run(()=>save(fields));},400);return()=>clearTimeout(timer);},[fields,completed]);
    useEffect(()=>{
        const leaving=(event:BeforeUnloadEvent)=>{if(last.current!==JSON.stringify(latest.current)){event.preventDefault();event.returnValue='';}};
        window.addEventListener('beforeunload',leaving);
        return()=>{window.removeEventListener('beforeunload',leaving);if(last.current!==JSON.stringify(latest.current))void run(()=>save(latest.current));};
    },[]);
    const edit=(key:string,value:any)=>{setFields(v=>({...v,[key]:value}));setRoute(undefined);};
    const lineEdit=(index:number,key:string,value:any)=>edit('lines',fields.lines.map((line:D,i:number)=>i===index?{...line,[key]:value}:line));
    const preview=()=>run(async()=>{const draft=await save(latest.current);setRoute(await call('command/intake-route',{id:draft.id,version:draft.version}));});
    if(completed)return <section aria-label="Completed category draft"><p role="status">{completed.status==='pending'?'Submitted for approval':'Purchase request draft created; not submitted'}</p>{completed.status==='draft'&&<button type="button" onClick={()=>run(async()=>setCompleted(await mutate('submit',{id:completed.id,revision:completed.revision})))}>Submit for approval</button>}{error&&<p role="alert">{error}</p>}</section>;
    const field=(key:string,label:string,options?:string[],type='text')=><label className="field">{label}{options?<select required value={fields[key]??''} onChange={e=>edit(key,e.target.value)}><option value="">Choose…</option>{options.map(value=><option key={value}>{value}</option>)}</select>:<input required type={type} value={fields[key]??''} onChange={e=>edit(key,e.target.value)}/>}</label>;
    return <form className="record-form" aria-label="Category request form" onSubmit={e=>{e.preventDefault();void run(async()=>{const draft=await save(latest.current);const result=await mutate('intake-complete',{id:draft.id,version:draft.version,consent:true});setCompleted(result);});}}>
        <p className="wide" role="status">{status} · answers and uploaded files are saved to your account. Nothing submits automatically.</p>
        {field('title','Request title')}{field('needDate','Need date',undefined,'date')}
        <label className="field">Supplier<select required value={fields.supplier??''} onChange={e=>edit('supplier',e.target.value)}><option value="">Choose…</option>{data.supplier.filter((s:D)=>!s.mergedInto&&s.status!=='blocked'&&(s.status!=='proposed'||s.id===fields.supplier)).map((s:D)=><option key={s.id} value={s.id}>{s.name}{s.status==='proposed'?' · pending supplier review':''}</option>)}{fields.supplier&&!data.supplier.some((s:D)=>s.id===fields.supplier)&&<option value={fields.supplier}>{proposal.name} · pending supplier review</option>}</select></label>
        <label className="field">Supplier not in the register<input value={proposal.name} onChange={e=>{setProposal({...proposal,name:e.target.value});setProposing(Boolean(e.target.value));}}/></label>
        {proposing&&<fieldset className="wide"><legend>Propose a new supplier</legend>{['contactName','contactEmail','address','website','phone','category','reason'].map(key=><label key={key}>{({contactName:'Contact name',contactEmail:'Contact email',address:'Address',website:'Website',phone:'Phone',category:'Supplier category',reason:'Why this supplier'} as D)[key]}<input value={proposal[key]} onChange={e=>setProposal({...proposal,[key]:e.target.value})}/></label>)}<label>Request supplier review<input type="checkbox" checked={proposal.consent} onChange={e=>setProposal({...proposal,consent:e.target.checked})}/></label><button type="button" onClick={()=>run(async()=>{await save(latest.current);await enqueue(async()=>{const next=await call('command/intake-draft',{id:saved.current!.id,version:saved.current!.version,fields:latest.current,proposal,...(intake?{emailIntake:intake.id,emailIntakeVersion:intake.version}:{})});saved.current=next;last.current=JSON.stringify(next.fields);setFields(next.fields);setProposing(false);setStatus('Saved draft');});})}>Save pending supplier</button></fieldset>}
        {field('currency','Currency',business.currencies)}{field('location','Location',business.locations)}{field('costCentre','Cost centre',business.costCentres)}
        <AnswerFields definitions={form.questions} value={fields.answers??{}} change={value=>edit('answers',value)}/><AnswerFields definitions={form.headerFields} value={fields.customFields??{}} change={value=>edit('customFields',value)}/>
        {fields.lines.map((line:D,index:number)=><fieldset className="wide" key={index}><legend>Item {index+1}</legend>
            <label>Catalogue item<select value={line.catalogue??''} onChange={e=>{const item=data.catalogue.find((item:D)=>item.id===e.target.value);if(item)setFields(v=>({...v,supplier:item.supplier,currency:item.currency,lines:v.lines.map((old:D,i:number)=>i===index?{...old,catalogue:item.id,description:item.description,unitAmount:amountText(item.unitMinor),category:item.category,project:item.project||old.project}:old)}));}}><option value="">Custom item or service</option>{data.catalogue.filter((item:D)=>item.requestable).map((item:D)=><option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
            {['description','quantity','unitAmount'].map(key=><label key={key}>{({description:'Description',quantity:'Quantity',unitAmount:'Unit price'} as D)[key]}<input required readOnly={Boolean(line.catalogue&&key==='unitAmount')} value={line[key]??''} onChange={e=>lineEdit(index,key,e.target.value)}/></label>)}
            <details><summary>Coding and cost split</summary><label>Category<input required value={line.category} onChange={e=>lineEdit(index,'category',e.target.value)}/></label><label>Project<select required value={line.project} onChange={e=>lineEdit(index,'project',e.target.value)}><option value="">Choose…</option>{business.projects.map((value:string)=><option key={value}>{value}</option>)}</select></label><SplitEditor business={business} value={line.allocations??[]} change={value=>lineEdit(index,'allocations',value)}/></details>
            <AnswerFields definitions={form.lineFields} value={line.customFields??{}} change={value=>lineEdit(index,'customFields',value)}/>
            {fields.lines.length>1&&<button type="button" onClick={()=>edit('lines',fields.lines.filter((_:D,i:number)=>i!==index))}>Remove item</button>}
        </fieldset>)}<button type="button" onClick={()=>edit('lines',[...fields.lines,blankLine()])}>Add item</button>
        {field('terms','Supplier-supplied terms')}<details className="wide"><summary>Freight and supplied tax</summary>{field('freightAmount','Freight')}{field('taxAmount','Supplied tax')}</details>
        <section className="wide"><h4>Files</h4>{form.requiredFiles.length>0&&<p>Required before submission: {form.requiredFiles.join(', ')}</p>}{files.map(file=><p key={file.id}><a href={'/api/purse/download/attachment/'+file.id}>{file.name}</a></p>)}<label>Attach a file (up to 1 MB)<input type="file" onChange={e=>{const file=e.target.files?.[0];if(!file)return;void run(async()=>{await save(latest.current);await enqueue(async()=>{let raw='';for(const byte of new Uint8Array(await file.arrayBuffer()))raw+=String.fromCharCode(byte);const next=await call('command/intake-draft-file',{id:saved.current!.id,version:saved.current!.version,name:file.name,mediaType:file.type||'application/octet-stream',base64:btoa(raw)});saved.current=next;setFiles(values=>[...values,next.file]);setStatus('Saved draft');});});}}/></label></section>
        <button type="button" onClick={preview}>Preview approval route</button>{route&&<section className="wide" aria-label="Predicted approval route"><h4>Predicted approval route</h4><ol>{route.steps.map((step:D,i:number)=><li key={i}>{step.label} · {step.approver??step.authority}</li>)}</ol><p>{route.message}</p></section>}
        <div className="form-end"><button type="button" onClick={()=>run(()=>save(latest.current))}>Save unfinished draft</button><button className="btn-primary">Create purchase request draft</button>{error&&<p role="alert">{error}</p>}</div>
    </form>;
}
