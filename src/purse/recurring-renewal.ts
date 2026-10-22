import { currentDecision } from './approval';
import { supplier } from './admin';
import { canonicalSupplier } from './supplier-identity';
import { lapsedSupplierDocuments } from './supplier-documents';
import { reservationAvailable, authorizedApproval } from './requests';
import { all, get, requireThat, type Data, type State } from './types';

/** Conservative: the agreement's known value covers committed orders and attributed evidence once. */
export function agreementExposure(s: State, agreement: Data) {
    const ids=new Set(all(s,'recurringSeries').filter(series=>series.agreement===agreement.id).map(series=>series.order));
    for(const e of all(s,'recurringEvent').filter(e=>e.agreement===agreement.id&&e.order))ids.add(e.order);
    const requests=new Set([...ids].map(id=>get(s,'order',id).request));
    let amount=0;
    for(const request of requests) {
        const orders=all(s,'order').filter(o=>o.request===request&&o.issuedAt&&o.currency===agreement.currency);
        const face=orders.sort((a,b)=>b.revision-a.revision)[0]?.totalMinor??0;
        const orderIds=new Set(orders.map(o=>o.id));
        const billed=all(s,'invoice').filter(i=>orderIds.has(i.order)).reduce((n,i)=>n+i.totalMinor,0);
        amount+=Math.max(face,billed);
    }
    amount+=all(s,'agreementInvoice').filter(i=>i.agreement===agreement.id&&!requests.has(get(s,'order',i.order).request)).reduce((n,i)=>n+i.amountMinor,0);
    return amount;
}
export function recurringRenewal(s: State, series: Data, scheduledFor: string, now = Date.now()) {
    const order=get(s,'order',series.order), request=get(s,'request',series.request), agreement=get(s,'agreement',series.agreement);
    requireThat(order.status==='issued' && !order.imported && request.revision===series.sourceRevision && order.revision===series.sourceRevision,'Template changed or closed; amend and renew the series',409);
    currentDecision(s,request);
    const authorization=series.authorization;
    requireThat(authorization && s.get('policy:'+request.policy)?.revision===authorization.policyVersion,'Series approval policy changed; renew authority',409);
    authorizedApproval(s,{id:authorization.actor,email:authorization.email,version:authorization.operatorVersion,owner:authorization.owner===true,session:'',dev:false},request);
    supplier(s,order.supplier);
    requireThat(!lapsedSupplierDocuments(s,order.supplier,now).length,'Supplier required document has lapsed',409);
    requireThat(canonicalSupplier(s,agreement.supplier)===canonicalSupplier(s,order.supplier)&&agreement.currency===order.currency,'Agreement supplier or currency changed',409);
    requireThat(scheduledFor>=agreement.startDate,'Scheduled order precedes agreement start date '+agreement.startDate,409);
    requireThat(scheduledFor<=agreement.endDate,'Agreement ends '+agreement.endDate+' before scheduled order '+scheduledFor,409);
    requireThat(scheduledFor<agreement.noticeDeadline,'Scheduled order falls inside agreement notice period beginning '+agreement.noticeDeadline+' (end '+agreement.endDate+')',409);
    requireThat(agreement.valueMinor!==null && agreement.valueMinor!==undefined,'Agreement value is unknown; confirm it before recurring purchasing',409);
    requireThat(agreementExposure(s,agreement)+order.totalMinor<=agreement.valueMinor,'Scheduled order exceeds remaining agreement value',409);
    requireThat(reservationAvailable(s,request,order.totalMinor),'Scheduled order exceeds remaining budget',409);
    return {order,request,agreement,authorization};
}
