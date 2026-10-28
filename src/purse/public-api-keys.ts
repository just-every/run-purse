import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { actor, authority, load, readFence } from './store';
import { guardedBatch } from './integration-tokens';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { accessGrants } from './access';
import { requireThat, text, uid, type Actor, type Data } from './types';

export const apiScopes = ['requests:write','requests:read','orders:read','receipts:write','receipts:read','invoices:write','invoices:read','invoices:review','suppliers:write','suppliers:read','budgets:read'] as const;
export const newApiSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const apiKeyMetadata = (r: Data) => ({id:r.id,name:r.name,principal:r.principal,scopes:JSON.parse(r.scopes),recordScope:JSON.parse(r.record_scope),generation:r.generation,createdAt:r.created_at,expiresAt:r.expires_at,revokedAt:r.revoked_at});
export const publicKeysApi = new Hono<{Bindings:Bindings}>();
publicKeysApi.get('/api/purse/api-keys',async c=>{
    const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);
    const {revision}=await load(c.env.DB);
    const keys=(await c.env.DB.prepare('SELECT * FROM p_api_keys ORDER BY created_at,id').all<Data>()).results.map(apiKeyMetadata);
    const members=(await c.env.DB.prepare("SELECT id,display_name FROM oa_operators WHERE status='active'").all<Data>()).results.map(r=>({id:r.id,name:r.display_name}));
    await readFence(c.env.DB,a,revision);return c.json({keys,members,scopes:apiScopes});
});
publicKeysApi.post('/api/purse/api-keys',async c=>{
    const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);
    const b=await c.req.json(),{state,revision}=await load(c.env.DB);
    requireThat(Array.isArray(b.scopes)&&b.scopes.length&&b.scopes.every((s:unknown)=>apiScopes.includes(s as typeof apiScopes[number])),'Choose supported API scopes');
    const recordScope=b.recordScope??{};requireThat(recordScope&&typeof recordScope==='object'&&!Array.isArray(recordScope),'Supply a record scope');
    for(const [field,values] of Object.entries(recordScope))requireThat(['departments','locations','projects','entities'].includes(field)&&Array.isArray(values)&&values.length>0&&values.length<=100&&values.every(v=>typeof v==='string'&&v.length>0&&v.length<=200),'Use named record dimensions');
    const member=await c.env.DB.prepare("SELECT * FROM oa_operators WHERE id=? AND status='active'").bind(text(b.principal,'Active member',200)).first<Data>();
    requireThat(member,'Active native member required',409);
    const principal:Actor={id:member.id,email:member.email,version:member.version,owner:member.role==='owner',session:'',dev:false};
    requireThat(accessGrants(state,principal).length,'Active business membership required',409);
    const days=b.expiresDays===undefined?7:Number(b.expiresDays);requireThat(Number.isInteger(days)&&days>=1&&days<=30,'Expiry must be 1–30 days');
    const token=newApiSecret(),at=new Date().toISOString(),row={id:uid(),name:text(b.name,'Key name',100),principal:member.id,operator_version:member.version,native_owner:member.role==='owner'?1:0,scopes:JSON.stringify([...new Set(b.scopes)]),record_scope:JSON.stringify(recordScope),generation:1,created_at:at,expires_at:new Date(Date.now()+days*86400000).toISOString(),revoked_at:null};
    const auth=authority(a,true);
    await guardedBatch(c.env.DB,[c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END`).bind(...auth.params,revision,member.id,member.version),
        c.env.DB.prepare('INSERT INTO p_api_keys(id,hash,name,principal,operator_version,native_owner,scopes,record_scope,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(row.id,await hashRfqToken(token),row.name,row.principal,row.operator_version,row.native_owner,row.scopes,row.record_scope,at,row.expires_at),
        insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'api-key-create',record:row.id,at}),c.env.DB.prepare('DELETE FROM p_guard')]);
    return c.json({token,key:apiKeyMetadata(row)});
});
publicKeysApi.post('/api/purse/api-keys/:id/:action',async c=>{
    const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);
    const action=c.req.param('action');requireThat(['rotate','revoke','delete'].includes(action),'Unknown key action',404);
    const row=await c.env.DB.prepare('SELECT * FROM p_api_keys WHERE id=?').bind(c.req.param('id')).first<Data>();
    requireThat(row&&(action==='delete'||!row.revoked_at),'Key unavailable',409);
    const auth=authority(a,true),at=new Date().toISOString(),token=action==='rotate'?newApiSecret():null;
    const next={...row,generation:row.generation+(token?1:0),revoked_at:action==='revoke'?at:row.revoked_at};
    await guardedBatch(c.env.DB,[c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM p_api_keys WHERE id=? AND generation=? AND revoked_at IS ?) THEN 1 ELSE 0 END`).bind(...auth.params,row.id,row.generation,row.revoked_at),
        ...(action==='delete'?[c.env.DB.prepare('DELETE FROM p_api_receipts WHERE credential=?').bind(row.id),c.env.DB.prepare('DELETE FROM p_api_keys WHERE id=?').bind(row.id)]:[token?c.env.DB.prepare('UPDATE p_api_keys SET hash=?,generation=? WHERE id=?').bind(await hashRfqToken(token),next.generation,row.id):c.env.DB.prepare('UPDATE p_api_keys SET revoked_at=? WHERE id=?').bind(at,row.id)]),
        insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'api-key-'+action,record:row.id,at}),c.env.DB.prepare('DELETE FROM p_guard')]);
    return c.json({...(token?{token}:{}),key:apiKeyMetadata(next),deleted:action==='delete'});
});
