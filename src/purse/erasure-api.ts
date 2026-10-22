import { eraseNativeCopies } from './erasure-native';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence } from './store';
import { protectedBody, protectedProof } from './protected-controls';
import { erasureChoices, erasureSubject } from './erasure-subject';
import { planErasure } from './erasure-plan';
import { executeErasure, finishErasure, erasureRetention } from './erasure-execute';
import { insertRfqRecord } from './rfq-links';
import { all, Fault, requireThat, uid, type Actor } from './types';

export const erasureApi=new Hono<{Bindings:Bindings}>();
erasureApi.get('/api/purse/erasure',async c=>{
 const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);
 const {state,revision}=await load(c.env.DB);await readFence(c.env.DB,a,revision);
 return c.json({revision,choices:erasureChoices(state),receipts:all(state,'erasureReceipt'),retained:erasureRetention});
});
erasureApi.post('/api/purse/erasure/:operation',async c=>{
 const env=runtimeBindings(c.env);let a:Actor|undefined;
 try {
  a=await actor(c.req.raw,env);requireThat(a.owner,'Current native owner required',403);
  const body=await protectedBody(c.req.raw),op=c.req.param('operation');
  requireThat(['preview','execute','resume'].includes(op),'Erasure operation unavailable',404);
  const {state,revision}=await load(env.DB);
  requireThat(body.revision===revision,'State changed; review erasure again',409);
  if(op==='resume'){await readFence(env.DB,a,revision);return c.json(await finishErasure(env,a,body.id));}
  const subject=await erasureSubject(env.DB,state,body),plan=planErasure(state,subject,op==='preview'?uid():body.review,revision);
  if(op==='preview') {
   const native=await eraseNativeCopies(env,plan,a);
   await readFence(env.DB,a,revision);
   return c.json({revision,review:plan.id,fingerprint:plan.fingerprint,subject:{kind:subject.kind,id:subject.id,email:subject.email},fields:plan.fields.map(({before,after,...field})=>field),affected:plan.affected,originals:plan.blobs.length,installationFields:native.installationFields,retained:erasureRetention});
  }
  requireThat(body.consent===true,'Explicit consent to the reviewed erasure and withdrawal of related originals is required');
  requireThat(body.fingerprint===plan.fingerprint,'Erasure inventory changed; review again',409);
  const since=Date.now()-600000;await protectedProof(env,a,since);
  return c.json(await executeErasure(env,a,state,revision,plan,since));
 }catch(error) {
  if(c.req.param('operation')!=='preview')await insertRfqRecord(env.DB,'audit',{id:uid(),actor:a?.id??'unidentified',action:'erasure-refused',record:'erasure',status:error instanceof Fault?error.status:409,reason:'Owner, origin, fresh proof, exact review or source custody refused',at:new Date().toISOString()}).run();
  if(error instanceof Fault)throw error;
  throw new Fault(409,'Erasure could not settle current authority or source custody. Reload and review; no partial financial changes were committed.');
 }
});
