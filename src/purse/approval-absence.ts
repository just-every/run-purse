import { currentScimAssignment } from './scim-approvals';
import { accessGrants, all, allowed, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

export const absencePrivateKinds = ['nativeApprovalIdentity', 'nativeAbsenceAuthority'];
export const nativeApprover = (native: Data): Actor => ({id:native.id,email:native.email,version:native.version,owner:native.role==='owner',session:'',dev:false});
const authorityKey = (config: Data) => config.id + ':' + config.version;
const approvalScopes = (s: State, a: Actor) => accessGrants(s,a).filter(g=>g.permissions.includes('request.approve')).map(g=>JSON.stringify({scope:g.scope,roleScope:g.roleScope??{}})).sort();
function identity(s: State, email: string) { return all(s,'nativeApprovalIdentity').find(n=>n.email===email); }
function stepDone(s: State, r: Data, step: Data) { return all(s,'decision').some(d=>d.request===r.id&&d.revision===r.revision&&d.approvalAttempt===r.approvalAttempt&&d.chainStep===(step.id==='primary'&&!r.approvalRoute?undefined:step.id)); }
export function absenceSteps(s: State, r: Data): Data[] { return r.approvalRoute ?? [{id:'primary',email:s.get('policy:'+r.policy)?.value.approver}]; }
export function absenceProof(s: State, config: Data) {
    const receipt=s.get('nativeAbsenceAuthority:'+authorityKey(config))?.value;
    return Boolean(receipt && receipt.authority===config.authority && receipt.policyVersion===config.policyVersion);
}
function sameScope(s: State, from: Actor, delegate: Actor) {
    const scopes=approvalScopes(s,from), delegated=approvalScopes(s,delegate);
    return scopes.length>0 && scopes.every(scope=>delegated.includes(scope));
}
/** Resolve wall time by enumerating the zone's actual offsets; gaps and folds are refused. */
export function absenceInstant(value: unknown, zone: string) {
    const wall=text(value,'Local date and time',16);
    requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall),'Use a local date and time with minutes');
    const nominal=Date.parse(wall+'Z');
    requireThat(Number.isFinite(nominal)&&new Date(nominal).toISOString().slice(0,16)===wall,'Use a valid local date and time');
    let formatter: Intl.DateTimeFormat;
    try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
    catch { requireThat(false,'Use a valid IANA time zone'); }
    const local=(n:number)=>{const p=Object.fromEntries(formatter.formatToParts(n).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
    const offsets=new Set<number>();
    for(let hours=-36;hours<=36;hours+=6){const n=nominal+hours*3600000;offsets.add(Date.parse(local(n)+'Z')-n);}
    const matches=[...offsets].map(offset=>nominal-offset).filter(n=>local(n)===wall);
    requireThat(matches.length===1,matches.length?'Ambiguous local time; choose a time outside the daylight-saving overlap':'Local time does not exist in this time zone');
    return new Date(matches[0]).toISOString();
}
export function approvalAbsence(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if(!['approval-absence','cancel-approval-absence'].includes(op))return;
    const previous=b.id?get(s,'approvalAbsence',b.id):undefined;
    const policy=get(s,'policy',previous?.policy??b.policy), from=text(previous?.from??b.from??policy.approver,'Approver',254).toLowerCase();
    const approvers=[policy.approver,...(policy.approvalSteps??[]).flatMap((step:Data)=>step.emails??[step.email]),policy.budgetOwner,policy.internationalTravelReviewer].filter(Boolean);
    requireThat(approvers.includes(from),'Choose an approver named by this policy');
    requireThat(a.owner||a.email===from&&allowed(s,a,'request.approve'),'Only the current approver or native owner may configure absence',403);
    requireThat((previous?.version??0)===b.version,'Absence settings changed; reload before saving',409);
    requireThat(!previous?.erasure,'Erased absence history cannot confer authority',409);
    if(!previous)requireThat(!all(s,'approvalAbsence').some(c=>c.policy===policy.id&&c.from===from&&c.active),'Edit or cancel the existing absence for this approver',409);
    const id=previous?.id??uid(), version=(previous?.version??0)+1, at=new Date().toISOString();
    if(op==='cancel-approval-absence') {
        requireThat(previous?.active,'Absence is already cancelled',409);
        const next={...previous,version,active:false,history:[...previous.history,{version,actor:a.id,email:a.email,at,action:'cancelled',reason:text(b.reason,'Cancellation reason')}]};
        put(s,'approvalAbsence',id,next);audit(s,a,'approval-absence-cancelled',id,{version,policy:policy.id,reason:b.reason});return get(s,'approvalAbsence',id);
    }
    const timezone=text(b.timezone,'Time zone',100), startsAt=absenceInstant(b.start,timezone), endsAt=absenceInstant(b.end,timezone);
    requireThat(endsAt>startsAt&&Date.parse(endsAt)>Date.now(),'End must follow start and be in the future');
    const delegate=text(b.delegate,'Delegate',254).toLowerCase(), origin=identity(s,from), target=identity(s,delegate);
    requireThat(origin&&target&&from!==delegate,'Choose distinct active native approvers',403);
    requireThat(sameScope(s,nativeApprover(origin),nativeApprover(target)),'Delegate must be an active approver with the same scope',403);
    requireThat(!all(s,'delegation').some(d=>d.policy===policy.id&&d.from===from&&d.active&&Date.parse(d.expires)>Date.now()),'Revoke overlapping manual delegation before scheduling absence',409);
    const reason=text(b.reason,'Absence reason'), authority=uid(), policyVersion=s.get('policy:'+policy.id)!.revision;
    const snapshot={version,from,delegate,timezone,start:b.start,end:b.end,startsAt,endsAt,reason,actor:a.id,email:a.email,at,authority,policyVersion,fromActor:origin.id,fromVersion:origin.version,delegateActor:target.id,delegateVersion:target.version,actorVersion:a.version,actorOwner:a.owner};
    put(s,'approvalAbsence',id,{id,policy:policy.id,active:true,...snapshot,history:[...(previous?.history??[]),{...snapshot,action:'scheduled'}]});
    put(s,'nativeAbsenceAuthority',id+':'+version,{...snapshot,id:id+':'+version});
    audit(s,a,'approval-absence-configured',id,{policy:policy.id,version,from,delegate,timezone,startsAt,endsAt,reason});
    return get(s,'approvalAbsence',id);
}
export function absenceRoute(s: State, r: Data, step: Data, now=Date.now()): Data | undefined {
    if(r.imported||r.status!=='pending'||stepDone(s,r,step))return;
    const emails=step.emails??[step.email];
    const config=all(s,'approvalAbsence').find(c=>c.active&&c.policy===r.policy&&emails.includes(c.from)&&Date.parse(c.startsAt)<=now&&now<Date.parse(c.endsAt));
    if(!config)return;
    let held='';
    if(step.emails||step.parallelGroup)held='Pool and parallel absence routing awaits qualification';
    else if(currentScimAssignment(s,r,r.approvalRoute?step.id:undefined))held='Existing identity transfer requires owner review';
    else if(!absenceProof(s,config)||config.policyVersion!==s.get('policy:'+r.policy)?.revision||config.erasure)held='Current native absence authority unavailable; renew settings';
    else if(config.delegateActor===r.requester||config.delegate===r.requesterEmail)held='Delegate is the requester; manager routing awaits qualification';
    else {
        const origin=identity(s,config.from), target=identity(s,config.delegate);
        if(!origin||!target||!sameScope(s,nativeApprover(origin),nativeApprover(target))||![origin,target].every(n=>allowed(s,nativeApprover(n),'request.approve',r)&&allowed(s,nativeApprover(n),'request.read',r)))held='Approver or delegate scope revoked; owner review required';
    }
    return {config:config.id,configVersion:config.version,authority:config.authority,from:step.email,to:held?null:config.delegate,delegateActor:config.delegateActor,delegateVersion:config.delegateVersion,status:held?'held':'delegated',reason:'out of office',detail:held||config.reason,startsAt:config.startsAt,endsAt:config.endsAt,timezone:config.timezone};
}
export function absenceAllows(s: State, a: Actor, r: Data, step: Data) {
    const route=absenceRoute(s,r,step);
    if(!route)return;
    return route.status==='delegated'&&route.to===a.email&&route.delegateActor===a.id&&route.delegateVersion===a.version&&allowed(s,a,'request.approve',r)&&a.id!==r.requester&&a.email!==r.requesterEmail ? {absence:route.config,absenceVersion:route.configVersion,absenceAuthority:route.authority,delegation:null} : false;
}
export function validateAbsenceDecision(s: State, r: Data, step: Data, decision: Data) {
    const config=get(s,'approvalAbsence',decision.absence), version=config.history.find((h:Data)=>h.version===decision.absenceVersion&&h.action==='scheduled');
    const proof=version&&{...version,id:config.id};
    requireThat(proof&&absenceProof(s,proof)&&version.authority===decision.absenceAuthority&&version.from===step.email&&version.delegate===decision.email&&version.delegateActor===decision.actor&&version.delegateVersion===decision.operatorVersion&&decision.at>=version.startsAt&&decision.at<version.endsAt&&!config.erasure,'Absence decision has no current native authority; renew approval',409);
    requireThat(allowed(s,{id:decision.actor,email:decision.email,owner:decision.owner===true,version:decision.operatorVersion,dev:false,session:''},'request.approve',r),'Delegate authority revoked; renew approval',409);
}
/** Append transitions only for undecided steps; neither requests nor decisions are rewritten. */
export function reconcileAbsences(s: State, now=Date.now()) {
    let changes=0;
    for(const r of all(s,'request').filter(r=>r.status==='pending'&&!r.imported))for(const step of absenceSteps(s,r)) {
        if(stepDone(s,r,step))continue;
        const id=[r.id,r.revision,r.approvalAttempt??'native',step.id].join(':'), previous=s.get('approvalAbsenceTransfer:'+id)?.value, route=absenceRoute(s,r,step,now);
        const next=route??(previous&&previous.status!=='returned'?{status:'returned',from:previous.from,to:previous.from,reason:'out of office ended',config:previous.config,configVersion:previous.configVersion,authority:previous.authority,detail:'Undecided step returned to its original approver'}:undefined);
        if(!next||previous&&['status','to','config','configVersion','detail'].every(k=>previous[k]===next[k]))continue;
        const since=previous?.since??r.submittedAt??all(s,'audit').filter(e=>e.record===r.id&&e.action==='submit'&&e.revision===r.revision).at(-1)?.at??r.at;
        const event={...next,at:new Date(now).toISOString(),sequence:(previous?.sequence??0)+1};
        put(s,'approvalAbsenceTransfer',id,{id,request:r.id,revision:r.revision,approvalAttempt:r.approvalAttempt,step:step.id,...next,sequence:event.sequence,since,history:[...(previous?.history??[]),event]});
        audit(s,{id:'system',email:'',owner:false,version:0,session:'',dev:false},'approval-absence-transition',r.id,{revision:r.revision,step:step.id,transfer:id,since,...event});changes++;
    }
    return changes;
}
export function absenceView(s: State, r: Data) {
    if(r.status!=='pending')return;
    const step=absenceSteps(s,r).find(step=>!stepDone(s,r,step));
    if(!step)return;
    const route=absenceRoute(s,r,step), transfer=s.get('approvalAbsenceTransfer:'+ [r.id,r.revision,r.approvalAttempt??'native',step.id].join(':'))?.value;
    return {step:step.id,holder:route?(route.status==='held'?'Held for owner review':route.to):step.email,reason:route?.reason??transfer?.reason,detail:route?.detail??(transfer?.status==='returned'?transfer.detail:undefined),since:r.submittedAt??transfer?.since,held:route?.status==='held'};
}
export function absenceSettings(s: State, a: Actor) {
    const canConfigure=a.owner||allowed(s,a,'request.approve');
    const policies=canConfigure?all(s,'policy').filter(p=>p.active&&(a.owner||[p.approver,...(p.approvalSteps??[]).flatMap((step:Data)=>step.emails??[step.email]),p.budgetOwner,p.internationalTravelReviewer].includes(a.email))).map(p=>({id:p.id,name:p.name,approvers:[...new Set([p.approver,...(p.approvalSteps??[]).flatMap((step:Data)=>step.emails??[step.email]),p.budgetOwner,p.internationalTravelReviewer].filter(email=>email&&(a.owner||email===a.email)))]})):[];
    const configs=all(s,'approvalAbsence').filter(c=>a.owner||canConfigure&&c.from===a.email).map(c=>({...c,currentAuthority:absenceProof(s,c)&&!c.erasure}));
    const delegates=canConfigure?all(s,'nativeApprovalIdentity').filter(n=>allowed(s,nativeApprover(n),'request.approve')&&(a.owner||sameScope(s,a,nativeApprover(n)))).map(n=>({email:n.email,name:all(s,'member').find(m=>m.email===n.email)?.name??n.email})):[];
    return {approvalAbsenceSettings:{policies,configs,delegates}};
}
export function absenceAuthorityFence(db: D1Database, s: State, config: string, version: number) {
    const proof=s.get('nativeAbsenceAuthority:'+config+':'+version)?.value;
    if(!proof)return [db.prepare('INSERT INTO p_guard VALUES(0)')];
    return [db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_approval_absence_authority WHERE id=? AND json_extract(value,'$.authority')=?) THEN 1 ELSE 0 END").bind(config+':'+version,proof.authority),...[{id:proof.actor,version:proof.actorVersion,owner:proof.actorOwner},{id:proof.fromActor,version:proof.fromVersion,owner:false},{id:proof.delegateActor,version:proof.delegateVersion,owner:false}].map(p=>db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')) THEN 1 ELSE 0 END").bind(p.id,p.version,p.owner?1:0))];
}
