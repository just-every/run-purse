import {supplier as activeSupplier} from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
import {purchaseTypes} from './agent-governance';
import { currentDecision } from './approval';
import { currentPrice } from './catalogue';
import { moneyInput } from './money';
import { orders } from './orders';
import { all, audit, Fault, get, put, requirePermission, requireThat, text, type Actor, type Data, type State } from './types';

export const poGenerationKey = (purchaseType: string, supplier: string, currency: string) => JSON.stringify([purchaseType,supplier,currency]);
function matchesType(rule: Data, request: Data) {
    return rule.purchaseType === '*' || rule.purchaseType === 'catalogue' && request.lines.every((line:Data)=>Boolean(line.catalogue))
        || purchaseTypes(request).every(type=>type===rule.purchaseType);
}
/** Specific rules, including a paused rule, override the broad rule. Ambiguity holds for a buyer. */
export function generationRule(s: State, request: Data): Data | undefined {
    const candidates = all(s,'poGenerationPolicy').filter(p => p.currency === request.currency && (p.supplier === '*' || p.supplier === request.supplier) && matchesType(p,request));
    const rank = (p: Data) => (p.supplier === '*' ? 0 : 2) + (p.purchaseType === '*' ? 0 : 1);
    candidates.sort((a,b) => rank(b)-rank(a));
    return candidates.length && (candidates.length === 1 || rank(candidates[0]) > rank(candidates[1])) ? candidates[0] : undefined;
}
export function generationReadiness(s: State, request: Data, policy = generationRule(s,request), recheck = false): Data {
    requireThat(request.status === 'approved' && !request.imported,'Exact native approved request required',409);
    const existing = all(s,'order').find(o => o.request === request.id && o.revision === request.revision);
    if (existing && !recheck) {
        const send=all(s,'orderSend').find(event=>event.order===existing.id);
        let reason='Buyer consent required to send this exact PO and supplier contact';
        if(send) reason='Supplier send '+send.status+'; mailbox delivery unknown. Claimed attempts never resend automatically';
        else if(policy?.sendEnabled) {
            try { generationSendConsent(s,request,policy);reason='Awaiting current-authority automatic sending'; }
            catch(error) { if(!(error instanceof Fault))throw error;reason=error.message; }
            const event=s.get('poGenerationEvent:'+request.id+':'+request.revision)?.value;
            if(event?.sendHold)reason=event.sendHold;
            if(!event||event.policy!==policy.id||event.policyVersion!==policy.version)reason='Earlier generation rule; explicit buyer consent is required for this existing PO';
        }
        return {status:'generated',order:existing.id,reason};
    }
    if (!policy?.enabled) return {status:'manual-review',reason:'Automatic generation is not enabled for this purchase type, supplier and currency'};
    if (request.totalMinor > policy.maxMinor) return {status:'manual-review',reason:'Amount exceeds the owner’s automatic generation limit'};
    const supplier = get(s,'supplier',request.supplier);
    if (['proposed','invited','onboarding','in vendor approval'].includes(supplier.status)) return {status:'waiting-supplier',reason:'Supplier pending vendor approval'};
    // Ordinary native conversion remains the public authority for all supplier,
    // document, budget, approval, coding and exact-revision checks.
    requireThat(!request.amends && !request.adoption && !request.adoptedDisposition && request.purchaseType !== 'travel','Buyer review required for amendments, adopted purchases and travel',409);
    requireThat(new Set(request.lines.map((line:Data)=>line.supplier??request.supplier)).size===1,'Automatic supplier group generation requires separate buyer review',409);
    currentDecision(s,request);
    if (supplier.paymentTerms) requireThat(supplier.paymentTerms === request.terms,'Supplier payment terms changed; amend and renew approval',409);
    if (supplier.currency) requireThat(supplier.currency === request.currency,'Supplier currency changed; amend and renew approval',409);
    if (supplier.legalEntity) requireThat(supplier.legalEntity === request.supplierSnapshot?.legalEntity,'Supplier legal entity changed; amend and renew approval',409);
    for (const line of request.lines) if (line.catalogue) {
        const item=get(s,'catalogue',line.catalogue);
        requireThat(item.approved && currentPrice(item) && item.supplier === request.supplier && item.currency === request.currency && item.unitMinor === line.unitMinor,'Catalogue terms changed; buyer review and any required renewed approval are needed',409);
    }
    return {status:'ready',reason:'Awaiting the scheduled current-authority check'};
}

