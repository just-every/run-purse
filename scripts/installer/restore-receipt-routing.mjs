import {validateSendResult} from '../../src/modules/mail/src/core/validation.mjs';
export function validateReceiptRouting(all,get,check){
 const email=v=>typeof v==='string'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),scopes=new Set();
 for(const r of all('receiptRule')){
  const scope=JSON.stringify([r.order,r.location,r.purchaseType]);check(!scopes.has(scope),'receipt_rule_duplicate');scopes.add(scope);
  if(r.order)check(!get('order',r.order).imported||get('order',r.order).adoption,'receipt_rule_order');
  check(typeof r.location==='string'&&r.location.length&&typeof r.purchaseType==='string'&&r.purchaseType.length,'receipt_rule_scope');
  check(Number.isSafeInteger(r.version)&&r.version>0&&Array.isArray(r.history)&&r.history.length===r.version,'receipt_rule_history');
  for(const [index,e] of r.history.entries())check(e.version===index+1&&email(e.receiver)&&typeof e.active==='boolean'&&typeof e.reason==='string'&&e.reason.trim()&&typeof e.actor==='string'&&Number.isFinite(Date.parse(e.at)),'receipt_rule_entry');
  const last=r.history.at(-1);check(['version','receiver','active','reason','actor','at'].every(k=>r[k]===last[k]),'receipt_rule_snapshot');
 }
 for(const e of all('receiptPromptEvent')){
  check(get('order',e.order).issuedAt&&email(e.receiver)&&['delivery-due','invoice-waiting'].includes(e.reason)&&Number.isFinite(Date.parse(e.at)),'receipt_prompt');
  check(e.outcome?.recipient===e.receiver&&typeof e.outcome.status==='string','receipt_prompt_outcome');
  if(e.outcome.delivery)try{validateSendResult(e.outcome.delivery,e.outcome.delivery.provider)}catch{check(false,'receipt_prompt_provider')}
  check(['unknown','uncertain','unavailable','suppressed','accepted'].includes(e.outcome.status),'receipt_prompt_status');
 }
}
