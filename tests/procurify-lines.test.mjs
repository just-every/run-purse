import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import {harness} from './purse-harness.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';
import {input,configure,importCall,ids,email} from './procurify-lines-fixture.mjs';

test('Reviewed historical multi-line migration reconciles exact source identities, stays inert and continues safely through undo, restore and erasure', async t => {
    const h=await harness();t.after(()=>h.close());await configure(h);
    const source=await input();const columns=source.csv.split('\n')[0].split(',').length;source.csv += Array.from({length:45},(_,i)=>['supplier','synthetic-purse-resume-'+i,'','Synthetic resume '+i,'active',...Array(columns-5).fill('')].join(',')).join('\n')+'\n';const call=(op,body,status=200,cookie=h.owner)=>importCall(h,op,body,status,cookie);
    const rows=async db=>(await db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
    const before=await rows(h.db),jobs=await h.db.prepare('SELECT * FROM ik_jobs').all();
    const preview=await call('preview',source);assert.deepEqual(await rows(h.db),before);assert.deepEqual(await h.db.prepare('SELECT * FROM ik_jobs').all(),jobs);
    assert.deepEqual(preview.report.reconciliation.map(r=>[r.kind,r.currency,r.period,r.records,r.lines,r.totalMinor]),[
        ['request','USD','2026-10',1,2,105000],['request','EUR','2026-09',1,1,3000],['order','USD','2026-10',1,2,105000],['order','EUR','2026-09',1,1,3000],['invoice','USD','2026-10',1,2,40000],['invoice','EUR','2026-09',1,1,1500]
    ]);
    const changed=[{...source,csv:source.csv+'\n'},{...source,mapping:{...source.mapping,statuses:{...source.mapping.statuses,approved:'different-history'}}}];
    for(const value of changed)await call('commit',{...value,fingerprint:preview.plan.fingerprint},409);
    const bad=[source.csv.replace(' line 2 ',' line 1 '),source.csv.replace('request, synthetic-purse-request , line 2 ,Synthetic history','request, synthetic-purse-request , line 2 ,Conflicting header'),source.csv.replaceAll(' line 2 ',' missing-line ' ).replace('order, synthetic-purse-order , missing-line ','order, synthetic-purse-order , line 2 '),source.csv.replace('""order-line"": ""Grant B""','""unknown-definition"": ""Grant B""')];
    for(const csv of bad){assert.notEqual(csv,source.csv);const response=await h.send('/api/purse/import/preview',{...source,csv},h.owner);assert.ok(response.status>=400 || response.value.report.unresolved.length>0,JSON.stringify(response.value));assert.deepEqual(await rows(h.db),before);}
    const unauthorized=await h.member(email(9101),['requester']);await call('preview',source,403,unauthorized);assert.equal((await h.send('/api/purse/import/preview',source)).status,401);
    const committed=await call('commit',{...source,fingerprint:preview.plan.fingerprint}),job=committed.job,ref={id:job.id,mappingVersion:job.mappingVersion};
    assert.equal(job.checkpoint,40);assert.ok(job.total>40);assert.equal((await call('resume',ref)).state,'completed');
    const snapshot=await rows(h.db);await call('resume',ref);await call('resume',ref);assert.deepEqual(await rows(h.db),snapshot);assert.equal((await call('commit',{...source,fingerprint:preview.plan.fingerprint})).job.id,job.id);
    const status=await call('status',ref);assert.equal(Buffer.from(status.originals[0].original.base64,'base64').toString(),source.csv);
    assert.deepEqual(status.report.historicalRecords.find(r=>r.id===ids.order).sourceRows.map(r=>r.row),[13,14]);
    let data=(await h.state()).data;const order=data.order.find(r=>r.id===ids.order),invoice=data.invoice.find(r=>r.id===ids.invoice),request=data.request.find(r=>r.id===ids.request);
    assert.equal(order.lines.length,2);assert.deepEqual(order.lines.map(l=>l.sourceLineId),[' line 1 ',' line 2 ']);assert.equal(order.sourceId,' synthetic-purse-order ');assert.equal(order.lines[0].unitMinor,6000);assert.equal(order.lines[1].totalMinor,40000);assert.equal(invoice.totalMinor,40000);assert.deepEqual(invoice.allocations.map(a=>[a.line,a.q,a.amountMinor]),[[order.lines[0].id,5000,30000],[order.lines[1].id,1000,10000]]);
    assert.deepEqual(order.historicalFields.map(f=>[f.sourceId,f.value]),[['order-header','Grant A']]);assert.deepEqual(order.lines.map(l=>l.historicalFields[0].value),['Grant A','Grant B']);assert.equal(data.importField.length,6);assert.equal(data.intakeForm.length,0);assert.equal(data.decision.length,0);assert.equal(data.commitment.length,0);assert.deepEqual(data.totals,{});assert.equal(order.status,'imported');assert.equal(invoice.paymentApproval,undefined);assert.equal(request.policy,null);assert.ok(data.supplier.filter(s=>s.imported).every(s=>s.status==='pending_review'));
    await h.command('convert',{id:request.id,revision:1},h.owner,409);await h.command('issue',{id:order.id},h.owner,409);assert.deepEqual((await h.state()).data.commitment,[]);
    assert.equal(validatePurchasingArchive(await rows(h.db)),true);
    const archive=join(h.dir,'synthetic-purse-history.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
    const restored=await harness();t.after(()=>restored.close());await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
    let restoredData=(await restored.state()).data;assert.deepEqual(restoredData.order.find(r=>r.id===ids.order).lines,order.lines);assert.deepEqual(restoredData.importField,data.importField);assert.equal(restoredData.decision.length,0);assert.equal(restoredData.commitment.length,0);
    for(const op of ['status','resume','undo'])assert.notEqual((await restored.send('/api/purse/import/'+op,ref,restored.owner)).status,200);
    assert.ok(restoredData.importJobs.find(j=>j.id===job.id).canClaim);await importCall(restored,'claim',ref);await importCall(restored,'resume',ref);const claimed=await importCall(restored,'status',ref);assert.equal(Buffer.from(claimed.originals[0].original.base64,'base64').toString(),source.csv);assert.deepEqual(claimed.report.reconciliation,preview.report.reconciliation);
    await restored.command('convert',{id:request.id,revision:1},restored.owner,409);await restored.command('issue',{id:order.id},restored.owner,409);
    // A current native edit is preserved, along with its dependent source graph.
    const supplier=data.supplier.find(s=>s.sourceId==='synthetic-purse-1');await h.command('supplier',{...supplier,name:'Edited after import',reason:'Reviewed correction'});
    await call('undo',ref);const undone=await call('status',ref);assert.ok(undone.undo.dispositions.some(d=>d.reason==='edited'&&d.disposition==='retained'));assert.equal((await h.state()).data.supplier.find(s=>s.id===supplier.id).name,'Edited after import');
    await importCall(restored,'undo',ref);restoredData=(await restored.state()).data;assert.equal(restoredData.order.filter(r=>r.imported).length,0);assert.equal(restoredData.importField.length,0);
    // Legacy one-line source identity and supplier matching-only custody still work.
    const legacy={...source,csv:'kind,sourceId,name,status,tin,bankRouting,bankAccount\nsupplier,synthetic-purse-legacy,Synthetic legacy,active,987651234,123456789,9876543210\n'};
    const lp=await call('preview',legacy),lc=await call('commit',{...legacy,fingerprint:lp.plan.fingerprint}),ls=await call('status',{id:lc.job.id,mappingVersion:lc.job.mappingVersion});const retained=Buffer.from(ls.originals[0].original.base64,'base64').toString();assert.ok(retained.includes('[REDACTED]'));for(const value of ['987651234','123456789','9876543210'])assert.ok(!JSON.stringify(ls).includes(value));assert.equal(lp.report.supplierRedaction.originalSha256,createHash('sha256').update(legacy.csv).digest('hex'));
    // Erase a real member appearing only in retained custom values and original rows.
    const personal=email(9102);await h.member(personal,['requester']);
    const personalSource={...source,csv:source.csv.replaceAll('synthetic-purse-','synthetic-purse-erasure-').replaceAll('Grant A',personal)};
    const pp=await call('preview',personalSource),pc=await call('commit',{...personalSource,fingerprint:pp.plan.fingerprint});await call('resume',{id:pc.job.id,mappingVersion:pc.job.mappingVersion});await h.command('member',{email:personal,name:'Synthetic erased member',roles:['requester'],active:false});await reauthenticateErasure(h);
    const meta=(await h.send('/api/purse/erasure',undefined,h.owner)).value,ep=await h.send('/api/purse/erasure/preview',{kind:'member',id:personal,revision:meta.revision},h.owner);assert.equal(ep.status,200,JSON.stringify(ep.value));const er=await h.send('/api/purse/erasure/execute',{...ep.value.subject,revision:ep.value.revision,review:ep.value.review,fingerprint:ep.value.fingerprint,consent:true},h.owner);assert.equal(er.status,200,JSON.stringify(er.value));assert.ok(!JSON.stringify(await rows(h.db)).includes(personal));
    assert.notEqual((await h.send('/api/purse/import/commit',{...personalSource,fingerprint:pp.plan.fingerprint},h.owner)).status,200);await h.send('/api/purse/import/resume',{id:pc.job.id,mappingVersion:pc.job.mappingVersion},h.owner);assert.ok(!JSON.stringify(await rows(h.db)).includes(personal));assert.equal(validatePurchasingArchive(await rows(h.db)),true);
});
