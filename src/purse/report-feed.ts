import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { guardedBatch } from './integration-tokens';
import { activeReportMember, boundReport, reportMember } from './report-authority';
import { reportTables } from './report-exports';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { actor, authority, load, readFence } from './store';
import { all, get, requireThat, text, uid, type Data } from './types';

export const reportFeedApi = new Hono<{ Bindings: Bindings }>();
const metadata = (key: Data) => ({ id: key.id, name: key.name, actor: key.actor, view: key.view, viewVersion: key.view_version,
    department: key.department, expiresAt: key.expires_at, revokedAt: key.revoked_at, generation: key.generation });
const newSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

reportFeedApi.get('/api/purse/report-keys', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Native owner required', 403);
    const { state, revision } = await load(c.env.DB);
    const keys = await c.env.DB.prepare('SELECT * FROM p_report_keys').all<Data>();
    await readFence(c.env.DB, a, revision);
    return c.json({ keys: keys.results.map(metadata), views: all(state, 'savedReport').map(view => ({id:view.id,name:view.name,actor:view.actor,version:view.version})) });
});
reportFeedApi.post('/api/purse/report-keys', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Native owner required', 403);
    const { state, revision } = await load(c.env.DB), b = await c.req.json();
    requireThat(b && Object.keys(b).every(key => ['view','version','name','department','expiresDays','consent'].includes(key)) && b.consent === true, 'Explicit report key consent required');
    const definition = get(state, 'savedReport', text(b.view, 'Saved view', 100));
    const member = await reportMember(c.env.DB, state, definition.actor);
    requireThat(b.version === definition.version, 'Saved view changed', 409);
    const days = b.expiresDays ?? 7;
    requireThat(Number.isInteger(days) && days >= 1 && days <= 30, 'Expiry must be 1–30 days');
    const count = await c.env.DB.prepare('SELECT count(*) n FROM p_report_keys WHERE revoked_at IS NULL').first<{n:number}>();
    requireThat(count!.n < 100, 'Revoke an unused report key first', 409);
    const key: Data = { id:uid(), name:text(b.name,'Integration name',100), actor:member.id, actor_version:member.version,
        view:definition.id, view_version:definition.version, department:b.department === undefined || b.department === '' ? '' : text(b.department,'Department',100),
        expires_at:new Date(Date.now()+days*86400000).toISOString(), revoked_at:null, generation:1 };
    boundReport(state, member, key);
    const token = newSecret(), hash = await hashRfqToken(token), auth = authority(a, true);
    await guardedBatch(c.env.DB, [
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeReportMember} THEN 1 ELSE 0 END`).bind(...auth.params,revision,member.id,member.version),
        c.env.DB.prepare('INSERT INTO p_report_keys(id,hash,name,actor,actor_version,view,view_version,department,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(key.id,hash,key.name,key.actor,key.actor_version,key.view,key.view_version,key.department,key.expires_at),
        insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'report-key-create',record:key.id,view:key.view,member:key.actor,department:key.department,at:new Date().toISOString()}),
        c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({token,key:metadata(key),url:new URL('/api/purse/report-feed/'+key.id+'/',c.req.url).href});
});
reportFeedApi.post('/api/purse/report-keys/:id/:action', async c => {
    const a = await actor(c.req.raw,c.env); requireThat(a.owner,'Native owner required',403);
    const action = c.req.param('action'); requireThat(['rotate','revoke'].includes(action),'Unknown key action',404);
    const key = await c.env.DB.prepare('SELECT * FROM p_report_keys WHERE id=? AND revoked_at IS NULL').bind(c.req.param('id')).first<Data>();
    requireThat(key,'Report key unavailable',404);
    const token = action === 'rotate' ? newSecret() : undefined, auth = authority(a,true);
    const change = token ? c.env.DB.prepare('UPDATE p_report_keys SET hash=?,generation=generation+1 WHERE id=?').bind(await hashRfqToken(token),key.id)
        : c.env.DB.prepare('UPDATE p_report_keys SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),key.id);
    await guardedBatch(c.env.DB,[
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM p_report_keys WHERE id=? AND generation=? AND revoked_at IS NULL) THEN 1 ELSE 0 END`).bind(...auth.params,key.id,key.generation),
        change,insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'report-key-'+action,record:key.id,at:new Date().toISOString()}),c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json({...(token?{token}:{}),id:key.id});
});

const property = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name
    : 'custom_'+Array.from(new TextEncoder().encode(name), byte=>byte.toString(16).padStart(2,'0')).join('');
