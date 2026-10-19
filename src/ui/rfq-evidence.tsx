import { when, type D } from './shared';
/** RFQ offer identity and originals remain attached to the real supplier response. */
export function RfqOfferEvidence({data,quote}:{data:D;quote:D}) {
    const response=(data.rfqResponse??[]).find((row:D)=>row.id===quote.sourceResponse);
    if(!response)return null;
    const rfq=(data.rfq??[]).find((row:D)=>row.id===response.rfq),supplier=rfq?.suppliers.find((row:D)=>row.id===response.supplier);
    return <div><p>Supplier offer · {supplier?.name??response.supplier} · response {response.sequence} · {when(response.at)}</p><p>Lead time: {response.leadTime} · validity: {response.validity}</p>{response.files.map((file:D)=><p key={file.id}><a href={`/api/purse/rfq-original/${response.id}/${file.id}`}>{file.name}</a></p>)}</div>;
}
