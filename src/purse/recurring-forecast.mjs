export const recordedForecastLabel = 'forecast from recorded terms; not issued, not realized';
const dayAfter = day => new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
function nextTerm(day, months, duration) {
    if (!months) return new Date(Date.parse(day+'T00:00:00Z')+duration*86400000).toISOString().slice(0,10);
    const d=new Date(day+'T00:00:00Z'),month=d.getUTCMonth()+months,year=d.getUTCFullYear();
    return new Date(Date.UTC(year,month,Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
}
/** Recorded value is a scenario basis, never a supplier charge or guaranteed renewal price. */
export function recordedRenewalForecast(agreements, from, to, assumptions=[]) {
    const rows=[],unknownAgreementIds=[];
    for (const agreement of agreements) {
        if (!agreement.autoRenew) continue;
        const duration=(Date.parse(agreement.endDate)-Date.parse(agreement.startDate))/86400000+1;
        if (agreement.valueMinor==null || !Number.isInteger(duration) || duration<1) { unknownAgreementIds.push(agreement.id); continue; }
        let date=dayAfter(agreement.endDate),count=0,cap=agreement.valueMinor;
        while(date<=to) {
            if (++count>1200) throw new Error('Narrow the renewal forecast period');
            if (agreement.renewalIncreaseCapBps!=null) cap=Number((BigInt(cap)*BigInt(10000+agreement.renewalIncreaseCapBps)+5000n)/10000n);
            if(!Number.isSafeInteger(cap)||cap>1e12)throw new Error('Renewal forecast is too large');
            if(date>=from) rows.push({agreement:agreement.id,date,amountMinor:agreement.valueMinor,capAmountMinor:agreement.renewalIncreaseCapBps==null?null:cap,
                basis:agreement.renewalTermMonths?'Recorded renewal term in months':'Recorded inclusive agreement term in days'});
            date=nextTerm(date,agreement.renewalTermMonths,duration);
        }
    }
    const totalMinor=rows.reduce((n,r)=>n+r.amountMinor,0);
    const proposedTotalMinor=agreements.reduce((n,a)=>n+(assumptions.find(r=>r.agreement===a.id)?.proposedMinor??rows.filter(r=>r.agreement===a.id).reduce((sum,r)=>sum+r.amountMinor,0)),0);
    if(!Number.isSafeInteger(totalMinor)||!Number.isSafeInteger(proposedTotalMinor))throw new Error('Renewal forecast is too large');
    return {rows,totalMinor,proposedTotalMinor,effectMinor:proposedTotalMinor-totalMinor,unknownAgreementIds,assumptions,label:recordedForecastLabel};
}
const cashText=(value,currency)=>{const absolute=BigInt(Math.abs(value));return `${currency} ${value<0?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;};
export function recurringDraftText(scenario) {
    const {snapshot:s,choices:c}=scenario;
    const label=id=>{const v=s.sources.find(r=>r.kind==='agreement'&&r.id===id).value;return `${v.name} (${v.reference})`;};
    return ['NONBINDING DRAFT — human review and separate sending required.',`Scenario ${scenario.hash}`,`Action: ${c.kind}`,
        ...s.agreements.map(r=>{const terms=s.sources.find(v=>v.kind==='agreement'&&v.id===r.id).value;return `${label(r.id)}: notice deadline ${r.noticeDeadline}. Recorded notice: ${terms.noticeDays} days before ${terms.endDate}. Recorded payment terms: ${terms.paymentTerms}.`;}),
        'Verify the notice method your agreement requires. Sending is recorded only; notice effectiveness is not verified.',
        `Assumption reason: ${c.reason}`,`Operational risk: ${c.operationalRisk}`,
        `Hypothetical cash change: ${cashText(s.effect.cashMinor,s.currency)}. Unknown forecasts: ${s.unknownForecastAgreements.map(label).join(', ')||'none'}.`,
        `${s.recordedForecast.label}: ${cashText(s.recordedForecast.totalMinor,s.currency)}; proposed ${cashText(s.recordedForecast.proposedTotalMinor,s.currency)}.`,
        'No commitment, forecast, agreement, purchase order, supplier communication or cancellation has been changed.'].join('\n');
}
