import { invoiceChargeTypes } from './invoice-charges';
import { all, audit, get, minor, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

export function matchingRuleFor(s: State, order: Data, category: string): Data | undefined {
    // Specific rules shadow broader rules even when paused or their consent expired.
    return all(s, 'matchingRule').filter(r => r.currency === order.currency && (r.supplier === '*' || r.supplier === order.supplier) && (r.category === '*' || r.category === category))
        .sort((a,b) => Number(b.supplier !== '*') * 2 + Number(b.category !== '*') - Number(a.supplier !== '*') * 2 - Number(a.category !== '*'))[0];
}
export function liveMatchingRule(s: State, rule: Data): boolean {
    const proof = s.get('nativeMatchingAuthority:' + rule.id)?.value;
    return Boolean(rule.enabled && !rule.erasure && proof?.version === rule.version && proof?.actor === rule.actor && proof?.operatorVersion === rule.operatorVersion);
}
export function matchingRules(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'matching-rule') return;
    requireThat(a.owner, 'Current native owner must consent to automatic matching', 403);
    const prior = b.id ? get(s,'matchingRule',b.id) : null;
    requireThat(b.version === (prior?.version ?? 0), 'Matching rule changed; reload', 409);
    requireThat(typeof b.enabled === 'boolean' && b.consent === true, 'Explicit owner consent required');
    const supplier = text(b.supplier,'Supplier'), category = text(b.category,'Category');
    requireThat(supplier !== '*' || category !== '*', 'Choose a supplier or category');
    if (supplier !== '*') requireThat(!get(s,'supplier',supplier).mergedInto, 'Choose the current supplier');
    const currency = text(b.currency,'Currency');
    requireThat(get(s,'business','main').currencies.includes(currency), 'Choose a configured currency');
    const priceBps = minor(b.priceBps,'Price basis points'), quantityBps = minor(b.quantityBps,'Quantity basis points');
    requireThat(priceBps <= 10000 && quantityBps <= 10000, 'Percentage must be between zero and 100 percent');
    requireThat(!all(s,'matchingRule').some(r => r.id !== prior?.id && r.currency === currency && r.supplier === supplier && r.category === category), 'Edit the existing rule for this supplier, category and currency', 409);
    const chargeBps=minor(b.chargeBps ?? 0,'Unplanned charge basis points');
    requireThat(chargeBps<=10000,'Unplanned charge percentage must be between zero and 100 percent');
    requireThat(!b.chargeCodes || typeof b.chargeCodes==='object' && !Array.isArray(b.chargeCodes) && Object.keys(b.chargeCodes).every(type=>invoiceChargeTypes.includes(type as any)), 'Choose supported unplanned charge types');
    const chargeCodes=Object.fromEntries(Object.entries(b.chargeCodes ?? {}).filter(([,value])=>value!=='').map(([type,value])=>[type,text(value,'Charge GL account',200)]));
    const entry = { chargeBps, chargeMinor:minor(b.chargeMinor ?? 0,'Unplanned charge amount'), chargeCodes, version:(prior?.version ?? 0)+1, enabled:b.enabled, supplier, category, currency,
        priceBps, priceMinor:minor(b.priceMinor,'Price amount'), quantityBps, quantityMinor:minor(b.quantityMinor,'Quantity amount'),
        receiptRequired:true, actor:a.id, operatorVersion:a.version, reason:text(b.reason,'Matching consent reason'), at:new Date().toISOString() };
    const id = prior?.id ?? uid();
    put(s,'matchingRule',id,{...entry,history:[...(prior?.history ?? []),entry]});
    put(s,'nativeMatchingAuthority',id,{version:entry.version,actor:a.id,operatorVersion:a.version});
    audit(s,a,op,id,{snapshot:entry});
    return get(s,'matchingRule',id);
}
