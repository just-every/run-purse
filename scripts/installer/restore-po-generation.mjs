const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Preserve evidence only. Native IDs/versions are checked against the destination
 * installation on execution; restoring a rule never creates an operator grant. */
export function validatePoGeneration(all,get,check) {
    for (const policy of all('poGenerationPolicy')) {
        check(nonempty(policy.purchaseType)&&policy.purchaseType===policy.purchaseType.trim().toLowerCase()&&nonempty(policy.supplier)&&/^[A-Z]{3}$/.test(policy.currency)&&policy.id===JSON.stringify([policy.purchaseType,policy.supplier,policy.currency]),'po_generation_policy_identity');
        if(policy.supplier!=='*')get('supplier',policy.supplier);
        check(get('business','main').currencies.includes(policy.currency),'po_generation_currency');
        check(Number.isSafeInteger(policy.version)&&policy.version>0&&Array.isArray(policy.history)&&policy.history.length===policy.version,'po_generation_history');
        for(const [index,entry] of policy.history.entries()) check(entry.id===policy.id&&entry.purchaseType===policy.purchaseType&&entry.supplier===policy.supplier&&entry.currency===policy.currency&&entry.version===index+1&&typeof entry.enabled==='boolean'&&Number.isSafeInteger(entry.maxMinor)&&entry.maxMinor>=0&&entry.maxMinor<=1e12&&nonempty(entry.actor)&&nonempty(entry.email)&&Number.isSafeInteger(entry.operatorVersion)&&entry.operatorVersion>0&&nonempty(entry.reason)&&instant(entry.at)&&entry.outbound==='buyer-consent-required','po_generation_policy_entry');
        const {history,...current}=policy;check(equal(current,history.at(-1)),'po_generation_current');
    }
    for(const event of all('poGenerationEvent')) {
        const source=get('revision',event.request+':'+event.revision),policy=get('poGenerationPolicy',event.policy),authority=policy.history[event.policyVersion-1];
        check(event.id===event.request+':'+event.revision&&source.request===event.request&&!source.imported&&instant(event.at)&&authority?.enabled&&authority.currency===source.currency&&(authority.supplier==='*'||authority.supplier===source.supplier)&&event.outbound==='buyer-consent-required','po_generation_event_source');
        check(['held','generated'].includes(event.status),'po_generation_event_status');
        if(event.status==='held')check(nonempty(event.reason),'po_generation_hold');
        else {
            const order=get('order',event.order);
            check(order.request===event.request&&order.revision===event.revision&&order.issuedAt&&!order.imported&&order.issuedBy===event.actor&&event.actor===authority.actor&&event.operatorVersion===authority.operatorVersion&&order.generation?.event===event.id&&order.generation.policy===policy.id&&order.generation.policyVersion===event.policyVersion&&source.totalMinor<=authority.maxMinor,'po_generation_order');
            check(Array.isArray(event.authorityProofs)&&event.authorityProofs.some(p=>p.actor===event.actor&&p.version===event.operatorVersion&&p.owner===true)&&event.authorityProofs.every(p=>nonempty(p.actor)&&Number.isSafeInteger(p.version)&&p.version>0),'po_generation_proofs');
            check(all('audit').some(a=>a.action==='po-generation-generated'&&a.record===order.id&&a.request===event.request&&a.revision===event.revision&&a.actor===event.actor&&a.policy===policy.id&&a.policyVersion===event.policyVersion),'po_generation_audit');
        }
    }
    for(const order of all('order').filter(o=>o.generation))check(get('poGenerationEvent',order.generation.event).order===order.id,'po_generation_order_link');
}
