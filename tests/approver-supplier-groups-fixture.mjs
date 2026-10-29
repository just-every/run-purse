import assert from 'node:assert/strict';
import {supplierGroupsFixture,groupMail} from './po-supplier-groups-fixture.mjs';
export async function approverSupplierFixture(h,options={}) {
 const f=await supplierGroupsFixture(h,options),rule={allowed:['supplier'],material:['supplier']};
 const policies=[];
 for(const policy of f.policies)policies.push(await f.cmd('policy',{...policy,approvalSteps:[{email:groupMail(8104),dependsOn:['supplier']}],editRules:{goods:rule}}));
 const pending=async(extra={})=>{const request=await f.cmd('request',{...f.draft,...extra},f.requester);await f.cmd('submit',{id:request.id,revision:1},f.requester);await f.cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Original supplier and goods reviewed'},f.approver);return (await h.state()).data.request.find(row=>row.id===request.id);};
 const change=(request,extra={})=>({id:request.id,revision:request.revision,changes:{lines:[{id:request.lines[1].id,supplier:f.suppliers[1].id}]},reason:'Current approver corrects the supplier for the second goods line',...extra});
 const approve=async(request,cookie)=>f.cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Fresh exact supplier revision reviewed'},cookie);
 const exposure=async request=>{const data=(await h.state()).data;return {total:data.commitment.filter(event=>event.request===request.id).reduce((sum,event)=>sum+event.amountMinor,0),positions:policies.map(policy=>{const row=data.periodBudgets.find(row=>row.id===policy.id);return [row.reservedMinor,row.committedMinor,row.actualMinor];})};};
 return {...f,policies,pending,change,approve,exposure,editor:f.ownerA};
}
export async function unchangedRefusal(h,op,input,cookie,status) {
 const before=(await h.state()).data;await h.command(op,input,cookie,status);assert.deepEqual((await h.state()).data,before,'Refused '+op+' preserves every product record');
}
