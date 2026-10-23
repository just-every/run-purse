import {useState} from 'react';
import {Details,Field,Form,type D} from './shared';

export function RecurringOpportunities({mutate,onChoose,runs}:{runs:D[];mutate:(op:string,b:D)=>Promise<any>;onChoose:(proposal:D)=>void}) {
    const retained=(run:D)=>({...run,from:run.from,to:run.to});
    const [result,setResult]=useState<D|undefined>(()=>{const run=runs.find(row=>!row.protectedContextCleanup?.authorityInvalidated);return run?retained(run):undefined;});
    return <section aria-label="Discover recurring opportunities"><h3>Find spend to review</h3>
        <p>Look for recorded agreement overlap, underused seats, comparable price increases and service issues. Each suggestion is conditional; an owner confirms operational fit and enters the exact scenario assumptions.</p>
        <Form label="Find recurring opportunities" onSubmit={async b=>setResult(await mutate('recurring-scenario-discover',b))}><Field label="Opportunity period from" name="from" type="date"/><Field label="Opportunity period through" name="to" type="date"/></Form>
        {!!runs.length&&<Details label="Retained discovery runs">{runs.map(run=><p key={run.id}>{run.at} · {run.proposals.length} proposals {run.protectedContextCleanup?.authorityInvalidated?<span>Unavailable after protected-context removal</span>:<button type="button" onClick={()=>setResult(retained(run))}>Inspect this discovery</button>}</p>)}</Details>}
        {result&&<><p>{result.proposals.length} conditional proposals · {result.mode} · model/provider: none. Future unissued renewal amounts remain unknown.</p>
            {result.proposals.map((proposal:D)=><article className="record" key={proposal.id} aria-label={'Opportunity '+proposal.id}><h4>{proposal.kind.replace(/-/g,' ')} · review required</h4><p>{proposal.reason}</p><p>Operational risk: {proposal.operationalRisk}</p>
                <Details label="Proposal sources">{proposal.sources.map((source:D)=><p key={source.kind+source.id}>{source.value.name??source.value.provider??source.value.number??source.kind} · {source.value.activeSeats!=null?source.value.activeSeats+' active of '+source.value.seatCount+' recorded seats':source.value.noticeDeadline?'notice '+source.value.noticeDeadline:source.value.category??source.value.status??''}</p>)}</Details>
                <button type="button" onClick={()=>onChoose({...proposal,from:result.from,to:result.to})}>Use this proposal</button>
            </article>)}
            {!result.proposals.length&&<p>No supported proposal follows from the recorded sources in this period. Missing usage or functional overlap is unknown.</p>}
        </>}
    </section>;
}