// Bind standing consent to the reviewed directory and configuration revisions.
// These opaque revision IDs contain no copied supplier personal data.
export function generationSendContext(s:State,supplier:string):string {
    return JSON.stringify([...s.values()].filter(row=>['business','policy','intakeForm','poProfile','catalogue'].includes(row.kind)||row.kind==='supplier'&&row.id===supplier)
        .map(row=>[row.kind,row.id,row.revision]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function generationSendConsent(s:State,request:Data,policy:Data) {
    requireThat(policy.enabled&&policy.sendEnabled&&policy.supplier===request.supplier&&policy.purchaseType!=='*'&&generationRule(s,request)?.id===policy.id,'Renew exact supplier and purchase-type sending consent',409);
    requireThat(policy.sendContext===generationSendContext(s,request.supplier),'Purchasing rules, supplier or commercial configuration changed; renew sending consent',409);
    requireThat(generationReadiness(s,request,policy,true).status==='ready','Request requires manual review before sending',409);
    const supplier=activeSupplier(s,request.supplier);
    requireThat(!lapsedSupplierDocuments(s,request.supplier).length,'Required supplier document has lapsed',409);
    requireThat(!request.entity||request.entity==='main','Automatic sending supports only the main entity',409);
    requireThat(!request.poDetails?.blanket&&!request.poDetails?.deposit&&!request.poDetails?.depositTerms&&!request.recurring&&!request.recurringSeries&&!request.cancellation&&request.lines.every((line:Data)=>!line.service&&(!line.supplier||line.supplier===request.supplier)),'Automatic sending supports ordinary goods only',409);
    requireThat(!supplier.erasure&&!request.supplierSnapshot?.contactErased&&!request.supplierSnapshot?.erasure,'Supplier contact erased; renew approval and sending consent',409);
    requireThat(supplier.contacts?.some((contact:Data)=>contact.email?.toLowerCase()===policy.sendRecipient)
        &&request.supplierSnapshot?.contacts?.some((contact:Data)=>contact.email?.toLowerCase()===policy.sendRecipient),'Approved supplier contact changed; renew approval and sending consent',409);
    for(const field of ['name','address','remitTo','postalState','contractRef'])
        requireThat((supplier[field]??'')===(request.supplierSnapshot?.[field]??''),'Approved supplier identity or terms changed; renew approval and sending consent',409);
}

export function poGenerationQueue(s: State): Data[] {
    return all(s,'request').filter(request => request.status === 'approved' && !request.imported).map(request => {
        const policy=generationRule(s,request);let status: Data;
        try { status=generationReadiness(s,request,policy); }
        catch(error) { if (!(error instanceof Fault)) throw error;status={status:'held',reason:error.message}; }
        const event=s.get('poGenerationEvent:'+request.id+':'+request.revision)?.value;
        if (status.status === 'ready' && event?.status === 'held' && event.policy === policy?.id && event.policyVersion === policy?.version) status={status:'held',reason:event.reason};
        return {id:request.id+':'+request.revision,request:request.id,revision:request.revision,title:request.title,supplier:request.supplier,currency:request.currency,totalMinor:request.totalMinor,...status,policy:policy?.id??null,policyVersion:policy?.version??null};
    });
}
export function poGeneration(s: State,a: Actor,op: string,b: Data): Data | undefined {
    if (op === 'po-generation-review') {
        const request=get(s,'request',text(b.id,'Request',200));
        requirePermission(s,a,'po.convert',request);
        requireThat(b.revision === request.revision,'Request changed; reload',409);
        return orders(s,a,'convert',{id:request.id,revision:request.revision,issue:true,...(b.conversionEdits ? {conversionEdits:b.conversionEdits} : {})});
    }
    if (op !== 'po-generation-policy') return;
    requireThat(a.owner,'Current native owner must authorize automatic purchasing',403);
    const purchaseType=text(b.purchaseType,'Purchase type',200).toLowerCase(), supplier=text(b.supplier,'Supplier or *',200), currency=text(b.currency,'Currency',3);
    requireThat(get(s,'business','main').currencies.includes(currency),'Choose an enabled currency');
    if (supplier !== '*') get(s,'supplier',supplier);
    const id=poGenerationKey(purchaseType,supplier,currency),previous=s.get('poGenerationPolicy:'+id)?.value;
    requireThat(b.version === (previous?.version ?? 0),'Generation policy changed; reload',409);
    requireThat(typeof b.enabled === 'boolean','Choose automatic generation or manual review');
    requireThat(!b.enabled || b.consent === true,'Explicit owner consent to internal automatic PO generation is required');
    requireThat(b.combineDaily !== true,'Daily combined POs require source-allocation support and remain unavailable',409);
    const sendEnabled=b.sendEnabled===true;
    let sendRecipient:string|undefined,sendContext:string|undefined;
    if(sendEnabled) {
        requireThat(b.enabled&&b.sendConsent===true,'Explicit owner consent to automatic supplier sending is required');
        requireThat(supplier!=='*'&&purchaseType!=='*','Automatic sending requires one supplier and purchase type');
        const current=activeSupplier(s,supplier);
        requireThat(!lapsedSupplierDocuments(s,supplier).length,'Required supplier document has lapsed',409);
        sendRecipient=text(b.sendRecipient,'Approved supplier contact',254).toLowerCase();
        requireThat(!current.erasure&&current.contacts?.some((contact:Data)=>contact.email?.toLowerCase()===sendRecipient)
            &&/^[^\s@<>(),:;"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(sendRecipient),'Choose an existing active supplier contact');
        sendContext=generationSendContext(s,supplier);
    }
    const entry={id,purchaseType,supplier,currency,maxMinor:moneyInput(b,'maxAmount','maxMinor','Automatic generation limit'),enabled:b.enabled,version:(previous?.version??0)+1,
        actor:a.id,email:a.email,operatorVersion:a.version,at:new Date().toISOString(),reason:text(b.reason,'Generation authority reason'),outbound:sendEnabled?'owner-standing-consent':'buyer-consent-required',sendEnabled,...(sendEnabled?{sendRecipient,sendContext}:{})};
    put(s,'poGenerationPolicy',id,{...entry,history:[...(previous?.history??[]),entry]});
    audit(s,a,op,id,{version:entry.version,enabled:entry.enabled,reason:entry.reason,outbound:entry.outbound});
    return get(s,'poGenerationPolicy',id);
}
