import { ReviewConfiguration } from './request-reviews';
import { useState } from 'react';
import { Form, Field, type D } from './shared';

function Definitions({label,value,change}:{label:string;value:D[];change:(value:D[])=>void}) {
    const edit=(index:number,key:string,next:any)=>change(value.map((field,i)=>i===index?{...field,[key]:next}:field));
    return <fieldset className="wide"><legend>{label}</legend>{value.map((field,index)=><div className="line" key={index}>
        <label>Field key<input required value={field.id} onChange={e=>edit(index,'id',e.target.value)}/></label>
        <label>Label<input required value={field.label} onChange={e=>edit(index,'label',e.target.value)}/></label>
        <label>Answer type<select aria-label="Answer type" value={field.type} onChange={e=>edit(index,'type',e.target.value)}><option value="text">Text</option><option value="choice">Choice</option></select></label>
        {field.type==='choice'&&<label>Choices, one per line<textarea required value={(field.options??[]).join('\n')} onChange={e=>edit(index,'options',e.target.value.split('\n'))}/></label>}
        <label>Required<input type="checkbox" checked={field.required} onChange={e=>edit(index,'required',e.target.checked)}/></label>
        <label>Active<input type="checkbox" checked={field.active!==false} onChange={e=>edit(index,'active',e.target.checked)}/></label>
        <label>Show when<select aria-label="Show when" value={field.when?.field??''} onChange={e=>edit(index,'when',e.target.value?{field:e.target.value,equals:''}:undefined)}><option value="">Always</option>{value.slice(0,index).filter(f=>f.type==='choice').map(f=><option value={f.id} key={f.id}>{f.label}</option>)}</select></label>
        {field.when&&<label>Equals<select aria-label="Equals" required value={field.when.equals} onChange={e=>edit(index,'when',{...field.when,equals:e.target.value})}><option value="">Choose…</option>{value.find(f=>f.id===field.when.field)?.options.map((v:string)=><option key={v}>{v}</option>)}</select></label>}
        <button type="button" onClick={()=>change(value.filter((_,i)=>i!==index))}>Remove field</button>
    </div>)}<button type="button" onClick={()=>change([...value,{id:'',label:'',type:'text',required:false,active:true,options:[]}])}>Add {label.toLowerCase()}</button></fieldset>;
}
export function SplitEditor({value,change,business}:{value:D[];change:(value:D[])=>void;business:D}) {
    return <fieldset className="wide"><legend>Cost split</legend>{value.map((part,index)=><div className="line" key={index}>
        {['costCentre','project'].map(key=><label key={key}>{key==='costCentre'?'Split cost centre':'Split project'}<select aria-label={key==='costCentre'?'Split cost centre':'Split project'} required value={part[key]} onChange={e=>change(value.map((v,i)=>i===index?{...v,[key]:e.target.value}:v))}><option value="">Choose…</option>{business[key==='costCentre'?'costCentres':'projects'].map((v:string)=><option key={v}>{v}</option>)}</select></label>)}
        <label>Share percent<input type="number" min="0.01" max="100" step="0.01" required value={part.basisPoints/100} onChange={e=>change(value.map((v,i)=>i===index?{...v,basisPoints:Math.round(Number(e.target.value)*100)}:v))}/></label>
        <button type="button" onClick={()=>change(value.filter((_,i)=>i!==index))}>Remove share</button>
    </div>)}<button type="button" onClick={()=>change([...value,{costCentre:'',project:'',basisPoints:10000}])}>Add split share</button></fieldset>;
}
export function IntakeSettings({data,mutate}:{data:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const [reviews,setReviews]=useState<D[]>([]),[selected,setSelected]=useState<D>({}),[questions,setQuestions]=useState<D[]>([]),[header,setHeader]=useState<D[]>([]),[line,setLine]=useState<D[]>([]),[split,setSplit]=useState<D[]>([]),[serial,setSerial]=useState(0);
    const select=(form:D)=>{setSelected(form);setReviews(form.reviews??[]);setQuestions(form.questions??[]);setHeader(form.headerFields??[]);setLine(form.lineFields??[]);setSplit(form.defaults?.allocations??[]);setSerial(serial+1);};
    if(!data.mayConfigureIntake)return null;
    const business=data.business[0];if(!business)return null;
    return <section className="panel" aria-label="Category form configuration"><h2>Category forms</h2><p>Publish a short form with conditional questions, required files and default coding. Existing submitted answers remain on their revision.</p>
        <label>Existing form<select aria-label="Existing form" value={selected.id??''} onChange={e=>select(data.intakeForm.find((f:D)=>f.id===e.target.value)??{})}><option value="">New form</option>{data.intakeForm.map((f:D)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <Form key={serial} label="Publish category form" onSubmit={async b=>{const result=await mutate('intake-form',{id:selected.id,version:selected.version,name:b.name,purchaseType:b.purchaseType,active:b.active==='on',consent:b.consent==='on',reviews,questions,headerFields:header,lineFields:line,requiredFiles:b.files.split('\n').map((v:string)=>v.trim()).filter(Boolean),defaults:{category:b.category,location:b.location,costCentre:b.costCentre,project:b.project,currency:b.currency,allocations:split}});select(result);}}>
            <Field label="Form name" name="name" defaultValue={selected.name}/><Field label="Purchase type" name="purchaseType" defaultValue={selected.purchaseType??'goods'} options={['goods','software','services','contractors','equipment'].map(value=>({value,label:value}))}/>
            <Field label="Default category" name="category" defaultValue={selected.defaults?.category}/>
            {Object.entries({currency:'currencies',location:'locations',costCentre:'costCentres',project:'projects'}).map(([key,list])=><Field key={key} label={'Default '+(key==='costCentre'?'cost centre':key)} name={key} defaultValue={selected.defaults?.[key]} required={false} options={business[list].map((value:string)=>({value,label:value}))}/>)}
            <SplitEditor value={split} change={setSplit} business={business}/>
            <ReviewConfiguration value={reviews} change={setReviews} members={data.member??[]}/>
            <Definitions label="Questions" value={questions} change={setQuestions}/><Definitions label="Header fields" value={header} change={setHeader}/><Definitions label="Line fields" value={line} change={setLine}/>
            <Field label="Required filename contains, one per line" name="files" type="textarea" required={false} defaultValue={selected.requiredFiles?.join('\n')}/>
            <label>Active<input type="checkbox" name="active" defaultChecked={selected.active!==false}/></label><label>Publish for requesters<input type="checkbox" name="consent" required/></label>
        </Form>
    </section>;
}
