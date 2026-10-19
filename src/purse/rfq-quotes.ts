import { all, uid, type Data, type State } from './types';
/** One actual supplier response is one ordinary quotation, preserving its real source revision. */
export function rfqQuotation(s: State, rfq: Data, response: Data): Data {
    return { id:uid(),request:rfq.request,revision:rfq.revision,supplier:response.supplier,currency:response.currency,
        at:response.at,actor:'supplier-link',sequence:all(s,'quote').filter(q=>q.request===rfq.request&&q.revision===rfq.revision).length+1,
        rfq:rfq.id,sourceSupplier:response.supplier,sourceResponse:response.id,
        lines:response.lines.map((line:Data)=>({...line,id:uid()})),freightMinor:response.freightMinor,taxMinor:response.taxMinor,totalMinor:response.totalMinor,
        leadTime:response.leadTime,validity:response.validity,conditions:response.conditions,delivery:null,missing:response.conditions?[]:['conditions'],
        source:`RFQ ${rfq.id}; supplier response ${response.id}; supplier ${response.supplier}; version ${response.sequence}` };
}
