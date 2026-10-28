import { invoiceReading } from './invoice-reading';
import { apiRequestSchema } from './public-api-schema';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { readStream } from '../inbound-mail.server.mjs';
import { accessGrants, allowed, requirePermission } from './access';
import { unrestrictedPermission } from './access-records';
import { purchasingProjection } from './access-projection';
import { orderData } from './integration-po';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { load, save } from './store';
import { all, audit, get, requireThat, text, type Actor, type Data, type State } from './types';

type Execute = (s:State,a:Actor,op:string,b:Data,env:Bindings)=>Promise<Data>;
const pick=(r:Data,fields:string)=>Object.fromEntries(fields.split(' ').filter(field=>r[field]!==undefined).map(field=>[field,r[field]]));
const scopeFor:Record<string,string>={request:'requests:write',receipt:'receipts:write','invoice-source':'invoices:write','invoice-extract':'invoices:write','invoice-reading-edit':'invoices:write','invoice-reading-propose':'invoices:write','invoice-risk-review':'invoices:review',supplier:'suppliers:write'};
const permissionFor:Record<string,string>={request:'request.create',receipt:'receive',invoiceSource:'invoice.capture',invoiceReading:'invoice.capture',invoice:'invoice.review',supplier:'procurement.manage'};
const requestFields='title supplier currency needDate location costCentre lines freightAmount freightMinor taxAmount taxMinor terms poDetails glAccount class shipTo notes intakeFields charges valuePromise';
function only(body:Data,fields:string){requireThat(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(key=>fields.split(' ').includes(key)),'Unsupported input field');return body;}
function supplierVisible(s:State,a:Actor,r:Data){return unrestrictedPermission(s,a,'request.read')||unrestrictedPermission(s,a,'procurement.manage')||all(s,'request').some(p=>p.supplier===r.id&&allowed(s,a,'request.read',p))||all(s,'invoice').some(p=>p.supplier===r.id&&allowed(s,a,'invoice.read',p));}
function projection(s:State,a:Actor,kind:string,id:string){
    const r=get(s,kind,id);
    if(kind==='request') return {...pick(r,'id title supplier currency needDate location costCentre revision status totalMinor'),lines:r.lines.map((l:Data)=>pick(l,'id description quantity unit unitMinor totalMinor project category'))};
    if(kind==='order')return orderData(r,[]);
    if(kind==='supplier')return pick(r,'id name dba address status');
    if(kind==='receipt')return pick(r,'id order line event quantity q reason at');
    if(kind==='invoice')return {...pick(r,'id order reference currency totalMinor invoiceDate sourceConfirmation riskVersion'),flags:(r.flags??[]).map((f:Data)=>pick(f,'id code')),reviewedFlagIds:(r.riskReviews??[]).map((review:Data)=>review.flag)};
    return pick(r,'id order orderRevision source version status attachment invoice');
}
async function keyActor(request:Request,env:Bindings){
    requireThat(new URL(request.url).origin===env.AUTH_ORIGIN,'Invalid host',403);
    requireThat(!request.headers.get('origin')||request.headers.get('origin')===env.AUTH_ORIGIN,'Invalid origin',403);
    requireThat(request.headers.get('sec-fetch-site')!=='cross-site','Invalid origin',403);
    const bearer=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];requireThat(bearer,'Scoped API bearer required',401);
    const hash=await hashRfqToken(bearer),at=new Date().toISOString();
    const key=await env.DB.prepare('SELECT * FROM p_api_keys WHERE hash=? AND revoked_at IS NULL AND expires_at>?').bind(hash,at).first<Data>();requireThat(key,'API key unavailable',401);
    const operator=await env.DB.prepare("SELECT * FROM oa_operators WHERE id=? AND version=? AND status='active' AND (role='owner')=?").bind(key.principal,key.operator_version,key.native_owner).first<Data>();requireThat(operator,'Bound native identity changed',403);
    const a:Actor={id:operator.id,email:operator.email,version:operator.version,owner:operator.role==='owner',dev:false,session:'',apiKey:{id:key.id,hash,scope:JSON.parse(key.record_scope)}};
    const window=Math.floor(Date.now()/60000);
    const counted=await env.DB.prepare('UPDATE p_api_keys SET rate_count=CASE WHEN rate_window=? THEN rate_count+1 ELSE 1 END,rate_window=? WHERE id=? AND hash=? AND revoked_at IS NULL AND expires_at>? AND (rate_window<>? OR rate_count<120) RETURNING id').bind(window,window,key.id,hash,at,window).first();requireThat(counted,'API rate limit exceeded or key ended',429);
    return {a,key};
}
const paths:Record<string,Data>={
 '/requests':{post:{op:'createRequestDraft',scope:'requests:write',fields:requestFields,summary:'Create a draft only; native submission and approval remain required'}},
 '/requests/{id}':{get:{op:'readRequest',scope:'requests:read'}},
 '/orders/{id}':{get:{op:'readOrder',scope:'orders:read'}},
 '/receipts':{get:{op:'readReceipts',scope:'receipts:read'},post:{op:'recordReceipt',scope:'receipts:write',fields:'order line event quantity reason valueAmount valueMinor milestone'}},
 '/invoice-sources':{post:{op:'captureInvoiceOriginal',scope:'invoices:write',fields:'order document invoice'}},
 '/invoice-sources/{id}/instructions':{get:{op:'readInvoiceSourceInstructions',scope:'invoices:read',summary:'Read the exact source descriptor and blank proposal template, without original bytes'}},
 '/invoice-readings':{post:{op:'extractInvoice',scope:'invoices:write',fields:'source'}},
 '/invoice-readings/propose':{post:{op:'proposeInvoiceReading',scope:'invoices:write',fields:'source reader fields'}},
 '/invoice-readings/{id}/edit':{post:{op:'correctInvoiceReading',scope:'invoices:write',fields:'version changes'}},
 '/invoices/{id}':{get:{op:'readInvoice',scope:'invoices:read'}},
 '/invoices/{id}/reviews':{post:{op:'reviewInvoiceRisk',scope:'invoices:review',fields:'flag version reason'}},
 '/suppliers':{get:{op:'readSuppliers',scope:'suppliers:read'},post:{op:'createUnprotectedSupplier',scope:'suppliers:write',fields:'name dba address contacts status reason duplicateFingerprint duplicateReason'}},
 '/budgets':{get:{op:'readBudgets',scope:'budgets:read'}},
};
export function openApi(origin:string){return {openapi:'3.1.0',info:{title:'Purse scoped API',version:'1.0.0',description:'Allowlisted native purchasing doors. Keys intersect current native membership and record scope. No supplier sending, payment, protected reveal, original download, RFQ or email administration.'},servers:[{url:origin+'/api/purse/v1'}],security:[{scopedKey:[]}],components:{securitySchemes:{scopedKey:{type:'http',scheme:'bearer'}}},paths:Object.fromEntries(Object.entries(paths).map(([path,methods])=>[path,Object.fromEntries(Object.entries(methods).map(([method,d])=>[method,{operationId:d.op,summary:d.summary??d.op,description:'Required key scope: '+d.scope,'x-required-scope':d.scope,parameters:[...(path.includes('{id}')?[{name:'id',in:'path',required:true,schema:{type:'string'}}]:[]),...(method==='post'?[{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',maxLength:200}}]:[]),...(path==='/receipts'&&method==='get'?[{name:'order',in:'query',required:true,schema:{type:'string'}}]:[])],...(method==='post'?{requestBody:{required:true,content:{'application/json':{schema:apiRequestSchema(d.op,d.fields)}}}}:{}),responses:{200:{description:'Current authorized resource; repeated writes return the same resource with duplicate=true',content:{'application/json':{schema:{type:'object'}}}},400:{description:'Invalid input'},401:{description:'Missing, expired, rotated or revoked key'},403:{description:'Key scope or current authority refused'},409:{description:'Source, revision, authority or idempotency conflict'},429:{description:'Rate limit exceeded'}}}]))]))};}
export function publicApi(execute:Execute){
 const app=new Hono<{Bindings:Bindings}>();
 app.get('/api/purse/v1/openapi.json',c=>c.json(openApi(runtimeBindings(c.env).AUTH_ORIGIN)));
 app.all('/api/purse/v1/*',async c=>{
    const env=runtimeBindings(c.env),{a,key}=await keyActor(c.req.raw,env),{state,revision}=await load(env.DB);
    requireThat(accessGrants(state,a).length,'Current business membership required',403);
    const scopes=JSON.parse(key.scopes) as string[],need=(scope:string)=>requireThat(scopes.includes(scope),'API scope refused',403);
    const path=c.req.path.slice('/api/purse/v1'.length),method=c.req.method;
    let result:Data;
    if(method==='GET'){
        const record=path.match(/^\/(requests|orders|invoices)\/([^/]+)$/);
        if(record){const [,plural,id]=record,kind=plural==='requests'?'request':plural==='orders'?'order':'invoice';need(plural==='orders'?'orders:read':plural+':read');requirePermission(state,a,kind==='order'?'po.read':kind+'.read',get(state,kind,id));result={[kind]:projection(state,a,kind,id)};}
        else if(/^\/invoice-sources\/[^/]+\/instructions$/.test(path)){need('invoices:read');result={instructions:await invoiceReading(state,a,'invoice-reading-instructions',{source:path.split('/')[2]})};}
        else if(path==='/receipts'){need('receipts:read');const order=get(state,'order',text(c.req.query('order'),'Order'));requirePermission(state,a,'po.read',order);result={receipts:all(state,'receipt').filter(r=>r.order===order.id).map(r=>projection(state,a,'receipt',r.id))};}
        else if(path==='/suppliers'){need('suppliers:read');result={suppliers:all(state,'supplier').filter(r=>supplierVisible(state,a,r)).map(r=>projection(state,a,'supplier',r.id))};}
        else if(path==='/budgets'){need('budgets:read');requirePermission(state,a,'request.read');const data=purchasingProjection(state,a).data;result={budgets:data.policy.map((p:Data)=>pick(p,'id name currency budgetMinor limitMinor budgetPeriod costCentre location project'))};}
        else {requireThat(false,'API door unavailable',404);}
        const beforeRead=structuredClone(state);audit(state,a,'api-read',key.id,{door:record?.[1]??path.slice(1)});await save(env.DB,a,beforeRead,state,revision);return c.json(result);
    }
    requireThat(method==='POST','API door unavailable',404);
    let op:string,kind:string,fields:string,routeId:string|undefined;
    if(path==='/requests'){op='request';kind='request';fields=requestFields;}
    else if(path==='/receipts'){op='receipt';kind='receipt';fields=paths['/receipts'].post.fields;}
    else if(path==='/suppliers'){op='supplier';kind='supplier';fields=paths['/suppliers'].post.fields;requireThat(unrestrictedPermission(state,a,'procurement.manage'),'Unrestricted current procurement permission required',403);}
    else if(path==='/invoice-sources'){op='invoice-source';kind='invoiceSource';fields=paths['/invoice-sources'].post.fields;}
    else if(path==='/invoice-readings'){op='invoice-extract';kind='invoiceReading';fields='source';}
    else if(path==='/invoice-readings/propose'){op='invoice-reading-propose';kind='invoiceReading';fields='source reader fields';}
    else if(/^\/invoice-readings\/[^/]+\/edit$/.test(path)){op='invoice-reading-edit';kind='invoiceReading';routeId=path.split('/')[2];fields='version changes';}
    else if(/^\/invoices\/[^/]+\/reviews$/.test(path)){op='invoice-risk-review';kind='invoice';routeId=path.split('/')[2];fields='flag version reason';}
    else {requireThat(false,'API door unavailable',403);}
    need(scopeFor[op]);
    const idempotency=text(c.req.header('idempotency-key'),'Idempotency-Key',200);requireThat(/^[\x21-\x7e]+$/.test(idempotency),'Use visible ASCII for Idempotency-Key');
    const raw=await readStream(c.req.raw.body,1_600_000),hash=await hashRfqToken(method+' '+path+' '+new TextDecoder('utf-8',{fatal:true}).decode(raw));
    const receipt=await env.DB.prepare('SELECT * FROM p_api_receipts WHERE credential=? AND idempotency_key=?').bind(key.id,idempotency).first<Data>();
    if(receipt){requireThat(receipt.request_hash===hash,'Idempotency-Key already used for another request',409);requirePermission(state,a,permissionFor[receipt.kind],get(state,receipt.kind,receipt.record));const beforeReplay=structuredClone(state);audit(state,a,'api-replay',receipt.record,{operation:op});await save(env.DB,a,beforeReplay,state,revision);return c.json({[receipt.kind]:projection(state,a,receipt.kind,receipt.record),duplicate:true});}
    let body:Data;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{requireThat(false,'Invalid request JSON');}
    only(body,fields);if(routeId)body[op==='invoice-risk-review'?'invoice':'id']=routeId;
    const before=structuredClone(state),value=await execute(state,a,op,body,env);
    // API writes retain only a resource reference for replay, never original bytes or a secret snapshot.
    audit(state,a,'api-write',value.id,{operation:op});
    await save(env.DB,a,before,state,revision,undefined,[env.DB.prepare('INSERT INTO p_api_receipts(credential,idempotency_key,request_hash,kind,record) VALUES(?,?,?,?,?)').bind(key.id,idempotency,hash,kind,value.id)]);
    return c.json({[kind]:projection(state,a,kind,value.id),duplicate:false});
 });
 return app;
}
