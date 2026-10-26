import { useState } from 'react';
import { Details, Field, Form, Table, money, options, type D } from './shared';

type Props={data:D;mutate:(op:string,input:D)=>Promise<any>};
function minorAmount(value: string) {
    if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Enter an amount with up to two decimal places.');
    const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    if(amount>1000000000000n)throw new Error('Amount exceeds the supported range.');return Number(amount);
}
export function PoCombination({data,mutate}:Props) {
    const [selection,setSelection]=useState<string[]>([]);
    const rows=(data.request??[]).filter((request:D)=>request.status==='approved'&&request.mayConvert&&!request.imported&&!request.amends&&!request.adoption&&request.purchaseType!=='travel'&&!request.poDetails?.blanket).flatMap((request:D)=>request.lines.map((line:D)=>({request,line,key:request.id+':'+line.id,allocated:request.allocatedLines?.includes(line.id)})));
    const chosen=rows.filter((row:D)=>selection.includes(row.key)&&!row.allocated),first=chosen[0]?.request;
    const same=(request:D)=>!first||request.supplier===first.supplier&&request.currency===first.currency&&(request.entity??'main')===(first.entity??'main');
    if(!rows.length)return null;
    return <Details label="Combine approved request lines">
        <Table heads={['Select','Approved line','Source','Amount']} figures={['Amount']}>{rows.map(({request,line,key,allocated}:D)=><tr key={key}><td><label><input type="checkbox" aria-label={'Select '+request.title+' '+line.description} disabled={allocated||!same(request)} checked={chosen.some((row:D)=>row.key===key)} onChange={event=>setSelection(current=>event.target.checked?[...current,key]:current.filter(value=>value!==key))}/>{allocated?'Allocated':'Select'}</label></td><td>{line.description}</td><td>{request.title} · revision {request.revision} · {request.costCentre}</td><td>{money(line.totalMinor,request.currency)}</td></tr>)}</Table>
        {chosen.length>0&&<Form label="Combine and issue purchase order" onSubmit={async input=>{
            const lines=chosen.flatMap(({request,line,key}:D)=>{
                const price=String(input['price:'+key]??'').trim(),quantity=String(input['quantity:'+key]??'').trim(),unit=String(input['unit:'+key]??'').trim(),partNumber=String(input['sku:'+key]??'').trim();
                return price||quantity||unit||partNumber?[{request:request.id,id:line.id,...(price?{unitMinor:minorAmount(price)}:{}),...(quantity?{quantity}:{}),...(unit?{unit}:{}),...(partNumber?{partNumber}:{})}]:[];
            });
            const charges=['freight','tax','other'].flatMap(kind=>{const value=String(input[kind]??'').trim();return value?[{kind,description:kind==='other'?String(input.chargeDescription??'').trim()||'Other charge':kind==='freight'?'Freight':'Supplied tax',amountMinor:minorAmount(value)}]:[];});
            const supplier=String(input.supplier??'');
            const result=await mutate('po-combine',{entries:chosen.map(({request,line}:D)=>({request:request.id,revision:request.revision,line:line.id})),issue:true,...(lines.length||charges.length||supplier&&supplier!==first.supplier?{conversionEdits:{lines,charges,...(supplier?{supplier}:{}),reason:input.reason}}:{})});
            setSelection([]);return result;
        }}>
            <p>{chosen.length} selected lines · {first.supplierSnapshot?.name}. Each source keeps its approval and coding.</p>
            <div className="field-wide"><Details label="Correct selected lines and add charges"><div className="record-form">
                {chosen.map(({request,line,key}:D)=><fieldset className="wide" key={key} style={{minWidth:0}}><legend>{request.title} · {line.description}</legend><div className="line">
                    <Field label={'Unit price '+line.description} name={'price:'+key} required={false}/><Field label={'Quantity '+line.description} name={'quantity:'+key} required={false}/><Field label={'Unit '+line.description} name={'unit:'+key} required={false}/><Field label={'SKU '+line.description} name={'sku:'+key} required={false}/>
                    </div><p>Approved {line.quantity} {line.unit} at {money(line.unitMinor,request.currency)} each.</p>
                </fieldset>)}
                <Field label="Combined supplier" name="supplier" defaultValue={first.supplier} options={options(data.supplier??[])}/>
                <Field label="Additional freight" name="freight" required={false}/><Field label="Additional supplied tax" name="tax" required={false}/><Field label="Additional other charge" name="other" required={false}/><Field label="Other charge description" name="chargeDescription" required={false}/>
                <Field label="Combined correction reason" name="reason" required={false}/>
            </div></Details></div>
        </Form>}
    </Details>;
}
