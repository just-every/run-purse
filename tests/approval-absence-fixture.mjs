import assert from 'node:assert/strict';
import { harness } from './purse-harness.mjs';
export const address=n=>'synthetic-purse-'+n+'@'+'example.test';
export const before='2026-10-29T14:00:00.000Z', during='2026-10-30T14:00:00.000Z', after='2026-10-30T22:00:00.000Z';
export async function absenceFixture(t) {
    const h=await harness({worker:'tests/approval-absence-worker.ts',clock:before});t?.after(()=>h.close());
    await h.command('business',{name:'synthetic-purse-7100',currencies:['USD'],locations:['Denver','Austin'],costCentres:['Operations'],projects:['Office'],timezone:'America/New_York'});
    const requester=await h.member(address(7101),['requester']), approver=await h.member(address(7102),['approver']), delegate=await h.member(address(7103),['approver','requester']), outsider=await h.member(address(7104),['requester']);
    const supplier=await h.command('supplier',{name:'synthetic-purse-7105',status:'preferred',reason:'Reviewed native supplier'});
    const policy=await h.command('policy',{name:'Absence review policy',currency:'USD',category:'*',project:'Office',approver:address(7102),limitMinor:10000000,budgetMinor:100000000});
    const config={policy:policy.id,from:address(7102),delegate:address(7103),version:0,timezone:'America/New_York',start:'2026-10-30T09:00',end:'2026-10-30T17:00',reason:'Planned out of office'};
    const read=async(id,cookie=h.owner)=>(await h.state(cookie)).data.request.find(r=>r.id===id);
    const create=async(cookie=requester,title='Review an office purchase')=>{const r=await h.command('request',{title,supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Office equipment',quantity:'1',unitMinor:100000,category:'Equipment',project:'Office'}]},cookie);await h.command('submit',{id:r.id,revision:r.revision},cookie);return read(r.id);};
    const decide=(r,cookie,expected=200)=>h.command('decision',{id:r.id,revision:r.revision,chainStep:r.approvalStep,approvalAttempt:r.approvalAttempt,decision:'approved',reason:'Current exact terms reviewed'},cookie,expected);
    const tick=async(time)=>{const r=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+Date.parse(time));assert.equal(r.status,200,await r.text());};
    const clock=async time=>{await h.setClock(time);await h.state();};
    const raw=async kind=>(await h.db.prepare('SELECT value FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results.map(r=>JSON.parse(r.value));
    return {h,requester,approver,delegate,outsider,supplier,policy,config,read,create,decide,tick,clock,raw};
}
