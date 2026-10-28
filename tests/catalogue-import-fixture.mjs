export const email = n => ['synthetic-purse-'+n, 'example.test'].join('@');
export async function catalogueFixture(h) {
 const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-3001',currencies:['USD','EUR'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const buyer=await h.member(email(3002),['buyer']),requester=await h.member(email(3003),['requester']),approver=await h.member(email(3004),['approver']);
 const vendor=await cmd('supplier',{name:'synthetic-purse-3005',status:'active',reason:'Reviewed source supplier'});
 await cmd('policy',{name:'synthetic-purse-3006',currency:'USD',category:'Equipment',project:'Office',approver:email(3004),limitMinor:1000000,budgetMinor:10000000});
 const headers=['supplierId','sku','currency','description','unit','unitPrice','category','validFrom','validUntil','project'];
 const csv=(rows)=>[headers.join(','),...rows.map(row=>[vendor.id,'synthetic-purse-3007','USD','Imported desk','each','123.45','Equipment','2000-01-01','2099-12-31','Office'].map((value,index)=>row[headers[index]]??value).map(value=>'"'+String(value).replaceAll('"','""')+'"').join(','))].join('\n');
 const input={csv:csv([{}, {currency:'EUR',unitPrice:'98.76'}, {sku:'synthetic-purse-3008',description:'Future desk',validFrom:'2099-01-01'}])};
 const preview=async(inputValue=input,status=200,cookie=buyer)=>{const response=await h.send('/api/purse/catalogue-import/preview',inputValue,cookie);if(response.status!==status)throw Error(JSON.stringify(response));return response.value;};
 const commit=async(review,extra={},status=200,cookie=buyer)=>cmd('catalogue-import-commit',{...input,fingerprint:review.fingerprint,review:review.review,consent:true,...extra},cookie,status);
 const purchase=async(item,extra={})=>cmd('request',{title:'synthetic-purse-3009',supplier:vendor.id,currency:item.currency,needDate:'2099-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{catalogue:item.id,quantity:'2'}],...extra},requester);
 return {buyer,requester,approver,vendor,csv,input,preview,commit,purchase};
}
