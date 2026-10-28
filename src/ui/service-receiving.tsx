import { Form, Field, money, type D } from './shared';
export function ServiceReceiving({order,mutate}:{order:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const services=order.lines.filter((line:D)=>line.service);
    if(!services.length)return null;
    return <section aria-label="Service receiving"><h4>Service receiving by value</h4>{services.map((line:D)=>{
        const position=order.positions.find((p:D)=>p.line===line.id);
        return <section key={line.id}><h5>{line.description}</h5><p>Basis: {line.service.mode} · Accepted {money(position.acceptedMinor,order.currency)} · Outstanding {money(position.outstandingMinor,order.currency)}</p>{order.mayReceive&&order.status==='issued'&&<Form label={'Accept service: '+line.description} initial={{order:order.id,line:line.id,receiptVersion:order.receiptVersion}} onSubmit={b=>mutate('service-receipt',b)}>
            {line.service.mode==='percentage'?<Field label="Cumulative percentage complete" name="percentage"/>:line.service.mode==='milestone'?<Field label="Completed named milestone" name="milestone" options={line.service.milestones.map((m:D)=>({value:m.id,label:m.name+' · '+money(m.valueMinor,order.currency)}))}/>:<Field label="Accepted service amount" name="valueAmount"/>}<Field label="Service acceptance evidence" name="reason"/>
            <p className="quiet wide">Acceptance updates invoice matching immediately. Percentage is cumulative; amount adds received value. Receiving never approves a payment.</p>
        </Form>}{order.mayReceive&&order.status==='issued'&&position.outstandingMinor>0&&<Form label={'Record service rejection: '+line.description} initial={{order:order.id,line:line.id,event:'reject',receiptVersion:order.receiptVersion}} onSubmit={b=>mutate('service-receipt',b)}><Field label="Rejected service value" name="valueAmount"/><Field label="Service rejection evidence" name="reason"/><p>Records rejected value without accepting it, releasing the commitment or approving a bill. Prepare its return authorization below.</p></Form>}</section>;
    })}</section>;
}
