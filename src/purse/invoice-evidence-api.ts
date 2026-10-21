import { protectedBody, protectedProof, protectedRefusal } from './protected-controls';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { migrateInvoiceEvidence, reenterInvoiceEvidence } from './invoice-evidence-history';
import { all, Fault, requireThat, type Actor, type Data } from './types';

export const invoiceEvidenceApi=new Hono<{Bindings:Bindings}>();
invoiceEvidenceApi.get('/api/purse/invoice-evidence',async c=>{
 const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),{state,revision}=await load(env.DB);
 requireThat(a.owner,'Current native owner required',403);
 const receipts=all(state,'invoiceEvidenceMigration');
 await readFence(env.DB,a,revision);
 return c.json({revision,receipts,pending:all(state,'invoice').filter(i=>i.evidenceHash&&!i.evidence).map(i=>({id:i.id,reference:i.reference}))});
});
invoiceEvidenceApi.post('/api/purse/invoice-evidence/:operation',async c=>{
 const env=runtimeBindings(c.env); let a:Actor|undefined;
 try {
  a=await actor(c.req.raw,env); const {state,revision}=await load(env.DB),before=structuredClone(state);
  requireThat(a.owner,'Current native owner required',403);
  const body:Data=await protectedBody(c.req.raw);
  requireThat(body.revision===revision,'State changed; reload before trying again',409);
  const operation=c.req.param('operation');
  requireThat(['migrate','reenter'].includes(operation),'Evidence operation unavailable',404);
  let result:Data,proofSince:number|undefined;
  if(operation==='migrate')result=migrateInvoiceEvidence(state,a);
  else {
   requireThat(typeof body.reason==='string'&&body.reason.trim()&&body.reason.length<=2000,'Private reason required');
   requireThat(typeof body.evidence==='string'&&body.evidence.trim()&&body.evidence.length<=2000,'Private evidence reference required');
   proofSince=Date.now()-600000;
   await protectedProof(env,a,proofSince);
   requireThat(typeof body.invoice==='string','Invoice required');
   result=reenterInvoiceEvidence(state,a,body.invoice,body);
  }
  await save(env.DB,a,before,state,revision,{statements:[],...(proofSince===undefined?{}:{proofSince})});
  return c.json(result);
 }catch(error){
  return protectedRefusal(env,c.req.raw,c.req.param('operation')==='reenter'?'legacy-reentry':'evidence-migrate',error,a);
 }
});
