import { check, same } from './restore-validation.mjs';
import { accessObject, accessShape, accessText } from './restore-access.mjs';

const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = value => Number.isSafeInteger(value) && value > 0;
const email = value => accessText(value,254) && value === value.toLowerCase() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const userActions = ['scim-user-create','scim-user-update','scim-user-deactivate'];
const eventsFor = (all,id) => all('audit').filter(event => userActions.includes(event.action) && event.record === id);

function userShape(user) {
 check(accessShape(user,['id','issuer','externalId','userName','displayName','active','department','manager','createdAt','updatedAt','version']) && accessText(user.id,200) && accessText(user.externalId,500) && email(user.userName) && accessText(user.displayName,200) && typeof user.active === 'boolean' && typeof user.department === 'string' && user.department.length <= 200 && user.department.trim() === user.department && typeof user.manager === 'string' && user.manager.length <= 200 && user.manager !== user.id && date(user.createdAt) && date(user.updatedAt) && Date.parse(user.updatedAt) >= Date.parse(user.createdAt) && positive(user.version),'scim_user');
 let issuer; try { issuer = new URL(user.issuer); } catch { check(false,'scim_issuer'); }
 check(accessText(user.issuer,1000) && ['https:','http:'].includes(issuer.protocol) && !issuer.username && !issuer.password && !issuer.search && !issuer.hash,'scim_issuer');
}
function provisioningEvidence(event,all) {
 check(event.actor === 'scim-service' && event.email === '' && date(event.at) && positive(event.credentialGeneration) && accessText(event.consentBy) && Array.isArray(event.grantsBefore) && Array.isArray(event.grantsAfter),'scim_user_audit');
 const user = event.after;
 check(event.issuer === user.issuer && event.externalId === user.externalId && Date.parse(event.at) >= Date.parse(user.updatedAt),'scim_user_audit');
 // Consent/mappings remain historical audit data, never an executable config.
 check(all('audit').some(consent => consent.action === 'scim-configure' && consent.record === 'main' && consent.actor === event.consentBy && email(consent.email) && date(consent.at) && Date.parse(consent.at) <= Date.parse(event.at) && accessObject(consent.after) && consent.after.enabled === true && consent.after.issuer === user.issuer && consent.after.consentBy === consent.actor && positive(consent.after.consentVersion) && date(consent.after.consentAt) && Date.parse(consent.after.consentAt) <= Date.parse(consent.at) && Array.isArray(consent.after.mappings) && same(event.grantsAfter,consent.after.mappings.find(mapping => mapping.department === user.department)?.grants ?? [])),'scim_consent_audit');
 check(all('audit').some(credential => ['scim-credential-create-token','scim-credential-rotate'].includes(credential.action) && credential.record === 'main' && credential.generation === event.credentialGeneration && accessText(credential.actor) && email(credential.email) && date(credential.at) && Date.parse(credential.at) <= Date.parse(event.at)),'scim_credential_audit');
 for (const grant of [...event.grantsBefore,...event.grantsAfter]) check(accessObject(grant) && accessText(grant.role) && grant.role !== 'owner' && accessObject(grant.scope) && !Object.hasOwn(grant,'unlimited'),'scim_grant_history');
 for (const grant of event.grantsAfter) check(Array.isArray(grant.scope.departments) && same(grant.scope.departments,[user.department]),'scim_mapped_department');
}

export function validateScimMember(member,all,get) {
 check(accessShape(member.scim,['user','issuer','externalId']) && Object.hasOwn(member,'department') && Object.hasOwn(member,'manager'),'scim_member');
 const user = get('scimUser',member.scim.user);
 check(member.id === user.userName && member.email === user.userName && member.name === user.displayName && member.active === user.active && member.department === user.department && member.manager === user.manager && member.scim.issuer === user.issuer && member.scim.externalId === user.externalId,'scim_member_source');
 check(eventsFor(all,user.id).some(event => same(event.after,user) && same(event.grantsAfter,member.grants)),'scim_member_audit');
}

