import { eraseNativeCopies } from './erasure-native';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence } from './store';
import { protectedBody, protectedProof } from './protected-controls';
import { erasureChoices, erasureSubject } from './erasure-subject';
import { planErasure } from './erasure-plan';
import { erasureCoverage } from './erasure-coverage';
import { retentionStatus } from './erasure-retention';
import { readyDoor, retentionDoor } from './erasure-retention-api';
import { acknowledgeHistory, erasureHistory } from './erasure-history';
import { executeErasure, finishErasure, erasureRetention } from './erasure-execute';
import { erasureRefusal } from './erasure-refusal';
import { all, requireThat, uid, type Actor } from './types';

export const erasureApi=new Hono<{Bindings:Bindings}>();
erasureApi.get('/api/purse/erasure',async c=>{
 const env=runtimeBindings(c.env);let a:Actor|undefined;
 try {
  a=await actor(c.req.raw,env);requireThat(a.owner,'Current native owner required',403);
  const {state,revision}=await load(env.DB);
  // Native identity projections are not purchasing history; match the restore acknowledgment guard.
  const empty=!(await env.DB.prepare('SELECT 1 AS x FROM p_records LIMIT 1').first());
  await readFence(env.DB,a,revision);
  return c.json({revision,choices:erasureChoices(state),receipts:all(state,'erasureReceipt'),retained:erasureRetention,retention:await retentionStatus(env,state),history:await erasureHistory(env.DB),empty});
 }catch(error) {return erasureRefusal(env,'read',error,a);}
});
erasureApi.post('/api/purse/erasure/:operation',async c=>{
 const env=runtimeBindings(c.env);let a:Actor|undefined;
 try {
  a=await actor(c.req.raw,env);requireThat(a.owner,'Current native owner required',403);
  const body=await protectedBody(c.req.raw),op=c.req.param('operation');
  requireThat(['preview','execute','resume','retention','ready','history'].includes(op),'Erasure operation unavailable',404);
  const {state,revision}=await load(env.DB);
  requireThat(body.revision===revision,'State changed; review erasure again',409);
  if(op==='history')return c.json(await acknowledgeHistory(env,a,body));
  if(op==='retention'||op==='ready'){return c.json(await (op==='retention'?retentionDoor:readyDoor)(env,a,body,state,revision));}
  if(op==='resume'){await readFence(env.DB,a,revision);return c.json(await finishErasure(env,a,body.id));}
  const subject=await erasureSubject(env.DB,state,body),plan=planErasure(state,subject,op==='preview'?uid():body.review,revision);
  if(op==='preview') {
   const native=await eraseNativeCopies(env,plan,a);
   await readFence(env.DB,a,revision);
   return c.json({revision,review:plan.id,fingerprint:plan.fingerprint,subject:{kind:subject.kind,id:subject.id,email:subject.email},fields:plan.fields.map(({before,after,...field})=>field),affected:plan.affected,originals:plan.blobs.length,coverage:erasureCoverage(plan.fields),installationFields:native.installationFields,retained:erasureRetention});
  }
  requireThat(body.consent===true,'Explicit consent to the reviewed erasure and withdrawal of related originals is required');
  requireThat(body.fingerprint===plan.fingerprint,'Erasure inventory changed; review again',409);
  const since=Date.now()-600000;await protectedProof(env,a,since);
  return c.json(await executeErasure(env,a,state,revision,plan,since));
 }catch(error) {return erasureRefusal(env,c.req.param('operation'),error,a);}
});
