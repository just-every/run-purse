import assert from 'node:assert/strict';
import { harness } from './purse-harness.mjs';
export const email = n => ['synthetic-purse-' + n,'example.test'].join('@');
export const preference = {channel:'email',cadence:'immediate',timezone:'UTC',quiet:false,quietStart:'20:00',quietEnd:'07:00',weekends:false,digestAt:'07:00'};
export async function approvalEmailFixture(t) {
    const h = await harness({worker:'tests/accrual-worker.ts',clock:'2026-11-04T12:00:00Z'}); t?.after(()=>h.close());
    await h.command('business',{name:'synthetic-purse-6800',currencies:['USD'],locations:['Austin','Denver'],costCentres:['Operations'],projects:['General']});
    const requester = await h.member(email(6801),['requester']), approver = await h.member(email(6802),['approver']);
    const other = await h.member(email(6803),['approver']);
    const supplier = await h.command('supplier',{name:'synthetic-purse-6804',status:'preferred',reason:'synthetic-purse-6805 reviewed'});
    let policy = await h.command('policy',{name:'synthetic-purse-6806',currency:'USD',category:'goods',project:'General',approver:email(6802),limitMinor:10000000,budgetMinor:10000000});
    await h.command('notification-preferences',{...preference,version:0},approver);
    const draft = {title:'synthetic-purse-6807 request',supplier:supplier.id,currency:'USD',needDate:'2026-12-10',location:'Austin',costCentre:'Operations',terms:'Net 30',lines:[{description:'synthetic-purse-6808 goods',quantity:'1',unitMinor:100000,category:'goods',project:'General'}]};
    let sequence = 0;
    const create = async (extra={},cookie=requester) => {
        const request = await h.command('request',{...draft,title:'synthetic-purse-'+(6810+sequence++),...extra},cookie);
        await h.command('submit',{id:request.id,revision:request.revision},cookie); return request;
    };
    const link = async request => {
        const notices = (await h.send('/api/purse/notifications',undefined,approver)).value.items;
        const n = notices.findLast(n=>n.record===request.id && n.type==='approval-needed' && n.actionable);
        const urls = h.messages.filter(m=>m.subject==='Your Purse notification' && m.to.includes(email(6802)))
            .flatMap(m=>(m.text.match(/http:\/\/\S+/g)??[]).map(text=>new URL(text)));
        const url = urls.findLast(u=>u.searchParams.get('approvalEmail')===n?.id);
        assert.ok(url,'A genuine opted-in transport message contains the exact approval locator');
        return {url,path:'/api/purse/approval-email/'+url.searchParams.get('approvalEmail')+'/'+url.searchParams.get('source'),notification:n};
    };
    return {h,requester,approver,other,supplier,policy,draft,create,link};
}
export const rows = async h => (await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
export async function refuseUnchanged(h,path,body,cookie,status) {
    const before = await rows(h), r = await h.send(path,body,cookie);
    assert.equal(r.status,status,JSON.stringify(r.value)); assert.deepEqual(await rows(h),before,'Refusal leaves purchasing, budget, audit and notification rows unchanged'); return r;
}
