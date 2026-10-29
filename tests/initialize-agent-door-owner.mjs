// Disposable conformance drives the same native owner and purchasing HTTP doors.
// It holds no signer, raw database capability or production credential.
export default async function({request,origin,claim,displayName,returnTo}) {
 const response=await request(new URL(claim.path,origin).href,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:claim.token,displayName,returnTo})})
 if(response.status!==303){console.error('Native owner bootstrap status',response.status);throw Error('Native owner bootstrap refused')}
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
 const command=async(op,body)=>{
  const result=await request(new URL('/api/purse/command/'+op,origin).href,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
  if(!result.ok){console.error('Native fixture command refused',op,result.status,await result.text());throw Error('Native fixture command refused')}
  return result.json()
 }
 await command('business',{name:'Cedar Workshop',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
 await command('supplier',{name:'Cedar Office Supply',status:'preferred',reason:'Established office supplier',contacts:[{name:'Alex Cedar',email:'orders@cedar.example.test'}]})
 await command('policy',{name:'Safety purchases',currency:'USD',category:'Safety',project:'Workshop',approver:'approver@cedar.example.test',limitMinor:1000000,budgetMinor:5000000})
 return response
}