/** Domain provenance survives; native identities, sessions and bearers do not. */
export function validateScim(all,get,rows) {
 const users = all('scimUser'), audits = all('audit'), identities = new Set();
 for (const event of audits.filter(event => event.action?.startsWith('scim-credential-'))) check(['scim-credential-create-token','scim-credential-rotate','scim-credential-revoke'].includes(event.action) && accessShape(event,['id','actor','email','action','record','at','generation']) && event.record === 'main' && positive(event.generation) && accessText(event.actor) && email(event.email) && date(event.at),'scim_credential_metadata');
 for (const user of users) {
  userShape(user); get('member',user.userName);
  const identity = JSON.stringify([user.issuer,user.externalId]);
  check(!identities.has(identity) && users.filter(other => other.userName === user.userName).length === 1,'scim_user_identity'); identities.add(identity);
  const history = eventsFor(all,user.id).sort((a,b) => a.after?.version - b.after?.version);
  check(history.length === user.version,'scim_user_history');
  for (let index=0; index<history.length; index++) {
   const event = history[index]; userShape(event.after); provisioningEvidence(event,all);
   check(event.after.id === user.id && event.after.version === index+1 && event.after.issuer === user.issuer && event.after.externalId === user.externalId && event.after.userName === user.userName && event.after.createdAt === user.createdAt,'scim_user_history');
   check(index === 0 ? event.action === 'scim-user-create' && event.before === null && (event.grantsBefore.length === 0 || event.linkedMember === true && audits.some(link => link.action === 'scim-member-link' && link.record === user.id && link.issuer === user.issuer && link.externalId === user.externalId && link.memberEmail === user.userName && Date.parse(link.at) <= Date.parse(event.at))) : event.action === (event.after.active ? 'scim-user-update' : 'scim-user-deactivate') && same(event.before,history[index-1].after) && Date.parse(event.after.updatedAt) >= Date.parse(event.before.updatedAt),'scim_user_history');
   if (index > 0 && !same(event.grantsBefore,history[index-1].grantsAfter)) check(audits.some(native => native.action === 'member' && native.record === user.userName && email(native.email) && accessText(native.actor) && date(native.at) && Date.parse(native.at) >= Date.parse(history[index-1].at) && Date.parse(native.at) <= Date.parse(event.at) && same(native.after?.grants,event.grantsBefore)),'scim_grants_before');
   if (event.after.manager) check(get('scimUser',event.after.manager).issuer === user.issuer,'scim_manager_issuer');
  }
  check(same(history.at(-1)?.after,user),'scim_user_history');
  const seen = new Set([user.id]); let manager = user.manager;
  while (manager) { check(!seen.has(manager),'scim_manager_cycle'); seen.add(manager); const linked = get('scimUser',manager); check(linked.issuer === user.issuer,'scim_manager_issuer'); manager = linked.manager; }
 }
 for (const event of audits.filter(event => userActions.includes(event.action))) get('scimUser',event.record);
 const transfers = all('scimApprovalTransfer'), groups = new Map();
 for (const transfer of transfers) {
  check(accessShape(transfer,['id','request','requestRevision','policy','policyVersion','from','to','operator','operatorVersion','sequence','source','at'],['held','reassignedBy','chainStep','carriedFrom','carriedBy']) && accessText(transfer.id) && accessText(transfer.policyVersion) && email(transfer.from) && email(transfer.to) && transfer.to !== transfer.from && accessText(transfer.operator) && positive(transfer.operatorVersion) && positive(transfer.sequence) && positive(transfer.requestRevision) && date(transfer.at),'scim_transfer');
  const revision = get('revision',transfer.request+':'+transfer.requestRevision), request = get('request',transfer.request), source = get('scimUser',transfer.source); get('policy',transfer.policy);
  check(!request.imported && revision.request === transfer.request && (source.userName === transfer.from || transfer.reassignedBy || transfer.carriedFrom) && (transfer.held === true || transfer.operator !== revision.requester && transfer.to !== revision.requesterEmail),'scim_transfer_source');
  if(transfer.carriedFrom){const prior=get('scimApprovalTransfer',transfer.carriedFrom);check(prior.request===transfer.request&&prior.requestRevision<transfer.requestRevision&&prior.to===transfer.to&&prior.operator===transfer.operator&&prior.operatorVersion===transfer.operatorVersion&&prior.chainStep===transfer.chainStep&&accessText(transfer.carriedBy),'scim_transfer_carry');}
  check(eventsFor(all,source.id).some(event => Date.parse(event.after.updatedAt) <= Date.parse(transfer.at)),'scim_transfer_source_history');
  const currentPolicyRow = rows.find(row => row.kind === 'policy' && row.id === transfer.policy);
  if (currentPolicyRow?.revision === transfer.policyVersion && transfer.sequence === 1) check((transfer.chainStep?(()=>{const step=revision.approvalRoute?.find(step=>step.id===transfer.chainStep);return step?.emails??[step?.email];})():[get('policy',transfer.policy).approver]).includes(transfer.from),'scim_transfer_policy');
  check(audits.some(event => event.action === 'scim-approval-transfer' && (event.actor === 'scim-service' && event.email === '' && !transfer.reassignedBy && !transfer.carriedBy || event.actor === (transfer.reassignedBy??transfer.carriedBy) && email(event.email)) && event.record === transfer.request && event.transfer === transfer.id && date(event.at) && Date.parse(event.at) >= Date.parse(transfer.at) && Object.entries(transfer).every(([key,value]) => key === 'id' || same(event[key],value))),'scim_transfer_audit');
  const key = JSON.stringify([transfer.request,transfer.requestRevision,transfer.policy,transfer.policyVersion,transfer.chainStep??null]);
  groups.set(key,[...(groups.get(key) ?? []),transfer]);
 }
 for (const group of groups.values()) {
  group.sort((a,b) => a.sequence-b.sequence);
  check(group.every((transfer,index) => transfer.sequence === index+1 && (index === 0 || transfer.from === group[index-1].to && Date.parse(transfer.at) >= Date.parse(group[index-1].at))),'scim_transfer_sequence');
 }
 for (const event of audits.filter(event => event.action === 'scim-approval-transfer')) {
  const transfer = get('scimApprovalTransfer',event.transfer);
  check((event.actor === 'scim-service' && event.email === '' && !transfer.reassignedBy && !transfer.carriedBy || event.actor === (transfer.reassignedBy??transfer.carriedBy) && email(event.email)) && event.record === transfer.request && Object.entries(transfer).every(([key,value]) => key === 'id' || same(event[key],value)),'scim_transfer_audit');
 }
 for (const decision of all('decision').filter(decision => Object.hasOwn(decision,'scimTransfer'))) {
  const transfer = get('scimApprovalTransfer',decision.scimTransfer), revision = get('revision',decision.request+':'+decision.revision);
  check(!transfer.held && decision.request === transfer.request && (decision.chainStep??null)===(transfer.chainStep??null) && decision.revision === transfer.requestRevision && decision.policy === transfer.policy && decision.policyVersion === transfer.policyVersion && decision.actor === transfer.operator && decision.operatorVersion === transfer.operatorVersion && decision.email === transfer.to && typeof decision.owner === 'boolean' && !decision.delegation && accessText(decision.reason) && ['approved','rejected','returned'].includes(decision.decision) && date(decision.at) && Date.parse(decision.carriedAt??decision.at) >= Date.parse(transfer.at) && decision.actor !== revision.requester && decision.email !== revision.requesterEmail,'scim_decision_transfer');
  const group = groups.get(JSON.stringify([transfer.request,transfer.requestRevision,transfer.policy,transfer.policyVersion,transfer.chainStep??null]));
  check(!group.some(other => other.sequence > transfer.sequence && Date.parse(other.at) <= Date.parse(decision.carriedAt??decision.at)),'scim_decision_assignment');
  check(accessObject(decision.policySnapshot) && decision.policySnapshot.id === decision.policy && (transfer.chainStep?(()=>{const step=revision.approvalRoute?.find(step=>step.id===transfer.chainStep);return step?.emails??[step?.email];})():[decision.policySnapshot.approver]).includes(group[0].from),'scim_decision_policy');
  const policyRow = rows.find(row => row.kind === 'policy' && row.id === decision.policy);
  if (policyRow?.revision === decision.policyVersion) check(same(decision.policySnapshot,get('policy',decision.policy)),'scim_decision_policy');
  check(decision.carriedFrom || audits.some(event => event.action === 'decision' && event.record === decision.request && event.actor === decision.actor && event.email === decision.email && event.decisionId === decision.id && event.revision === decision.revision && event.decision === decision.decision && event.reason === decision.reason && date(event.at) && Date.parse(event.at) >= Date.parse(decision.at)),'scim_decision_audit');
 }
}
