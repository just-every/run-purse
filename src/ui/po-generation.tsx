import { Form, Field, Table, Details, amountText, money, options, type D } from './shared';
type Props={data:D;actor:D;mutate:(op:string,input:D)=>Promise<any>};
export function PoGeneration({data,mutate}:Props) {
    const queue=data.poGenerationQueue??[];
    return <section aria-label="Procure"><h3>Procure</h3><p>Approved purchases awaiting internal PO generation or buyer review. Sending requires a buyer’s consent to the exact PO and contact in Orders.</p>
        <Table heads={['Request','Amount','Generation','Action']} figures={['Amount']}>{queue.map((row:D)=><tr key={row.id}><td>{row.title} · revision {row.revision}</td><td>{money(row.totalMinor,row.currency)}</td><td>{row.status} · {row.reason}</td><td>{row.order ? <a href={'/app?receipt='+encodeURIComponent(row.order)}>Open purchase order</a> : row.mayConvert && <Form label={'Review and issue '+row.title} initial={{id:row.request,revision:row.revision}} onSubmit={b=>mutate('po-generation-review',b)}><p>Issue this approved revision internally after the current purchasing checks. Send separately in Orders.</p></Form>}</td></tr>)}</Table>
    </section>;
}
function PolicyForm({policy,data,mutate}:{policy?:D;data:D;mutate:Props['mutate']}) {
    return <Form key={policy ? policy.id+':'+policy.version : 'new'} label={policy ? 'Save generation rule' : 'Add generation rule'} initial={{version:policy?.version??0,...(policy?{purchaseType:policy.purchaseType,supplier:policy.supplier,currency:policy.currency}:{})}}
        onSubmit={input=>{const {mode,consent,...body}=input;return mutate('po-generation-policy',{...body,enabled:mode==='automatic',consent:consent==='on'});}}>
        {!policy && <><Field label="Purchase type or category (* for all, catalogue for catalog purchases)" name="purchaseType" defaultValue="*"/><Field label="Generation supplier" name="supplier" defaultValue="*" options={[{value:'*',label:'All suppliers'},...options(data.supplier??[])]}/><Field label="Generation currency" name="currency" options={(data.business?.[0]?.currencies??[]).map((c:string)=>({value:c,label:c}))}/></>}
        <Field label="Generation mode" name="mode" defaultValue={policy?.enabled?'automatic':'manual'} options={[{value:'manual',label:'Manual buyer review'},{value:'automatic',label:'Automatic internal PO generation'}]}/>
        <Field label="Automatic generation limit" name="maxAmount" defaultValue={amountText(policy?.maxMinor??0)}/><Field label="Generation authority reason" name="reason"/>
        <label className="field field-wide"><input type="checkbox" name="consent"/>I authorize internal PO generation under my current native owner authority. Supplier sending still requires separate exact-document buyer consent.</label>
    </Form>;
}
export function PoGenerationSettings({data,actor,mutate}:Props) {
    if (!actor.roles.includes('owner')) return null;
    return <section aria-label="PO generation rules"><h3>PO generation rules</h3><p>Rules match purchase type, supplier and currency. Supplier-specific rules override general rules; ambiguous matches wait for a buyer. Above-limit amounts and pending suppliers stay visible in Procure.</p>
        {(data.poGenerationPolicy??[]).map((policy:D)=><Details key={policy.id} label={`${policy.purchaseType} · ${policy.supplier==='*'?'All suppliers':data.supplier?.find((s:D)=>s.id===policy.supplier)?.name??policy.supplier} · ${policy.currency} · ${policy.enabled?'Automatic internal generation':'Manual review'}`}><PolicyForm policy={policy} data={data} mutate={mutate}/></Details>)}
        <Details label="Add a PO generation rule"><PolicyForm data={data} mutate={mutate}/></Details>
    </section>;
}
