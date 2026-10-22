/** Approval history is portable evidence. Restoring it creates no native session. */
export function validateApprovalChains(all,get,check,same) {
 for(const policy of all('policy'))if(policy.budgetPeriod){const {from,through}=policy.budgetPeriod;check([from,through].every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)&&from<=through&&Date.parse(through)-Date.parse(from)<367*86400000,'budget_period');}
 for(const policy of [...all('policy'),...all('decision').map(decision=>decision.policySnapshot).filter(Boolean)])if(policy.internationalTravelReviewer!==undefined)check(typeof policy.internationalTravelReviewer==='string'&&policy.internationalTravelReviewer.length<=254&&policy.internationalTravelReviewer===policy.internationalTravelReviewer.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.internationalTravelReviewer),'international_travel_reviewer');
 for(const policy of [...all('policy'),...all('decision').map(decision=>decision.policySnapshot).filter(Boolean)]) {
  for(const field of ['location','glAccount'])if(policy[field]!==undefined)check(typeof policy[field]==='string'&&policy[field].trim()===policy[field]&&policy[field].length>0&&policy[field].length<=200,'budget_dimension');
  if(policy.budgetFields){
   const fields=policy.budgetFields;get('intakeForm',fields.form);
   check(fields&&typeof fields==='object'&&!Array.isArray(fields)&&['header','line'].every(scope=>fields[scope]&&typeof fields[scope]==='object'&&!Array.isArray(fields[scope])&&Object.keys(fields[scope]).length<=30&&Object.entries(fields[scope]).every(([key,value])=>/^[a-z][a-z0-9_]*$/.test(key)&&typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=2000))&&Object.keys(fields.header).length+Object.keys(fields.line).length>0,'budget_custom_fields');
  }
 }
 for(const kind of ['request','revision','order','intakeForm'])for(const record of all(kind))for(const code of kind==='intakeForm'?record.defaults?.allocations??[]:(record.lines??[]).flatMap(line=>line.allocations??[]))for(const field of ['location','glAccount'])if(code[field]!==undefined)check(typeof code[field]==='string'&&code[field].trim()===code[field]&&code[field].length>0&&code[field].length<=200,'budget_allocation_dimension');
 const fields=['glAccount','costCentre','location','class','project','needDate','shipTo','supplier','notes'];
 for(const policy of all('policy'))if(policy.editRules)for(const rule of Object.values(policy.editRules))check(rule&&['allowed','material'].every(key=>Array.isArray(rule[key])&&rule[key].every(field=>fields.includes(field))),'approver_edit_rule');
 for(const policy of all('policy'))if(policy.approvalSteps) {
  check(Array.isArray(policy.approvalSteps)&&policy.approvalSteps.length<=20,'approval_steps');
  for(const step of policy.approvalSteps)check(typeof step.id==='string'&&typeof step.email==='string'&&step.email.includes('@')&&Number.isSafeInteger(step.minMinor)&&step.minMinor>=0&&Array.isArray(step.dependsOn)&&step.dependsOn.every(field=>fields.includes(field)),'approval_step_shape');
 }
 for(const request of [...all('request'),...all('revision')])if(request.approvalRoute) {
  check(Array.isArray(request.approvalRoute)&&request.approvalRoute.length>0&&request.approvalRoute.length<=122&&new Set(request.approvalRoute.map(step=>step.id)).size===request.approvalRoute.length&&typeof request.approvalPolicyVersion==='string','approval_route');
  for(const step of request.approvalRoute)check(typeof step.email==='string'&&step.email.includes('@')&&Array.isArray(step.dependsOn)&&step.dependsOn.every(field=>fields.includes(field)),'approval_route_step');
  const risk=request.approvalRoute.find(step=>step.id==='international-travel-risk');
  if(risk)check(request.purchaseType==='travel'&&request.travel?.destinations?.some(destination=>destination.country!=='US')&&request.approvalRoute.at(-1)===risk,'international_travel_route');
  if(!request.request){const revision=get('revision',request.id+':'+request.revision);check(same(request.approvalRoute,revision.approvalRoute)&&request.approvalPolicyVersion===revision.approvalPolicyVersion,'approval_route_revision');}
  if(request.approverEdit && (request.approverEdit.toRevision??request.approverEdit.fromRevision+1)===request.revision) {
   const edit=request.approverEdit,previous=get('revision',(request.request??request.id)+':'+edit.fromRevision);
   check(Number.isSafeInteger(edit.fromRevision)&&edit.fromRevision<request.revision&&edit.actor!==request.requester&&edit.email!==request.requesterEmail&&typeof edit.reason==='string'&&edit.reason.trim()&&Number.isFinite(Date.parse(edit.at)),'approver_edit_actor');
   check(Array.isArray(edit.differences)&&edit.differences.length&&new Set(edit.differences.map(d=>d.field)).size===edit.differences.length&&edit.differences.every(d=>{const field=d.codingField??d.field,before=d.line?previous.lines.find(line=>line.id===d.line):previous,after=d.line?request.lines.find(line=>line.id===d.line):request;return fields.includes(field)&&edit.rule.allowed.includes(field)&&before&&after&&(!d.line||d.field==='lines.'+d.line+'.'+field&&d.lineDescription===before.description)&&same(d.before,before[field]??null)&&same(d.after,after[field]);}),'approver_edit_difference');
   check(Array.isArray(edit.carried)&&Array.isArray(edit.renewed)&&edit.carried.every(id=>get('decision',id).carriedBy===edit.actor)&&edit.renewed.every(id=>get('decision',id).request===(request.request??request.id)),'approver_edit_decisions');
   check(all('audit').some(event=>event.action==='approver-edit'&&event.record===(request.request??request.id)&&event.revision===request.revision&&event.actor===edit.actor&&same(event.differences,edit.differences)&&same(event.carried,edit.carried)&&same(event.renewed,edit.renewed)),'approver_edit_audit');
  }
 }
 for(const decision of all('decision'))if(decision.chainStep) {
  const request=get('revision',decision.request+':'+decision.revision),step=request.approvalRoute?.find(step=>step.id===decision.chainStep);
  check(step&&(step.email===decision.email||decision.delegation||decision.scimTransfer)&&decision.actor!==request.requester&&decision.email!==request.requesterEmail&&decision.policyVersion===request.approvalPolicyVersion,'chain_decision');
  if(decision.policySnapshot?.internationalTravelReviewer!==undefined){
   const risk=request.approvalRoute?.find(step=>step.id==='international-travel-risk'),international=request.purchaseType==='travel'&&request.travel?.destinations?.some(destination=>destination.country!=='US');
   check(international?risk?.email===decision.policySnapshot.internationalTravelReviewer:!risk,'international_travel_policy_snapshot');
  }
  if(decision.delegation){const delegation=get('delegation',decision.delegation);check(delegation.policy===decision.policy&&delegation.from===step.email&&delegation.delegate===decision.email&&Date.parse(decision.carriedAt??decision.at)<Date.parse(delegation.expires),'chain_delegation');}
  if(decision.carriedFrom){const original=get('decision',decision.carriedFrom);check(original.request===decision.request&&original.revision<decision.revision&&original.decision==='approved'&&decision.decision==='approved'&&['actor','email','at','chainStep','reason'].every(field=>same(original[field],decision[field]))&&[request.approverEdit,request.needDateEdit,request.buyerConversion].some(edit=>edit?.carried?.includes(decision.id)),'carried_decision');}
 }
 for(const order of all('order'))if(order.approvalProofs) {
  const request=get('revision',order.request+':'+order.revision);
  check(Array.isArray(order.approvalProofs)&&request.approvalRoute?.length===order.approvalProofs.length,'chain_order_proofs');
  for(const [index,proof]of order.approvalProofs.entries())check(all('decision').some(d=>d.request===order.request&&d.revision===order.revision&&d.chainStep===request.approvalRoute[index].id&&d.decision==='approved'&&d.actor===proof.actor&&d.operatorVersion===proof.version),'chain_order_decision');
 }
}
