import { harness } from './purse-harness.mjs';
export const reviewFile = {name:'synthetic-purse-6101.txt',mediaType:'text/plain',base64:Buffer.from('synthetic-purse-6102 private review evidence').toString('base64')};
export const reviewEmail = n => ['synthetic-purse-'+n,'example.test'].join('@');
export async function crossTeamFixture(t) {
    const h=await harness(); t?.after(()=>h.close());
    await h.command('business',{name:'synthetic-purse-6103',currencies:['USD'],locations:['Austin','Denver'],costCentres:['Operations'],projects:['General']});
    const requester=await h.member(reviewEmail(6104),['requester']),approver=await h.member(reviewEmail(6105),['approver']),buyer=await h.member(reviewEmail(6106),['buyer']);
    await h.command('access-role',{id:'reviewer',name:'Review reader',permissions:['request.read'],scope:{},active:true});
    const reviewers={};
    for(const [index,type] of ['security','privacy','it','legal'].entries()) {
        const email=reviewEmail(6110+index),cookie=await h.member(email,[]);
        await h.command('member',{email,name:'synthetic-purse-'+(6120+index),active:true,grants:[{role:'reviewer',scope:{locations:['Austin']}}]});
        reviewers[type]={email,cookie};
    }
    const supplier=await h.command('supplier',{name:'synthetic-purse-6130',status:'preferred',reason:'Reviewed',address:'synthetic-purse-6131',remitTo:'synthetic-purse-6132',postalState:'TX'});
    const policy=await h.command('policy',{name:'synthetic-purse-6133',currency:'USD',category:'software',project:'General',approver:reviewEmail(6105),limitMinor:1000000,budgetMinor:10000000});
    const config={name:'synthetic-purse-6134 software',purchaseType:'software',consent:true,questions:[],headerFields:[],lineFields:[],requiredFiles:[],defaults:{category:'software'},reviews:Object.entries(reviewers).map(([type,reviewer],index)=>({type,reviewer:reviewer.email,stage:index<2?1:2}))};
    const form=await h.command('intake-form',config);
    const draft={title:'synthetic-purse-6135 new software',intakeForm:form.id,supplier:supplier.id,currency:'USD',needDate:'2026-11-12',location:'Austin',costCentre:'Operations',terms:'Net 30',freightMinor:0,taxMinor:0,lines:[{description:'synthetic-purse-6136 subscription',quantity:'1',unitMinor:10000,category:'software',project:'General'}]};
    let request=await h.command('request',draft,requester);request=await h.command('submit',{id:request.id,revision:1},requester);
    const rows=async()=> (await h.state()).data.request.find(r=>r.id===request.id).crossTeamReviews.rows;
    const record=async(type,decision='approved',extra={},status=200)=>{const row=(await rows()).filter(row=>row.type===type&&row.revision===request.revision).at(-1);return h.command('cross-review-record',{id:row.id,revision:request.revision,version:row.version,decision,body:'synthetic-purse-6140 '+type+' '+decision,...extra},reviewers[type].cookie,status);};
    return {h,requester,approver,buyer,reviewers,supplier,policy,config,form,draft,get request(){return request},set request(value){request=value},rows,record};
}
