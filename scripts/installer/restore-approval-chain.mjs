/** Approval history is portable evidence. Restoring it creates no native session. */
export function validateApprovalChains(all,get,check,same) {
 const fields=['glAccount','costCentre','location','class','project','needDate','shipTo','supplier','notes'];
 for(const policy of all('policy'))if(policy.approvalSteps) {
  check(Array.isArray(policy.approvalSteps)&&policy.approvalSteps.length<=20,'approval_steps');
  for(const step of policy.approvalSteps)check(typeof step.id==='string'&&typeof step.email==='string'&&step.email.includes('@')&&Number.isSafeInteger(step.minMinor)&&step.minMinor>=0&&Array.isArray(step.dependsOn)&&step.dependsOn.every(field=>fields.includes(field)),'approval_step_shape');
 }
 for(const request of [...all('request'),...all('revision')])if(request.approvalRoute) {
  check(Array.isArray(request.approvalRoute)&&request.approvalRoute.length>0&&request.approvalRoute.length<=21&&new Set(request.approvalRoute.map(step=>step.id)).size===request.approvalRoute.length&&typeof request.approvalPolicyVersion==='string','approval_route');
  for(const step of request.approvalRoute)check(typeof step.email==='string'&&step.email.includes('@')&&Array.isArray(step.dependsOn)&&step.dependsOn.every(field=>fields.includes(field)),'approval_route_step');
  if(!request.request){const revision=get('revision',request.id+':'+request.revision);check(same(request.approvalRoute,revision.approvalRoute)&&request.approvalPolicyVersion===revision.approvalPolicyVersion,'approval_route_revision');}
  if(request.approverEdit) {
   const edit=request.approverEdit,previous=get('revision',(request.request??request.id)+':'+edit.fromRevision);
   check(Number.isSafeInteger(edit.fromRevision)&&edit.fromRevision<request.revision&&edit.actor!==request.requester&&edit.email!==request.requesterEmail&&typeof edit.reason==='string'&&edit.reason.trim()&&Number.isFinite(Date.parse(edit.at)),'approver_edit_actor');
   check(Array.isArray(edit.differences)&&edit.differences.length&&new Set(edit.differences.map(d=>d.field)).size===edit.differences.length&&edit.differences.every(d=>fields.includes(d.field)&&edit.rule.allowed.includes(d.field)&&same(d.before,previous[d.field]??null)&&same(d.after,request[d.field])),'approver_edit_difference');
   check(Array.isArray(edit.carried)&&Array.isArray(edit.renewed)&&edit.carried.every(id=>get('decision',id).carriedBy===edit.actor)&&edit.renewed.every(id=>get('decision',id).request===(request.request??request.id)),'approver_edit_decisions');
   check(all('audit').some(event=>event.action==='approver-edit'&&event.record===(request.request??request.id)&&event.revision===request.revision&&event.actor===edit.actor&&same(event.differences,edit.differences)&&same(event.carried,edit.carried)&&same(event.renewed,edit.renewed)),'approver_edit_audit');
  }
 }
 for(const decision of all('decision'))if(decision.chainStep) {
  const request=get('revision',decision.request+':'+decision.revision),step=request.approvalRoute?.find(step=>step.id===decision.chainStep);
  check(step&&step.email===decision.email&&decision.actor!==request.requester&&decision.email!==request.requesterEmail&&decision.policyVersion===request.approvalPolicyVersion,'chain_decision');
  if(decision.carriedFrom){const original=get('decision',decision.carriedFrom);check(original.request===decision.request&&original.revision<decision.revision&&original.decision==='approved'&&decision.decision==='approved'&&['actor','email','at','chainStep','reason'].every(field=>same(original[field],decision[field]))&&request.approverEdit?.carried.includes(decision.id),'carried_decision');}
 }
 for(const order of all('order'))if(order.approvalProofs) {
  const request=get('revision',order.request+':'+order.revision);
  check(Array.isArray(order.approvalProofs)&&request.approvalRoute?.length===order.approvalProofs.length,'chain_order_proofs');
  for(const [index,proof]of order.approvalProofs.entries())check(all('decision').some(d=>d.request===order.request&&d.revision===order.revision&&d.chainStep===request.approvalRoute[index].id&&d.decision==='approved'&&d.actor===proof.actor&&d.operatorVersion===proof.version),'chain_order_decision');
 }
}
