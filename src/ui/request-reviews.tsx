import { Details, Field, Form, when, type D } from './shared';

export function RequestReviews({current,data,mutate}:{current:D;data:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const reviews=current.crossTeamReviews;
    if(!reviews?.rows.length && !reviews?.required) return null;
    return <section aria-label="Cross-team reviews"><h3>Cross-team reviews</h3>
        <p>{reviews.complete ? 'Required reviews approved for this revision.' : 'Purchase approval waits for every required review.'} Review decisions do not approve the purchase.</p>
        {reviews.rows.map((row:D)=><Details key={row.id} label={`${row.type.toUpperCase()} review · revision ${row.revision} · stage ${row.stage} · ${!row.current ? 'Historical' : row.satisfied ? 'Approved' : row.events.at(-1)?.decision === 'rejected' ? 'Rejected' : 'Review required'}`}>
            <p>Assigned to {row.reviewer}</p>
            {row.current && !row.satisfied && row.events.at(-1)?.decision === 'approved' && <p>Fresh reviewer authority is required. Restored or revoked history cannot authorize purchasing.</p>}
            <ol>{row.events.map((event:D)=><li key={event.version}><p>{event.decision} · {when(event.at)}</p><p>{event.body}</p><ul>{event.files.map((id:string)=>{const file=data.attachment.find((f:D)=>f.id===id);return file&&<li key={id}><a href={'/api/purse/download/attachment/'+id}>{file.name}</a> · {file.size} bytes</li>;})}</ul></li>)}</ol>
            {row.mayReview && <Form key={row.version} label={'Record '+row.type+' review'} onSubmit={async b=>{
                const file=b.file as File;let attachment;
                if(file?.size) { const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>1000000)throw new Error('Review file must contain up to 1 MB of bytes');let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);attachment={name:file.name,mediaType:file.type||'application/octet-stream',base64:btoa(raw)}; }
                return mutate('cross-review-record',{id:row.id,revision:current.revision,version:row.version,decision:b.decision,body:b.body,...(attachment?{file:attachment}:{})});
            }}><Field label="Review outcome" name="decision" options={[{value:'question',label:'Question — review remains open'},{value:'approved',label:'Approve review'},{value:'rejected',label:'Reject review'}]}/><Field label="Review questions or decision notes" name="body" type="textarea"/><label>Review file (up to 1 MB)<input type="file" name="file"/></label></Form>}
        </Details>)}
    </section>;
}

export function ReviewConfiguration({value,change,members}:{value:D[];change:(rows:D[])=>void;members:D[]}) {
    const edit=(index:number,key:string,next:any)=>change(value.map((row,i)=>i===index?{...row,[key]:next}:row));
    return <fieldset className="wide"><legend>Required cross-team reviews</legend><p>Reviews in the same stage run in parallel. Earlier stages must approve before later reviewers respond. Assignments require existing request access.</p>
        {value.map((row,index)=><div className="line" key={index}>
            <label>Review team<select aria-label="Review team" required value={row.type} onChange={e=>edit(index,'type',e.target.value)}>{['security','privacy','it','legal','finance'].map(type=><option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label>
            <label>Assigned reviewer<select aria-label="Assigned reviewer" required value={row.reviewer} onChange={e=>edit(index,'reviewer',e.target.value)}><option value="">Choose member…</option>{members.filter(m=>m.active).map(member=><option key={member.email} value={member.email}>{member.name}</option>)}</select></label>
            <label>Review stage<input type="number" min="1" max="5" required value={row.stage} onChange={e=>edit(index,'stage',Number(e.target.value))}/></label>
            <button type="button" onClick={()=>change(value.filter((_,i)=>i!==index))}>Remove review</button>
        </div>)}
        {value.length<5&&<button type="button" onClick={()=>change([...value,{type:['security','privacy','it','legal','finance'].find(type=>!value.some(row=>row.type===type))??'security',reviewer:'',stage:1}])}>Add required review</button>}
    </fieldset>;
}
