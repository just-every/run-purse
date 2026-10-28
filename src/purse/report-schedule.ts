import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { accessGrants } from './access';
import { guardedBatch } from './integration-tokens';
import { activeReportMember, boundReport, reportMember } from './report-authority';
import { reportExport } from './report-exports';
import { insertRfqRecord } from './rfq-links';
import { actor, authority, load, readFence } from './store';
import { Fault, get, requireThat, text, uid, type Data } from './types';

export const reportScheduleApi = new Hono<{ Bindings: Bindings }>();
reportScheduleApi.get('/api/purse/report-schedules', async c => {
    const a=await actor(c.req.raw,c.env),{state,revision}=await load(c.env.DB);
    await reportMember(c.env.DB,state,a.id,a.version);
    const schedules=await c.env.DB.prepare('SELECT * FROM p_report_schedules WHERE actor=?').bind(a.id).all<Data>();
    const members=await c.env.DB.prepare("SELECT id,email,version FROM oa_operators WHERE status='active'").all<Data>();
    const recipients=[];
    for(const member of members.results)try{await reportMember(c.env.DB,state,member.id,member.version);recipients.push(member);}catch(error){if(!(error instanceof Fault))throw error;}
    await readFence(c.env.DB,a,revision);
    return c.json({schedules:schedules.results,recipients});
});
reportScheduleApi.post('/api/purse/report-schedules', async c => {
    const a=await actor(c.req.raw,c.env),{state,revision}=await load(c.env.DB),b=await c.req.json();
    await reportMember(c.env.DB,state,a.id,a.version);
    requireThat(b && Object.keys(b).every(key=>['id','view','version','recipient','cadence','startAt','format','consent','remove'].includes(key)),'Unsupported schedule field');
    const auth=authority(a), prior=b.id?await c.env.DB.prepare('SELECT * FROM p_report_schedules WHERE id=? AND actor=?').bind(b.id,a.id).first<Data>():null;
    requireThat(!b.id||prior,'Schedule unavailable',404);
    if(b.remove===true) {
        requireThat(prior,'Schedule required');
        await guardedBatch(c.env.DB,[c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params),
            c.env.DB.prepare('UPDATE p_report_schedules SET enabled=0 WHERE id=? AND actor=?').bind(prior.id,a.id),
            insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'report-schedule-stop',record:prior.id,at:new Date().toISOString()}),c.env.DB.prepare('DELETE FROM p_guard')]);
        return c.json({stopped:prior.id});
    }
    requireThat(!b.id,'Stop the prior schedule before creating a new one');
    requireThat(accessGrants(state,a).some(grant=>grant.role!=='auditor'&&grant.permissions.includes('report.read')),'Read-only auditors cannot schedule reports',403);
    requireThat(b.consent===true,'Explicit scheduled email consent required');
    const definition=get(state,'savedReport',text(b.view,'Saved view',100));
    requireThat(definition.actor===a.id,'Saved view belongs to another member',403);
    requireThat(b.version===definition.version,'Saved view changed',409);
    requireThat(['weekly','monthly'].includes(b.cadence)&&['csv','xlsx'].includes(b.format),'Choose a cadence and attachment format');
    requireThat(typeof b.startAt==='string'&&Number.isFinite(Date.parse(b.startAt))&&new Date(b.startAt).toISOString()===b.startAt&&Date.parse(b.startAt)>Date.now(),'Choose a future UTC start time');
    const recipient=await reportMember(c.env.DB,state,text(b.recipient,'Recipient member',100));
    const schedule:Data={id:uid(),actor:a.id,actor_version:a.version,recipient:recipient.id,recipient_version:recipient.version,
        view:definition.id,view_version:definition.version,cadence:b.cadence,anchor:b.startAt,next_at:b.startAt,format:b.format,enabled:1};
    boundReport(state,a,schedule);boundReport(state,recipient,schedule);
    const count=await c.env.DB.prepare('SELECT count(*) n FROM p_report_schedules WHERE actor=? AND enabled=1').bind(a.id).first<{n:number}>();
    requireThat(count!.n<100,'Stop an unused schedule first',409);
    await guardedBatch(c.env.DB,[
        c.env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeReportMember} THEN 1 ELSE 0 END`).bind(...auth.params,revision,recipient.id,recipient.version),
        c.env.DB.prepare('INSERT INTO p_report_schedules(id,actor,actor_version,recipient,recipient_version,view,view_version,cadence,anchor,next_at,format) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(schedule.id,a.id,a.version,recipient.id,recipient.version,schedule.view,schedule.view_version,schedule.cadence,schedule.anchor,schedule.next_at,schedule.format),
        insertRfqRecord(c.env.DB,'audit',{id:uid(),actor:a.id,action:'report-schedule-create',record:schedule.id,view:schedule.view,recipient:recipient.id,cadence:schedule.cadence,at:new Date().toISOString()}),c.env.DB.prepare('DELETE FROM p_guard'),
    ]);
    return c.json(schedule);
});

// Weekly is seven UTC days. Monthly keeps the chosen UTC day, clamped in shorter
// months; missed periods coalesce into one current report, never a mail backlog.
function nextDue(schedule:Data,now:number) {
    const anchor=new Date(schedule.anchor);
    if(schedule.cadence==='weekly')return new Date(+anchor+(Math.floor((now-+anchor)/604800000)+1)*604800000).toISOString();
    const current=new Date(now);
    let month=(current.getUTCFullYear()-anchor.getUTCFullYear())*12+current.getUTCMonth()-anchor.getUTCMonth();
    for(;;month++) {
        const first=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+month,1,anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds()));
        const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
        first.setUTCDate(Math.min(anchor.getUTCDate(),last));
        if(+first>now)return first.toISOString();
    }
}
async function deliver(env:Bindings,schedule:Data,now:number) {
    const {state,revision}=await load(env.DB);
    const creator=await reportMember(env.DB,state,schedule.actor,schedule.actor_version),recipient=await reportMember(env.DB,state,schedule.recipient,schedule.recipient_version);
    boundReport(state,creator,schedule);
    const {definition,report}=boundReport(state,recipient,schedule);
    const content=new Uint8Array(await reportExport(report,schedule.format).arrayBuffer());
    requireThat(content.byteLength<=5000000,'Report attachment exceeds mail limit',413);
    const id=schedule.id+':'+schedule.next_at,at=new Date(now).toISOString();
    await guardedBatch(env.DB,[
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeReportMember} AND ${activeReportMember} AND EXISTS(SELECT 1 FROM p_report_schedules WHERE id=? AND enabled=1 AND next_at=?) THEN 1 ELSE 0 END`).bind(revision,creator.id,creator.version,recipient.id,recipient.version,schedule.id,schedule.next_at),
        env.DB.prepare('INSERT INTO p_report_deliveries(id,schedule,due_at,status,at) VALUES(?,?,?,\'uncertain\',?)').bind(id,schedule.id,schedule.next_at,at),
        env.DB.prepare('UPDATE p_report_schedules SET next_at=? WHERE id=?').bind(nextDue(schedule,now),schedule.id),
        deliveryAudit(env,schedule,id,'uncertain',at),env.DB.prepare('DELETE FROM p_guard'),
    ]);
    // A consumed claim is never retried, including a worker interruption or an
    // unknown provider acknowledgment. Recheck immediately before the mail edge.
    let status='suppressed';
    const fresh=await load(env.DB);
    await reportMember(env.DB,fresh.state,creator.id,creator.version);
    const currentRecipient=await reportMember(env.DB,fresh.state,recipient.id,recipient.version);
    boundReport(fresh.state,creator,schedule);
    const latest=boundReport(fresh.state,currentRecipient,schedule);
    const bytes=new Uint8Array(await reportExport(latest.report,schedule.format).arrayBuffer());
    requireThat(bytes.byteLength<=5000000,'Report attachment exceeds mail limit',413);
    const current=await env.DB.prepare(`SELECT 1 ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND ${activeReportMember} AND ${activeReportMember} AND EXISTS(SELECT 1 FROM p_report_schedules WHERE id=? AND enabled=1)`).bind(fresh.revision,creator.id,creator.version,recipient.id,recipient.version,schedule.id).first();
    if(current) {
        const sender=operatorMail(env);
        if(!sender||!env.MAIL_FROM)status='unavailable';
        else try {
            const message={deliveryId:'saved-report:'+id,from:env.MAIL_FROM,to:[currentRecipient.email],subject:'Saved report: '+definition.name,
                text:'Current report for your present procurement scope. Amounts are integer minor units and currencies remain separate.',html:'',headers:{},
                attachments:[{filename:'purse-report.'+schedule.format,contentType:schedule.format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content:bytes}]};
            const result=await sender.send(message);
            status=result.status==='development'?'suppressed':['accepted','uncertain'].includes(result.status)?result.status:'unavailable';
        } catch {status='uncertain';}
    }
    await env.DB.batch([env.DB.prepare('UPDATE p_report_deliveries SET status=? WHERE id=?').bind(status,id),deliveryAudit(env,schedule,id,status,at)]);
    return {id,status};
}
function deliveryAudit(env:Bindings,schedule:Data,id:string,status:string,at:string) {
    return insertRfqRecord(env.DB,'audit',{id:uid(),actor:schedule.actor,action:'report-delivery',record:schedule.view,schedule:schedule.id,delivery:id,status,at});
}
export async function runReportSchedules(original:Bindings,now:number) {
    const env=runtimeBindings(original),due=await env.DB.prepare('SELECT * FROM p_report_schedules WHERE enabled=1 AND next_at<=? ORDER BY next_at,id').bind(new Date(now).toISOString()).all<Data>(),events:Data[]=[];
    for(const schedule of due.results)try{events.push(await deliver(env,schedule,now));}catch(error){
        if(!(error instanceof Fault))throw error;
        // Invalid bindings pause only while that occurrence is still pending. A
        // concurrent successful claim has already advanced next_at and wins.
        await env.DB.prepare('UPDATE p_report_schedules SET enabled=0 WHERE id=? AND next_at=?').bind(schedule.id,schedule.next_at).run();
    }
    return {events};
}
