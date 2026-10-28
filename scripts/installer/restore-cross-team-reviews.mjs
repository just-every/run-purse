/** Portable review chronology carries no live installation authority. */
export function validateCrossTeamReviews(all,get,check,same) {
    const types = ['security','privacy','it','legal','finance'];
    const plan = rows => {
        check(Array.isArray(rows) && rows.length <= 5 && new Set(rows.map(row=>row.type)).size === rows.length,'cross_review_plan');
        for(const row of rows) check(types.includes(row.type) && typeof row.reviewer === 'string' && Number.isInteger(row.stage) && row.stage >= 1 && row.stage <= 5,'cross_review_step');
    };
    for(const form of all('intakeForm')) if(form.reviews) plan(form.reviews);
    for(const row of all('crossTeamReview')) {
        const r = get('revision',row.request+':'+row.revision); get('request',row.request); get('intakeForm',row.form);
        check(types.includes(row.type) && typeof row.reviewer === 'string' && Number.isSafeInteger(row.formVersion) && row.formVersion > 0 && Number.isInteger(row.stage) && row.stage >= 1 && row.stage <= 5 && /^[a-f0-9]{64}$/.test(row.basis),'cross_review_source');
        check(Array.isArray(row.events) && row.events.length === row.version && row.version <= 100 && Number.isFinite(Date.parse(row.at)),'cross_review_history');
        check(all('audit').some(event=>event.action==='cross-review-open' && event.record===r.request && event.review===row.id && event.revision===row.revision && event.basis===row.basis && event.type===row.type && event.reviewer===row.reviewer),'cross_review_open_audit');
        for(const [index,event] of row.events.entries()) {
            check(event.version===index+1 && ['question','approved','rejected'].includes(event.decision) && typeof event.body==='string' && event.body.length<=10000 && event.email===row.reviewer && typeof event.actor==='string' && Number.isSafeInteger(event.operatorVersion) && event.operatorVersion>0 && Number.isFinite(Date.parse(event.at)) && Array.isArray(event.files),'cross_review_event');
            for(const id of event.files) { const file=get('attachment',id); check(file.kind==='crossTeamReview' && file.record===row.id,'cross_review_file'); }
            check(all('audit').some(a=>a.action==='cross-review-record' && a.review===row.id && a.record===row.request && a.revision===row.revision && a.version===event.version && same(a.snapshot,event)),'cross_review_audit');
        }
        check(row.events.reduce((n,event)=>n+event.files.length,0)<=10,'cross_review_files');
    }
}
