import { carryApprovalDecisions } from './approval-chain';
import { currentDecision } from './approval';
import { policies } from './requests';
import { linePosition } from './orders';
import { servicePosition } from './service-orders';
import { all, allowed, audit, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** A date-only revision retains buying authority. Supplier delivery is explicit:
 * native document generation never implies supplier mail acceptance. */
export function changeNeedDate(s: State, a: Actor, input: Data) {
    const previous=get(s,'request',input.id);
    requireThat(previous.status==='approved'&&previous.revision===input.revision&&!previous.imported,'Exact approved request revision required',409);
    const own=previous.requester===a.id||previous.requesterEmail===a.email;
    requireThat(a.owner || own&&allowed(s,a,'request.edit',previous) || allowed(s,a,'request.approve',previous),'Only this requester or a scoped approver may correct the need date',403);
    currentDecision(s,previous);
    requireThat(!all(s,'orderClosure').some(closure=>closure.active&&get(s,'order',closure.order).request===previous.id),'Reopen closed balances before correcting this purchase date',409);
    const policy=get(s,'policy',previous.policy), kind=previous.purchaseType??previous.lines[0].category.toLowerCase(), rule=policy.editRules?.[kind]??policy.editRules?.['*'];
    requireThat(!(rule?.material??[]).includes('needDate'),'This policy classifies need date as material; amend and renew approval',409);
    const needDate=date(input.needDate), reason=text(input.reason,'Need date correction reason');
    requireThat(!policy.budgetPeriod||needDate>=policy.budgetPeriod.from&&needDate<=policy.budgetPeriod.through,'Need date moves the line outside its approved budget period; amend and renew approval',409);
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
    requireThat(!all(s,'order').some(order=>order.request===previous.id&&order.supplierGroup),'Existing supplier groups require a separate supported disposition; grouped amendments are unavailable',409);
    const prior=all(s,'order').find(order=>order.request===previous.id&&order.revision===previous.revision&&['issued','prepared'].includes(order.status));
    if(prior) {
        requireThat(!prior.imported&&!prior.adoption&&!prior.cancellation&&!prior.poDetails?.blanket,'This order requires its native amendment path',409);
        const issued=prior.status==='issued';
        if(issued){
            next.amends=prior.id;
            next.lines=next.lines.map((line:Data)=>{
                const old=prior.lines.find((item:Data)=>item.id===line.id),position=linePosition(s,prior.id,old);
                const service=old.service?servicePosition(s,prior,old):undefined;
                return {...line,carriedAccepted:position.accepted,carriedCancelled:position.cancelled,...(service?{carriedAcceptedMinor:service.acceptedMinor,carriedCancelledMinor:service.cancelledMinor,carriedMilestones:[...(old.carriedMilestones??[]),...all(s,'receipt').filter(receipt=>receipt.order===prior.id&&receipt.line===old.id&&receipt.milestone).map(receipt=>receipt.milestone)]}:{})};
            });
        }
        const id=uid(), order:Data={...structuredClone(prior),id,revision:next.revision,lines:next.lines.map((line:Data)=>({...line,sourceLine:line.id})),needDate:next.needDate,generatedAt:new Date().toISOString(),needDateChange:{...next.needDateEdit,priorOrder:prior.id,supplierDelivery:issued?'not-sent':'not-issued',...(issued?{blockedBy:'PO-004 requires an explicit buyer send of this exact change order'}:{})}};
        delete order.conversionVariance;delete order.amendedBy;
        const approval=currentDecision(s,next);
        order.approvalActor=approval.actor;order.approvalVersion=approval.operatorVersion;
        if(approval.chainProofs)order.approvalProofs=approval.chainProofs;
        if(issued){order.issuedAt=new Date().toISOString();order.issuedBy=a.id;order.issueReason=reason;next.needDateEdit.supplierDelivery='not-sent';next.needDateEdit.blockedBy=order.needDateChange.blockedBy;}
        put(s,'order',prior.id,{...prior,status:issued?'amended':'superseded',...(issued?{amendedBy:id}:{})});
        put(s,'order',id,order);
        for(const rule of all(s,'receiptRule').filter(rule=>rule.order===prior.id)) {
            const ruleId=uid();put(s,'receiptRule',ruleId,{...rule,id:ruleId,order:id,carriedFrom:rule.id});
            audit(s,a,'need-date-receiver-carry',id,{rule:ruleId,sourceRule:rule.id,receiver:rule.receiver});
        }
        next.needDateEdit.order=id;
        audit(s,a,'need-date-document',id,{request:next.id,revision:next.revision,priorOrder:prior.id,...next.needDateEdit});
    }
    put(s,'request',next.id,next);put(s,'revision',next.id+':'+next.revision,{...next,request:next.id});
    audit(s,a,'need-date-edit',next.id,{revision:next.revision,...next.needDateEdit});
    return next;
}
