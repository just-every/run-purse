import { useState } from 'react';
import { call, Details, Field, Form, when, type D } from './shared';

export function ProposalMatches({review,onChoose}:{review:D;onChoose:(id:string)=>void}) {
    return <div className="wide" aria-label="Existing supplier choices">
        {review.matches.length===0&&!review.needsAdministrator&&<p>No possible existing supplier found.</p>}
        {review.needsAdministrator&&<p>A possible match requires native owner review. Private supplier details are not shown.</p>}
        {review.matches.map((match:D)=><p key={match.id}>{match.name} · {match.status}
            {match.selectable ? <> · <button type="button" onClick={()=>onChoose(match.id)}>Use existing supplier</button></> : <> · Cannot select this supplier</>}
        </p>)}
    </div>;
}
export function SupplierProposals({data,actor,mutate,onChoose}:{data:D;actor:D;mutate:(op:string,b:D)=>Promise<any>;onChoose:(id:string)=>void}) {
    const [review,setReview]=useState<D>(),[input,setInput]=useState<D>(),[chosen,setChosen]=useState('');
    return <section className="panel" aria-label="Supplier proposals"><h3>Supplier proposals</h3>
        {actor.permissions.includes('request.create')&&<Details label="Propose a supplier without a request">
            <Form label="Check existing suppliers" onSubmit={async b=>{setReview(await call('command/supplier-proposal-choices',b));setInput(b);setChosen('');}}>
                <Field label="Proposed supplier name" name="name"/><Field label="Proposed contact name" name="contactName" required={false}/>
                <Field label="Proposed contact email" name="contactEmail" type="email"/><Field label="Proposed website" name="website" required={false}/>
                <Field label="Proposed phone" name="phone" required={false}/><Field label="Why this supplier" name="reason"/>
            </Form>
            {review&&<ProposalMatches review={review} onChoose={id=>{setChosen('Existing supplier selected. No proposal was created.');setInput(undefined);onChoose(id);}}/>}
            {chosen&&<p role="status">{chosen}</p>}
            {review&&input&&review.matches.length===0&&!review.needsAdministrator&&<Form label="Send supplier proposal" onSubmit={async b=>{await mutate('supplier-propose',{...input,consent:b.consent==='on'});setReview(undefined);setInput(undefined);}}>
                <label className="wide"><input type="checkbox" name="consent" required/> I confirm this supplier should be reviewed</label>
            </Form>}
        </Details>}
        {(data.supplierProposal??[]).map((proposal:D)=><section key={proposal.id} aria-label={'Supplier review '+proposal.name}>
            <h4>{proposal.name}</h4><p>Status: {proposal.status} · {proposal.holder} · Since {when(proposal.statusSince)}</p>
            <p>{proposal.activationHold}</p><p>Needed because: {proposal.reason}</p>
            <p>Proposed contact: {proposal.contactName} · {proposal.contactEmail}</p>
            {proposal.review&&<p>Rejection reason: {proposal.reviewReason}</p>}
            {proposal.mayReject&&<Form label="Reject supplier proposal" initial={{id:proposal.id,version:proposal.version??1,basis:proposal.basis}} onSubmit={b=>mutate('supplier-proposal-reject',b)}>
                <Field label="Rejection reason" name="reason"/>
                <p>Return wholly unissued requests with this reason and release their outstanding reservations.</p>
            </Form>}
        </section>)}
        {!(data.supplierProposal??[]).length&&<p>No supplier proposals in your scope.</p>}
    </section>;
}
export function RequestSupplierReview({request}:{request:D}) {
    const review=request.supplierReview;
    return review ? <section className="panel" aria-label="Pending supplier review"><h4>Supplier review</h4>
        <p>Status: {review.status} · {review.holder} · Since {when(review.at)}</p>
        <p>{review.status==='rejected'?'The outstanding reservation was released. A replacement supplier needs a revised draft and fresh purchase approval.':'Purchase approval reserves the request amount. Purchasing waits for supplier activation.'}</p>
        {review.reason&&<p>Rejection reason: {review.reason}. Select another active supplier in a revised draft and submit for fresh purchase approval.</p>}
    </section> : null;
}
