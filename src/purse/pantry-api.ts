import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, load, readFence, save } from './store';
import { all, audit, get, put, requireThat, text, type Data } from './types';
import { encryptPantry, loadPantry, pantryCall, pantryMetadata, validatePantryOrigin } from './pantry-client';
import { matchesPantryBill, pantryPlan } from './pantry-plan';
import { protectedBody } from './protected-controls';
import { insertRfqRecord } from './rfq-links';
import { retainPantryReturn } from './pantry-records';
import { readPantryReturn } from './pantry-return';

export const pantryApi = new Hono<{Bindings:Bindings}>();
pantryApi.use('/api/purse/pantry/*',async(c,next)=>{await next();if(c.res.status>=400)await insertRfqRecord(c.env.DB,'audit',{id:crypto.randomUUID(),actor:'pantry-door',action:'pantry-use-refused',record:'pantry',status:c.res.status,method:c.req.method,at:new Date().toISOString()}).run();});
pantryApi.use('/api/purse/pantry/*',async(c,next)=>{const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);await next();});
pantryApi.get('/api/purse/pantry', async c => {
    const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);
    const {state,revision}=await load(c.env.DB), row=await c.env.DB.prepare("SELECT * FROM p_pantry_credentials WHERE id='main'").first<Data>();
    await readFence(c.env.DB,a,revision);
    return c.json({connection:row?pantryMetadata(row):null,config:state.get('pantryConfig:main')?.value??null,syncs:all(state,'pantrySync')});
});
pantryApi.post('/api/purse/pantry/connection', async c => {
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),{state,revision}=await load(env.DB),before=structuredClone(state),b=await protectedBody(c.req.raw);
    requireThat(a.owner,'Current native owner required',403);requireThat(b.confirmed===true,'Explicit owner connection consent required');
    const origin=validatePantryOrigin(b.origin,env),currency=text(b.currency,'Pantry book currency',3).toUpperCase();requireThat(/^[A-Z]{3}$/.test(currency),'Choose the exact Pantry book currency');
    requireThat(all(state,'pantrySync').every(sync=>sync.origin===origin&&sync.currency===currency),'Existing Pantry identities belong to another origin or book currency',409);
    const old=await env.DB.prepare("SELECT * FROM p_pantry_credentials WHERE id='main'").first<Data>();requireThat((old?.generation??0)===b.generation,'Pantry connection changed; reload',409);
    const envelope=encryptPantry(env,b.token),at=new Date().toISOString(),generation=(old?.generation??0)+1;
    put(state,'pantryConfig','main',{origin,currency,confirmedBy:a.id,confirmedAt:at});audit(state,a,old?'pantry-credential-rotate':'pantry-credential-create','main',{origin,generation});
    await save(env.DB,a,before,state,revision,{statements:[env.DB.prepare(`INSERT INTO p_pantry_credentials(id,origin,generation,created_at,revoked_at,key_id,nonce,ciphertext,tag) VALUES('main',?,?,?,NULL,?,?,?,?) ON CONFLICT(id) DO UPDATE SET origin=excluded.origin,generation=excluded.generation,revoked_at=NULL,key_id=excluded.key_id,nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag`).bind(origin,generation,at,envelope.key_id,envelope.nonce,envelope.ciphertext,envelope.tag)]});
    return c.json({connection:{id:'main',origin,generation,createdAt:at,revokedAt:null}});
});
pantryApi.post('/api/purse/pantry/connection/:action', async c => {
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),{state,revision}=await load(env.DB),before=structuredClone(state),action=c.req.param('action');
    requireThat(['revoke','delete'].includes(action),'Connection action unavailable',404);
    const row=await env.DB.prepare("SELECT * FROM p_pantry_credentials WHERE id='main'").first<Data>();requireThat(row,'Connection unavailable',409);
    audit(state,a,'pantry-credential-'+action,'main',{origin:row.origin,generation:row.generation});
    await save(env.DB,a,before,state,revision,{statements:[action==='delete'?env.DB.prepare("DELETE FROM p_pantry_credentials WHERE id='main'"):env.DB.prepare("UPDATE p_pantry_credentials SET revoked_at=? WHERE id='main'").bind(new Date().toISOString())]});
    return c.json({ended:true});
});
pantryApi.get('/api/purse/pantry/options', async c => {
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),{revision}=await load(env.DB),credential=await loadPantry(env);
    const mappings=await pantryCall(env,credential,'/state');await readFence(env.DB,a,revision);
    return c.json({accounts:(mappings.accounts??[]).filter((account:Data)=>account.active&&['expense','asset','cost-of-goods-sold'].includes(account.type)).map((account:Data)=>({id:account.id,code:account.code,name:account.name})),vendors:(mappings.contacts??[]).filter((contact:Data)=>contact.kind==='vendor'&&contact.active).map((contact:Data)=>({id:contact.id,name:contact.name})),moreVendors:!!mappings.nextCursor});
});
pantryApi.post('/api/purse/pantry/preview',async c=>{
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),{state,revision}=await load(env.DB),credential=await loadPantry(env),config=get(state,'pantryConfig','main');
    const plan=pantryPlan(state,await protectedBody(c.req.raw),{...config,origin:credential.origin});await readFence(env.DB,a,revision);return c.json({plan});
});
pantryApi.post('/api/purse/pantry/sync',async c=>{
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),initial=await load(env.DB),b=await protectedBody(c.req.raw),credential=await loadPantry(env);
    requireThat(b.confirmed===true,'Explicit approval of the exact Pantry bill required');const reason=text(b.reason,'Posting approval reason');
    const plan=pantryPlan(initial.state,b,{...get(initial.state,'pantryConfig','main'),origin:credential.origin});requireThat(b.fingerprint===plan.fingerprint,'Review the current exact posting preview',409);
    const before=structuredClone(initial.state),old=initial.state.get('pantrySync:'+plan.invoice)?.value;
    put(initial.state,'pantrySync',plan.invoice,{...old,...plan,status:'attempting',actor:a.id,reason,at:new Date().toISOString(),credentialGeneration:credential.generation});audit(initial.state,a,'pantry-sync-attempt',plan.invoice,{origin:credential.origin,fingerprint:plan.fingerprint,generation:credential.generation});
    await save(env.DB,a,before,initial.state,initial.revision);
    const fence=async()=>{const fresh=await load(env.DB);pantryPlan(fresh.state,b,{...get(fresh.state,'pantryConfig','main'),origin:credential.origin});await readFence(env.DB,a,fresh.revision);};
    try {
        let vendorId=old?.externalVendorId??plan.vendorId;
        if(vendorId){const vendor=await pantryCall(env,credential,'/contacts/'+encodeURIComponent(vendorId));requireThat(vendor.kind==='vendor'&&vendor.active,'Mapped Pantry vendor is inactive or unavailable',409);}
        else {
            const matches=await pantryCall(env,credential,'/contacts?kind=vendor&name='+encodeURIComponent(plan.supplierName));
            requireThat(!matches.nextCursor && (matches.contacts?.length===0 || matches.contacts?.length===1 && matches.contacts[0].external_ref===plan.supplier),'An existing Pantry vendor has this name; explicitly map its ID before sync',409);
            if(matches.contacts.length)vendorId=matches.contacts[0].id;
            else {await fence();const vendor=await pantryCall(env,credential,'/contacts',{key:'purse-vendor:'+plan.supplier,body:{externalId:plan.supplier,kind:'vendor',name:plan.supplierName}});vendorId=vendor.id;}
        }
        const payload={vendorId,...plan.payload};
        const candidates=await pantryCall(env,credential,'/bills?vendorId='+encodeURIComponent(vendorId)+'&reference='+encodeURIComponent(plan.payload.reference));
        requireThat(!candidates.nextCursor&&candidates.bills?.length<=1,'Ambiguous Pantry bill identity; reconcile before sync',409);
        let bill=candidates.bills[0];
        if(bill)requireThat(matchesPantryBill(bill,plan.payload,vendorId),'Existing Pantry bill differs from this exact source; reconcile instead of duplicating',409);
        else {await fence();bill=await pantryCall(env,credential,'/bills',{body:payload,key:'purse-bill:'+plan.invoice});}
        requireThat(matchesPantryBill(bill,plan.payload,vendorId),'Pantry bill does not reconcile to the approved source',409);
        const returned=await readPantryReturn(env,credential,bill.id),fresh=await load(env.DB),prior=structuredClone(fresh.state);
        requireThat(pantryPlan(fresh.state,b,{...get(fresh.state,'pantryConfig','main'),origin:credential.origin}).fingerprint===plan.fingerprint,'Source changed during sync; reconcile the retained external identity',409);
        const live=await loadPantry(env);requireThat(live.generation===credential.generation,'Connection changed during sync; refresh explicitly',409);
        const sync=retainPantryReturn(fresh.state,a,{...get(fresh.state,'pantrySync',plan.invoice),externalId:bill.id,externalVendorId:vendorId},returned,credential.generation);
        await save(env.DB,a,prior,fresh.state,fresh.revision);
        return c.json({sync});
    } catch(error) {
        const fresh=await load(env.DB),prior=structuredClone(fresh.state),sync=get(fresh.state,'pantrySync',plan.invoice);
        if(sync.fingerprint===plan.fingerprint){put(fresh.state,'pantrySync',plan.invoice,{...sync,status:'held',outcome:'Check Pantry before explicit re-sync; an uncertain attempt may already have posted',at:new Date().toISOString()});audit(fresh.state,a,'pantry-sync-result',plan.invoice,{origin:credential.origin,outcome:'held',fingerprint:plan.fingerprint});await save(env.DB,a,prior,fresh.state,fresh.revision);}
        throw error;
    }
});

pantryApi.post('/api/purse/pantry/refresh',async c=>{
    const env=runtimeBindings(c.env),a=await actor(c.req.raw,env),b=await protectedBody(c.req.raw),credential=await loadPantry(env),initial=await load(env.DB),source=get(initial.state,'pantrySync',b.invoice);
    requireThat(source.externalId&&source.origin===credential.origin,'Retained Pantry external identity required',409);
    const initialBefore=structuredClone(initial.state);audit(initial.state,a,'pantry-return-attempt',source.invoice,{externalId:source.externalId,origin:source.origin,generation:credential.generation});await save(env.DB,a,initialBefore,initial.state,initial.revision);
    const returned=await readPantryReturn(env,credential,source.externalId),fresh=await load(env.DB),prior=structuredClone(fresh.state),current=get(fresh.state,'pantrySync',source.invoice);
    requireThat(current.externalId===source.externalId,'Pantry identity changed; reload',409);
    const sync=retainPantryReturn(fresh.state,a,current,returned,credential.generation);await save(env.DB,a,prior,fresh.state,fresh.revision);return c.json({sync});
});
