import { carryApprovalDecisions } from './approval-chain';
import { currentDecision } from './approval';
import { policies } from './requests';
import { linePosition } from './orders';
import { all, allowed, audit, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** A date-only revision retains buying authority. Supplier delivery is explicit:
 * native document generation is available; PO-004 sending remains unbuilt. */
export function changeNeedDate(s: State, a: Actor, input: Data) {
    const previous=get(s,'request',input.id);
    requireThat(previous.status==='approved'&&previous.revision===input.revision&&!previous.imported,'Exact approved request revision required',409);
    const own=previous.requester===a.id||previous.requesterEmail===a.email;
    requireThat(a.owner || own&&allowed(s,a,'request.edit',previous) || allowed(s,a,'request.approve',previous),'Only this requester or a scoped approver may correct the need date',403);
    currentDecision(s,previous);
    const policy=get(s,'policy',previous.policy), kind=previous.purchaseType??previous.lines[0].category.toLowerCase(), rule=policy.editRules?.[kind]??policy.editRules?.['*'];
    requireThat(!(rule?.material??[]).includes('needDate'),'This policy classifies need date as material; amend and renew approval',409);
    const needDate=date(input.needDate), reason=text(input.reason,'Need date correction reason');
    requireThat(!input.line||previous.lines.some((line:Data)=>line.id===input.line),'Line is outside this request');
    const next:Data={...structuredClone(previous),revision:previous.revision+1};
    delete next.approverEdit;delete next.buyerConversion;delete next.needDateEdit;
    const differences:Data[]=[];
    next.lines=next.lines.map((line:Data)=>{
        if(input.line&&input.line!==line.id)return line;
        const before=line.needDate??previous.needDate;
        if(before!==needDate)differences.push({line:line.id,field:'needDate',before,after:needDate});
        return {...line,needDate};
    });
    requireThat(differences.length,'Need date did not change');
    if(!input.line||next.lines.every((line:Data)=>line.needDate===needDate))next.needDate=needDate;
    requireThat(policies(s,next).some(candidate=>candidate.id===previous.policy),'Need date moves the purchase outside its approved budget period; amend and renew approval',409);
    next.needDateEdit={fromRevision:previous.revision,actor:a.id,email:a.email,at:new Date().toISOString(),reason,differences,carried:[],supplierDelivery:'not-issued'};
    next.needDateEdit.carried=carryApprovalDecisions(s,a,previous,next);
    const prior=all(s,'order').find(order=>order.request===previous.id&&order.revision===previous.revision&&['issued','prepared'].includes(order.status));
    if(prior) {
        requireThat(!prior.imported&&!prior.adoption&&!prior.cancellation&&!prior.poDetails?.blanket,'This order requires its native amendment path',409);
        const issued=prior.status==='issued';
        if(issued){next.amends=prior.id;next.lines=next.lines.map((line:Data)=>{const old=prior.lines.find((item:Data)=>item.id===line.id),position=linePosition(s,prior.id,old);return {...line,carriedAccepted:position.accepted,carriedCancelled:position.cancelled};});}
        const id=uid(), order:Data={...structuredClone(prior),id,revision:next.revision,lines:next.lines.map((line:Data)=>({...line,sourceLine:line.id})),needDate:next.needDate,generatedAt:new Date().toISOString(),needDateChange:{...next.needDateEdit,priorOrder:prior.id,supplierDelivery:issued?'not-sent':'not-issued',...(issued?{blockedBy:'PO-004 supplier change-order sending is not implemented'}:{})}};
        delete order.conversionVariance;delete order.amendedBy;
        const approval=currentDecision(s,next);
        order.approvalActor=approval.actor;order.approvalVersion=approval.operatorVersion;
        if(approval.chainProofs)order.approvalProofs=approval.chainProofs;
        if(issued){order.issuedAt=new Date().toISOString();order.issuedBy=a.id;order.issueReason=reason;next.needDateEdit.supplierDelivery='not-sent';next.needDateEdit.blockedBy=order.needDateChange.blockedBy;}
        put(s,'order',prior.id,{...prior,status:issued?'amended':'superseded',...(issued?{amendedBy:id}:{})});
        put(s,'order',id,order);
        next.needDateEdit.order=id;
        audit(s,a,'need-date-document',id,{request:next.id,revision:next.revision,priorOrder:prior.id,...next.needDateEdit});
    }
    put(s,'request',next.id,next);put(s,'revision',next.id+':'+next.revision,{...next,request:next.id});
    audit(s,a,'need-date-edit',next.id,{revision:next.revision,...next.needDateEdit});
    return next;
}
