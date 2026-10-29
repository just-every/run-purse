import {harness} from './purse-harness.mjs';

export const proposalEmail = n => ['synthetic-purse-'+n,'supplier-'+n+'.example.test'].join('@');
export async function supplierProposalsFixture() {
    const h=await harness();
    try {
        await h.command('business',{name:'synthetic-purse-6800',currencies:['USD','EUR'],locations:['Denver'],costCentres:['Operations','Private'],projects:['Equipment']});
        const requester=await h.member(proposalEmail(6801),['requester']),buyer=await h.member(proposalEmail(6802),['buyer']),
            approver=await h.member(proposalEmail(6803),['approver']),other=await h.member(proposalEmail(6804),['requester']);
        const policy=await h.command('policy',{name:'synthetic-purse-6805',currency:'USD',category:'*',project:'*',limitMinor:2000000,budgetMinor:2000000,approver:proposalEmail(6803)});
        const active=await h.command('supplier',{name:'synthetic-purse-6806 existing caterer',status:'active',reason:'Reviewed existing supplier',contacts:[{name:'synthetic-purse-6807',email:proposalEmail(6807)}]},buyer);
        const input=n=>({name:'synthetic-purse-'+n+' catering',contactName:'synthetic-purse-'+(n+1),contactEmail:proposalEmail(n+1),website:'https://supplier-'+(n+1)+'.example.test',phone:'',reason:'Catering needed for the equipment review',consent:true});
        const requestInput=id=>({title:'synthetic-purse-6810 catering request',supplier:id,currency:'USD',needDate:'2099-01-10',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Catering',quantity:'1',unitMinor:90000,category:'Goods',project:'Equipment'}]});
        const propose=(n=6811,cookie=requester)=>h.command('supplier-propose',input(n),cookie);
        const view=async(id,cookie=h.owner)=>(await h.state(cookie)).data.supplierProposal.find(p=>p.id===id);
        const review=async(id)=>{const p=await view(id);return {id,version:p.version??1,basis:p.basis,reason:'Supplier rejected because current onboarding evidence is unavailable'};};
        const approve=async(request)=>{await h.command('submit',{id:request.id,revision:request.revision},requester);return h.command('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Approved exact catering request'},approver);};
        const snapshot=async()=>(await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
        return {h,requester,buyer,approver,other,active,policy,input,requestInput,propose,view,review,approve,snapshot};
    }catch(error){await h.close();throw error;}
}
