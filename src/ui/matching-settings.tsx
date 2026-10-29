import { invoiceChargeTypes } from '../purse/invoice-charges';
import { useState } from 'react';
import { Form, Field, Table, amountText, money, type D } from './shared';

export function MatchingSettings({data,mutate}:{data:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const [editing,setEditing]=useState<D>();
    return <section className="panel" aria-label="Invoice matching rules"><h3>Invoice matching rules</h3>
        <p>Approve source-confirmed ordinary goods invoices automatically after receipt. Both the percentage and amount limits apply. Supplier and category rules take precedence, then supplier rules, then category rules. A paused specific rule stays paused. No tolerance expands an approved balance or clears a risk hold.</p>
        <Table heads={['Scope','Price limits','Quantity limits','Unplanned charges','Consent','Action']}>{(data.matchingRule??[]).map((rule:D)=><tr key={rule.id}><td>{data.supplier.find((s:D)=>s.id===rule.supplier)?.name??'All suppliers'} · {rule.category} · {rule.currency} · version {rule.version}</td><td>{rule.priceBps/100}% and {money(rule.priceMinor,rule.currency)}</td><td>{rule.quantityBps/100}% and {money(rule.quantityMinor,rule.currency)}</td><td>{(rule.chargeBps??0)/100}% and {money(rule.chargeMinor??0,rule.currency)}{Object.entries(rule.chargeCodes??{}).map(([type,code])=><p key={type}>{type}: {String(code)}</p>)}</td><td>{rule.currentConsent?'Active owner consent':'Paused or fresh owner consent required'}</td><td><button onClick={()=>setEditing(rule)}>Edit matching rule</button></td></tr>)}</Table>
        <Form key={editing?.id??'new'} label="Save matching consent" initial={{id:editing?.id,version:editing?.version??0}} onSubmit={async b=>{await mutate('matching-rule',{...b,priceBps:Number(b.pricePercent)*100,quantityBps:Number(b.quantityPercent)*100,priceMinor:Math.round(Number(b.priceAmount)*100),quantityMinor:Math.round(Number(b.quantityAmount)*100),chargeBps:Math.round(Number(b.chargePercent)*100),chargeMinor:Math.round(Number(b.chargeAmount)*100),chargeCodes:Object.fromEntries(invoiceChargeTypes.map(type=>[type,b['charge:'+type]]).filter(([,code])=>code)),enabled:b.enabled==='true',consent:b.consent==='on'});setEditing(undefined);}}>
            <Field label="Matching supplier" name="supplier" defaultValue={editing?.supplier??'*'} options={[{value:'*',label:'All suppliers'},...data.supplier.filter((s:D)=>!s.mergedInto).map((s:D)=>({value:s.id,label:s.name}))]}/>
            <Field label="Matching category (* means all)" name="category" defaultValue={editing?.category??'Equipment'}/>
            <Field label="Matching currency" name="currency" defaultValue={editing?.currency??data.business[0]?.currencies[0]}/>
            <Field label="Price tolerance percent" name="pricePercent" defaultValue={(editing?.priceBps??0)/100}/><Field label="Price tolerance amount" name="priceAmount" defaultValue={amountText(editing?.priceMinor??0)}/>
            <Field label="Quantity tolerance percent" name="quantityPercent" defaultValue={(editing?.quantityBps??0)/100}/><Field label="Quantity tolerance amount" name="quantityAmount" defaultValue={amountText(editing?.quantityMinor??0)}/>
            <p>Quantity amount is the excess quantity valued at the approved PO price. Receipt and approved remaining quantity are firm limits. Deposits require separate qualification. Unplanned charges use separate limits and explicit GL accounts; both the amount cap and percentage of the complete invoice apply to all unplanned charges together.</p>
            <Field label="Unplanned charge tolerance percent" name="chargePercent" defaultValue={(editing?.chargeBps??0)/100}/><Field label="Unplanned charge tolerance amount" name="chargeAmount" defaultValue={amountText(editing?.chargeMinor??0)}/>
            {invoiceChargeTypes.map(type=><Field key={type} label={'Unplanned '+type+' GL account'} name={'charge:'+type} defaultValue={editing?.chargeCodes?.[type]??''} required={false}/>)}
            <Field label="Matching rule status" name="enabled" defaultValue={editing?.enabled===false?'false':'true'} options={[{value:'true',label:'Enabled'},{value:'false',label:'Paused'}]}/>
            <Field label="Matching consent reason" name="reason"/>
            <label><input name="consent" type="checkbox" required/>I consent to automatic invoice approval under these exact limits.</label>
        </Form>{editing&&<button onClick={()=>setEditing(undefined)}>Add another matching rule</button>}
    </section>;
}