const xml = (value:string) => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function edm(tables: ReturnType<typeof reportTables>) {
    const types = tables.map(table=>'<EntityType Name="'+table.name+'"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/>'
        +table.headers.map(header=>'<Property Name="'+property(header)+'" Type="'+(header==='revision'||header==='allocation'||header.endsWith('Minor')?'Edm.Int64':'Edm.String')+'"/>').join('')+'</EntityType>').join('');
    return '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="Purse" xmlns="http://docs.oasis-open.org/odata/ns/edm">'+types
        +'<EntityContainer Name="Reports">'+tables.map(table=>'<EntitySet Name="'+table.name+'" EntityType="Purse.'+table.name+'"/>').join('')+'</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
}
reportFeedApi.all('/api/purse/report-feed/:id/*', async c => {
    const env = runtimeBindings(c.env), url = new URL(c.req.url);
    requireThat(url.origin===env.AUTH_ORIGIN && (!c.req.header('origin')||c.req.header('origin')===env.AUTH_ORIGIN) && c.req.header('sec-fetch-site')!=='cross-site','Invalid origin',403);
    const secret = c.req.header('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    requireThat(secret,'Report bearer required',401);
    const hash = await hashRfqToken(secret), at = new Date().toISOString();
    const key = await c.env.DB.prepare('SELECT * FROM p_report_keys WHERE id=? AND hash=? AND revoked_at IS NULL AND expires_at>?').bind(c.req.param('id'),hash,at).first<Data>();
    requireThat(key,'Report bearer unavailable',401);
    requireThat(c.req.method==='GET','Read-only report feed',405);
    const minute=Math.floor(Date.now()/60000);
    const counted = await c.env.DB.prepare('UPDATE p_report_keys SET read_count=CASE WHEN read_window=? THEN read_count+1 ELSE 1 END,read_window=? WHERE id=? AND hash=? AND revoked_at IS NULL AND expires_at>? AND (read_window<>? OR read_count<60) RETURNING id').bind(minute,minute,key.id,hash,at,minute).first();
    requireThat(counted,'Report read limit exceeded',429);
    const {state,revision}=await load(c.env.DB), member=await reportMember(c.env.DB,state,key.actor,key.actor_version);
    const {report}=boundReport(state,member,key), tables=reportTables(report);
    const base=new URL('/api/purse/report-feed/'+key.id+'/',url), resource=url.pathname.slice(base.pathname.length);
    let response:Response;
    const headers={'odata-version':'4.0','cache-control':'no-store','x-content-type-options':'nosniff'};
    if(resource==='$metadata') {
        requireThat(!url.search,'Unsupported metadata query');
        response=new Response(edm(tables),{headers:{...headers,'content-type':'application/xml; charset=utf-8'}});
    } else if(resource==='') {
        requireThat(!url.search,'Unsupported service query');
        response=Response.json({'@odata.context':base.href+'$metadata',value:tables.map(table=>({name:table.name,kind:'EntitySet',url:table.name}))},{headers});
    } else {
        const table=tables.find(table=>table.name===resource);requireThat(table,'Unknown report collection',404);
        requireThat([...url.searchParams.keys()].every(key=>['$top','$skip','$count','$select'].includes(key)),'Unsupported OData query');
        const integer=(key:string,fallback:number)=>{const value=url.searchParams.get(key);requireThat(value===null||/^\d+$/.test(value),'Invalid page');const number=value===null?fallback:Number(value);requireThat(Number.isSafeInteger(number),'Invalid page');return number;};
        const skip=integer('$skip',0), top=integer('$top',1000);requireThat(top>0&&top<=1000,'Page size must be 1–1000');
        const fields=['Id',...table.headers.map(property)], selected=url.searchParams.get('$select')?.split(',')??fields;
        requireThat(selected.every(field=>fields.includes(field)),'Unknown report property');
        requireThat(!url.searchParams.has('$count')||['true','false'].includes(url.searchParams.get('$count')!),'Invalid count');
        const value=table.rows.slice(skip,skip+top).map((row,index)=>{
            const cells:Data=Object.fromEntries(table.headers.map((header,i)=>[property(header),(header==='revision'||header==='allocation'||header.endsWith('Minor'))&&row[i]===''?null:row[i]]));
            cells.Id=JSON.stringify(table.name==='Rows'?[cells.request,cells.revision,cells.kind,cells.line,cells.invoice,report.rows[skip+index].deposit,cells.allocation]:table.name==='Groups'?[cells.groupBy,report.groups[skip+index].value,cells.currency]:[cells.currency]);
            return Object.fromEntries(selected.map(field=>[field,cells[field]]));
        });
        const next=new URL(url);next.searchParams.set('$skip',String(skip+top));
        response=Response.json({'@odata.context':base.href+'$metadata#'+xml(resource),...(url.searchParams.get('$count')==='true'?{'@odata.count':table.rows.length}:{}),value,...(skip+top<table.rows.length?{'@odata.nextLink':next.href}:{})},{headers});
    }
    const authAt=new Date().toISOString();
    await guardedBatch(c.env.DB,[
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeReportMember} AND EXISTS(SELECT 1 FROM p_report_keys WHERE id=? AND hash=? AND revoked_at IS NULL AND expires_at>?) THEN 1 ELSE 0 END`).bind(revision,member.id,member.version,key.id,hash,authAt),
        insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:'integration:'+key.id,action:'report-feed-read',record:key.view,integration:key.id,resource,at:authAt}),c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return response;
});
