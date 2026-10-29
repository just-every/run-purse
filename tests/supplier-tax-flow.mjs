
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import {harness} from './purse-harness.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';
import {supplierTaxFixture,taxEmail} from './supplier-tax-fixture.mjs';
async function scenario(name,run){const cleanups=[];const t={after:fn=>cleanups.push(fn),test:async(title,fn)=>fn(t)};try{await run(t);}catch(error){error.message=name+': '+error.message;throw error;}finally{for(const close of cleanups.reverse())await close();}}

export async function supplierTaxFlow(){


await scenario('Human supplier tax review binds private W-9 bytes, keeps decisions and refuses stale or unauthorized changes through native HTTP',async t=>{
    const f=await supplierTaxFixture();t.after(()=>f.h.close());const {h}=f;
    assert.equal((await f.view()).eligibility,'unknown');assert.equal((await f.view()).backupWithholding,'unknown');
    const snapshot=async()=>(await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
    const pristine=await snapshot(),captured=await f.input();
    for(const cookie of [f.buyer,f.requester,f.auditor])await h.command('supplier-tax-review',captured,cookie,403);
    assert.equal((await h.send('/api/purse/command/supplier-tax-review',captured)).status,401);
    for(const changes of [{reviewed:false},{eligibility:'ineligible',box:'NEC-1'},{eligibility:'eligible',box:null},{backupWithholding:'verified'},{tin:String(987654321)}])await h.command('supplier-tax-review',{...captured,...changes},h.owner,400);
    for(const changes of [{sha256:'0'.repeat(64)},{documentVersion:2},{attachment:f.supplier.id}])await h.command('supplier-tax-review',{...captured,...changes},h.owner,409);
    assert.deepEqual(await snapshot(),pristine);
    const eligible=await h.command('supplier-tax-review',captured);
    assert.equal(eligible.sha256,createHash('sha256').update(f.original).digest('hex'));assert.equal(eligible.documentVersion,1);assert.equal((await f.view()).current.id,eligible.id);
    const afterEligible=await snapshot();await h.command('supplier-tax-review',captured,h.owner,409);assert.deepEqual(await snapshot(),afterEligible,'Replayed capture changes nothing');
    const misc=await h.command('supplier-tax-review',await f.input({box:'MISC-6',backupWithholding:'required'}));
    const ineligible=await h.command('supplier-tax-review',await f.input({eligibility:'ineligible',box:null,backupWithholding:'not-required'}));
    const unknown=await h.command('supplier-tax-review',await f.input({eligibility:'unknown',box:null,backupWithholding:'unknown'}));
    assert.deepEqual((await f.view()).history.map(row=>[row.eligibility,row.box,row.backupWithholding]),[['eligible','NEC-1','not-required'],['eligible','MISC-6','required'],['ineligible',null,'not-required'],['unknown',null,'unknown']]);
    assert.equal(ineligible.supersedes,misc.id);assert.equal(unknown.supersedes,ineligible.id);assert.equal((await f.view()).history[0].reviewStatus,'Superseded');
    const stale=await f.input();
    const refresh=await h.send('/api/purse/supplier-document-refresh',{id:f.document.id},f.buyer);assert.equal(refresh.status,200);
    const form=new FormData();form.set('file',new File(['synthetic-purse-6309 changed W-9 original'],'synthetic-purse-6309.txt',{type:'text/plain'}));
    assert.equal((await fetch(refresh.value.reminders[0].refreshUrl,{method:'POST',headers:{origin:h.origin},body:form})).status,200);
    const pending=(await h.state()).data.supplierDocumentSubmission.find(row=>row.document===f.document.id&&row.status==='pending');
    assert.equal((await f.view()).current,null,'A pending replacement requires a fresh human review');
    assert.equal((await f.view()).eligibility,'unknown');
    const pendingState=await snapshot();
    await h.command('supplier-tax-review',{...stale,basis:(await f.view()).basis},h.owner,409);
    assert.deepEqual(await snapshot(),pendingState,'The old reviewed original cannot bypass a pending replacement');
    const replacement={id:pending.attachment};
    const document=await h.command('review-supplier-document',{id:f.document.id,version:1,submission:pending.id,attachment:replacement.id,expires:'2099-12-31'},f.buyer);
    assert.equal((await f.view()).current,null);assert.equal((await f.view()).eligibility,'unknown');
    const beforeStale=await snapshot();await h.command('supplier-tax-review',stale,h.owner,409);assert.deepEqual(await snapshot(),beforeStale);
    const renewed=await h.command('supplier-tax-review',await f.input());assert.equal(renewed.documentVersion,document.version);assert.equal(renewed.attachment,replacement.id);
    assert.equal((await h.send('/api/purse/download/attachment/'+f.file.id,undefined,h.owner)).value,f.original);
    assert.equal((await h.send('/api/purse/download/attachment/'+f.file.id,undefined,f.requester)).status,403);
    const publicFile=await h.command('attachment',{kind:'supplier',record:f.supplier.id,name:'synthetic-purse-6310.txt',base64:Buffer.from('synthetic-purse-6311').toString('base64')},f.buyer);
    await h.command('supplier-document',{supplier:f.supplier.id,type:'w9',attachment:publicFile.id,expires:'2099-12-31',required:false,reminderDays:[],version:0},f.buyer,409);
    const nonW9=await h.command('supplier-document',{supplier:f.supplier.id,type:'insurance',attachment:replacement.id,expires:'2099-12-31',required:false,reminderDays:[],version:0},f.buyer);
    await h.command('supplier-tax-review',{...await f.input(),document:nonW9.id},h.owner,409);
    const second=await h.command('supplier',{name:'synthetic-purse-6312',status:'active',reason:'Reviewed surviving supplier'},f.buyer);
    const merge=await h.command('preview-supplier-merge',{source:f.supplier.id,target:second.id},f.buyer);
    await h.command('merge-suppliers',{source:f.supplier.id,target:second.id,fingerprint:merge.fingerprint,reason:'Reviewed supplier consolidation'},f.buyer);
    const merged=await f.view(second.id);assert.equal(merged.current,null);assert.equal(merged.history.length,5);assert.equal(merged.history.at(-1).sha256,renewed.sha256);
    await h.command('supplier-tax-review',await f.input({},second.id));assert.equal((await f.view(second.id)).current.sourceSupplier,f.supplier.id);
    for(const cookie of [f.buyer,f.requester,f.auditor])assert.deepEqual((await h.state(cookie)).data.supplierTax,[]);
    for(const endpoint of ['/api/purse/audit','/api/purse/audit.csv']) {
        const response=await h.send(endpoint,undefined,h.owner);assert.equal(response.status,200);assert.ok(JSON.stringify(response.value).includes(eligible.sha256));assert.ok(!JSON.stringify(response.value).includes(String(987654321)));
        const scoped=await h.send(endpoint,undefined,f.auditor);assert.equal(scoped.status,200);assert.ok(!JSON.stringify(scoped.value).includes(eligible.sha256));
    }
    const audit=(await h.send('/api/purse/audit',undefined,h.owner)).value.events.filter(event=>event.action==='supplier-tax-review');assert.equal(audit.length,6);assert.deepEqual(audit.find(row=>row.record===eligible.id).snapshot,eligible);
    const safe=JSON.stringify(await f.view(second.id));assert.ok(!safe.includes(f.original));assert.ok(!safe.includes(String(987654321)));assert.ok(!safe.includes('••••4321'));
    await h.command('member',{email:taxEmail(6302),name:'synthetic-purse-6302',roles:['requester'],active:true});
    await h.command('supplier-tax-review',await f.input({},second.id),f.buyer,403);
    assert.equal(validatePurchasingArchive(await snapshot()),true);
    const owner=(await h.state()).actor.id,revoked=await f.input({},second.id),beforeRevoked=await snapshot();
    await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE operator_id=?').bind(Date.now(),owner).run();
    assert.equal((await h.send('/api/purse/command/supplier-tax-review',revoked,h.owner)).status,401);
    assert.deepEqual(await snapshot(),beforeRevoked,'Revoked native credential cannot replay a review');
});


await scenario('Supplier tax archive and erasure preserve anonymous evidence without restoring reviewer or identity authority',async t=>{
    const f=await supplierTaxFixture();t.after(()=>f.h.close());const {h}=f;
    const decision=await h.command('supplier-tax-review',await f.input());
    const archive=async(name)=>{const path=join(h.dir,name+'.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),path,[]);return path;};
    const saved=await archive('synthetic-purse-6320');
    const copy=await harness({empty:true});t.after(()=>copy.close());
    await importArchive(await createPortability({db:copy.db,buckets:{ORIGINALS:copy.originals},policy:portability}),saved,[]);
    const boot=await copy.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'synthetic-purse-6321'});assert.equal(boot.status,303);
    const restored=(await copy.send('/api/purse/state',undefined,boot.cookie)).value.data.supplierTax[0];
    assert.equal(restored.current,null);assert.equal(restored.eligibility,'unknown');assert.equal(restored.history[0].sha256,decision.sha256);assert.match(restored.history[0].reviewStatus,/Historical/);
    assert.equal((await copy.db.prepare('SELECT count(*) AS n FROM p_supplier_tax_authority').first()).n,0);
    const source=restored.evidence[0];
    const fresh={...await f.input(),...source,basis:restored.basis,version:restored.version,reason:'synthetic-purse-6322 current owner reviewed restored original'};delete fresh.sourceSupplier;delete fresh.available;
    const result=await copy.send('/api/purse/command/supplier-tax-review',fresh,boot.cookie);assert.equal(result.status,200,JSON.stringify(result.value));
    assert.equal(result.value.documentVersion,decision.documentVersion);
    const replay=await f.input();
    await reauthenticateErasure(h);
    const inventory=await h.send('/api/purse/erasure',undefined,h.owner);
    const preview=await h.send('/api/purse/erasure/preview',{kind:'contact',id:f.supplier.id,email:taxEmail(6306),revision:inventory.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
    const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
    const view=await f.view();assert.equal(view.current,null);assert.equal(view.eligibility,'unknown');assert.ok(view.history[0].erasure);assert.equal(view.history[0].sha256,decision.sha256);assert.ok(!JSON.stringify(view).includes('synthetic-purse-6306'));
    assert.equal((await h.send('/api/purse/download/attachment/'+f.file.id,undefined,h.owner)).status,410);
    const prior=(await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
    await h.command('supplier-tax-review',replay,h.owner,409);
    assert.deepEqual((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results,prior);
    assert.equal(validatePurchasingArchive(prior),true);
    const latest=await archive('synthetic-purse-6323'),erasedCopy=await harness({empty:true});t.after(()=>erasedCopy.close());
    await importArchive(await createPortability({db:erasedCopy.db,buckets:{ORIGINALS:erasedCopy.originals},policy:portability}),latest,[]);
    const owner=await erasedCopy.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'synthetic-purse-6324'});assert.equal(owner.status,303);
    const anonymous=(await erasedCopy.send('/api/purse/state',undefined,owner.cookie)).value.data.supplierTax[0];assert.equal(anonymous.current,null);assert.ok(anonymous.history[0].erasure);
    const destination=await harness({empty:true});t.after(()=>destination.close());
    await assert.rejects(importArchive(await createPortability({db:destination.db,buckets:{ORIGINALS:destination.originals},policy:portability}),saved,[],latest),/erasure|journal/i);
});
}
