import type { Bindings } from '../auth.server';
import { currentDecision } from './approval';
import { currentOrderSender } from './order-response';
import { authority,load } from './store';
import { get,put,audit,requireThat,text,type Actor,type Data } from './types';

/** A document-only bearer never silently acquires receiving/invoice access. */
export async function orderInvoiceConsent(env:Bindings,a:Actor,id:string,b:Data) {
 requireThat(a.owner,'Current native owner required to authorize supplier invoice access',403);
 requireThat(b.consent===true && typeof b.enabled==='boolean','Explicit invoice capability consent is required');
 const {state,revision}=await load(env.DB),order=get(state,'order',id),event=get(state,'orderSend','order-send:'+id);
 requireThat(order.status==='issued' && !order.imported && !order.adoption && order.revision===b.revision && event.revision===order.revision
  && !event.erasure && !event.revokedAt && Date.parse(event.expiresAt)>Date.now() && await currentOrderSender(env,state,event),'Choose this exact current available native supplier link',409);
 const reason=text(b.reason,'Invoice capability reason'),at=new Date().toISOString();
 const entry={version:(event.invoiceConsent?.version??0)+1,enabled:b.enabled,actor:a.id,operatorVersion:a.version,owner:true,at,reason,revision:order.revision,pdfSha256:event.pdf.sha256};
 const before=new Map(state);put(state,'orderSend',event.id,{...event,invoiceSubmission:b.enabled,invoiceConsent:entry,invoiceConsentHistory:[...(event.invoiceConsentHistory??[]),entry]});
 audit(state,a,'order-invoice-consent',order.id,{send:event.id,...entry});
 const auth=authority(a,true),decision=currentDecision(state,get(state,'request',order.request));
 const proofs=[{actor:event.actor,version:event.operatorVersion},...(decision.chainProofs??[{actor:decision.actor,version:decision.operatorVersion}])];
 const guard=env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM p_order_send_links WHERE send=? AND revoked_at IS NULL AND expires_at>?) THEN 1 ELSE 0 END`).bind(...auth.params,revision,event.id,Date.now());
 try {await env.DB.batch([guard,...proofs.map((proof:Data)=>env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(proof.actor,proof.version)),
  ...[...state].filter(([key,row])=>before.get(key)?.revision!==row.revision).map(([,row])=>env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main',?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value").bind(row.kind,row.id,row.revision,JSON.stringify(row.value))),env.DB.prepare('DELETE FROM p_guard')]);}
 catch(error){requireThat(!/CHECK constraint/.test(String(error)),'Authority, order or link changed; reload',409);throw error;}
 return {enabled:b.enabled,version:entry.version,at};
}
