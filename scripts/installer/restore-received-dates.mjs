const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const day = (instant, timezone) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.parse(instant)).map(part=>[part.type,part.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
};
export function validateReceivedDates(all,get,check) {
    for (const receipt of all('receipt')) {
        if (receipt.effectiveDate === undefined) continue; // Older facts remain explicitly incomplete.
        const order=get('order',receipt.order), issue=order.issuedAt??order.adoptedAt;
        check(!receipt.imported && date(receipt.effectiveDate) && date(receipt.recordedDate) && typeof receipt.receivedTimezone==='string' && Number.isFinite(Date.parse(receipt.at)) && issue,'received_dates');
        let issued,recorded;
        try {issued=day(issue,receipt.receivedTimezone);recorded=day(receipt.at,receipt.receivedTimezone);} catch {check(false,'received_timezone');}
        check(receipt.recordedDate===recorded && receipt.effectiveDate>=issued && receipt.effectiveDate<=recorded,'received_date_range');
        check(all('audit').some(event=>['receipt','service-receipt'].includes(event.action)&&event.record===order.id&&event.line===receipt.line&&event.effectiveDate===receipt.effectiveDate&&event.recordedDate===receipt.recordedDate&&event.actor===receipt.actor),'received_date_audit');
    }
}
