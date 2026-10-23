import { currentDecision } from './approval';
import { currentPrice } from './catalogue';
import { moneyInput } from './money';
import { orders } from './orders';
import { all, audit, Fault, get, put, requirePermission, requireThat, text, type Actor, type Data, type State } from './types';

export const poGenerationKey = (purchaseType: string, supplier: string, currency: string) => JSON.stringify([purchaseType,supplier,currency]);
function matchesType(rule: Data, request: Data) {
    return rule.purchaseType === '*' || rule.purchaseType === request.purchaseType?.toLowerCase()
        || rule.purchaseType === 'catalogue' && request.lines.every((line: Data) => Boolean(line.catalogue))
        || request.lines.every((line: Data) => line.category.toLowerCase() === rule.purchaseType);
}
/** Specific rules, including a paused rule, override the broad rule. Ambiguity holds for a buyer. */
export function generationRule(s: State, request: Data): Data | undefined {
    const candidates = all(s,'poGenerationPolicy').filter(p => p.currency === request.currency && (p.supplier === '*' || p.supplier === request.supplier) && matchesType(p,request));
    const rank = (p: Data) => (p.supplier === '*' ? 0 : 2) + (p.purchaseType === '*' ? 0 : 1);
    candidates.sort((a,b) => rank(b)-rank(a));
    return candidates.length && (candidates.length === 1 || rank(candidates[0]) > rank(candidates[1])) ? candidates[0] : undefined;
}
export function generationReadiness(s: State, request: Data, policy = generationRule(s,request)): Data {
    requireThat(request.status === 'approved' && !request.imported,'Exact native approved request required',409);
    const existing = all(s,'order').find(o => o.request === request.id && o.revision === request.revision);
    if (existing) return {status:'generated',order:existing.id,reason:'Buyer consent required to send this exact PO and supplier contact'};
    if (!policy?.enabled) return {status:'manual-review',reason:'Automatic generation is not enabled for this purchase type, supplier and currency'};
    if (request.totalMinor > policy.maxMinor) return {status:'manual-review',reason:'Amount exceeds the owner’s automatic generation limit'};
    const supplier = get(s,'supplier',request.supplier);
    if (['proposed','invited','onboarding','in vendor approval'].includes(supplier.status)) return {status:'waiting-supplier',reason:'Supplier pending vendor approval'};
    // Ordinary native conversion remains the public authority for all supplier,
    // document, budget, approval, coding and exact-revision checks.
    requireThat(!request.amends && !request.adoption && !request.adoptedDisposition && request.purchaseType !== 'travel','Buyer review required for amendments, adopted purchases and travel',409);
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
    const entry={id,purchaseType,supplier,currency,maxMinor:moneyInput(b,'maxAmount','maxMinor','Automatic generation limit'),enabled:b.enabled,version:(previous?.version??0)+1,
        actor:a.id,email:a.email,operatorVersion:a.version,at:new Date().toISOString(),reason:text(b.reason,'Generation authority reason'),outbound:'buyer-consent-required'};
    put(s,'poGenerationPolicy',id,{...entry,history:[...(previous?.history??[]),entry]});
    audit(s,a,op,id,{version:entry.version,enabled:entry.enabled,reason:entry.reason,outbound:entry.outbound});
    return get(s,'poGenerationPolicy',id);
}
