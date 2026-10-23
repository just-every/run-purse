import { Details, Table, money, type D } from './shared';

const words=(value:string)=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/Minor$/,'').replace(/^./,letter=>letter.toUpperCase());
function Facts({value,currency,resolve}:{value:D;currency:string;resolve:(kind:string,id:string)=>string}) {
    return <dl>{Object.entries(value).map(([key,item])=><div key={key}><dt>{words(key)}</dt><dd style={{overflowWrap:'anywhere'}}>{item===null?'Not recorded':typeof item==='boolean'?(item?'Yes':'No'):typeof item==='number'&&/Minor$/.test(key)?money(item,currency):Array.isArray(item)?item.length?item.map((row,index)=><Details key={index} label={words(key)+' '+(index+1)}>{typeof row==='object'?<Facts value={row} currency={currency} resolve={resolve}/>:String(row)}</Details>):'None':typeof item==='object'?<Facts value={item} currency={currency} resolve={resolve}/>:['agreement','order','request','invoice','supplier'].includes(key)?resolve(key,String(item)):String(item)}</dd></div>)}</dl>;
}
export function ScenarioSources({scenario}:{scenario:D}) {
    const snapshot=scenario.snapshot,currency=snapshot.currency;
    const resolve=(kind:string,id:string)=>{const source=snapshot.sources.find((row:D)=>row.kind===kind&&row.id===id);return source?.value.name??source?.value.number??source?.value.title??source?.value.reference??id;};
    const label=(source:D)=>{const v=source.value;if(['agreement','supplier','order','request','invoice'].includes(source.kind))return resolve(source.kind,source.id);if(source.kind==='valueSeatImport')return v.provider+' · '+v.activeSeats+' active of '+v.seatCount+' seats';if(source.kind==='commitment')return resolve('request',v.request)+' · '+money(v.amountMinor,currency);if(source.kind==='recurringSeries')return resolve('agreement',v.agreement);if(source.kind==='supplierIssue')return resolve('order',v.order)+' · '+v.category+' · '+v.status;if(v.order)return resolve('order',v.order)+(v.event?' · '+v.event:'');return words(source.kind);};
    return <Details label="Recompute from cited records">
        <p>Cash forecast equals the remaining proportional PO liability less approved bills. Approved bills stay unchanged. Commitment effects use the separate recorded reservation ledger.</p>
        <Table heads={['PO','PO liability','Approved bills','Remaining cash']}>{snapshot.baseline.forecast.map((row:D)=><tr key={row.order}><td>{resolve('order',row.order)}</td><td>{money(row.calculation.liabilityMinor,currency)}</td><td>{money(row.calculation.approvedBilledMinor,currency)}</td><td>{money(row.amountMinor,currency)}</td></tr>)}</Table>
        <Table heads={['Agreement / PO','Proposed cash','Proposed date','Assumption']}>{scenario.choices.assumptions.map((row:D)=><tr key={row.agreement+row.order}><td>{resolve('agreement',row.agreement)} / {row.order?resolve('order',row.order):'No issued PO'}</td><td>{row.proposedMinor==null?'Unknown':money(row.proposedMinor,currency)}</td><td>{row.expectedDate??'Unknown'}</td><td>{row.reason}</td></tr>)}</Table>
        {snapshot.overlaps.map((row:D,index:number)=><p key={index}>Agreement periods overlap from {row.from} through {row.to}. {row.sameSupplierFamily?'Same supplier family.':'Separate supplier families.'} Calendar overlap does not prove that services are interchangeable.</p>)}
        {snapshot.sources.map((source:D)=><Details key={source.kind+source.id} label={words(source.kind)+' · '+label(source)}>
            {['agreement','order','request','invoice','supplier','receipt'].includes(source.kind)&&<p><a href={'/app?search=1&open='+encodeURIComponent(source.kind+':'+source.id)}>Open current source record</a></p>}
            <p className="quiet" style={{overflowWrap:'anywhere'}}>Captured revision {source.revision}; later changes require a new scenario.</p><Facts value={source.value} currency={currency} resolve={resolve}/>
        </Details>)}
    </Details>;
}
