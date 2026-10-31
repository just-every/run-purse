import {readFile} from 'node:fs/promises'
// Disposable conformance drives the same native owner and purchasing HTTP doors.
// It holds no signer, raw database capability or production credential.
import {documentProfileFixture} from './document-profile-fixture.mjs'
export default async function({request,origin,claim,displayName,returnTo,email,reviewers}) {
 const response=await request(new URL(claim.path,origin).href,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:claim.token,displayName,returnTo})})
 if(response.status!==303){console.error('Native owner bootstrap status',response.status);throw Error('Native owner bootstrap refused')}
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
 const command=async(op,body)=>{
  const result=await request(new URL('/api/purse/command/'+op,origin).href,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
  if(!result.ok){console.error('Native fixture command refused',op,result.status,await result.text());throw Error('Native fixture command refused')}
  return result.json()
 }
 await command('business',{name:'Cedar Workshop',currencies:['USD','EUR'],locations:['Denver'],costCentres:['Operations'],projects:['Workshop']})
 await command('supplier',{name:'Cedar Office Supply',status:'preferred',reason:'Established office supplier',contacts:[{name:'Alex Cedar',email:'orders@cedar.example.test'}]})
 await command('po-profile',documentProfileFixture({name:'Cedar Workshop'},'Denver'))
 await command('member',{email,name:'Native owner membership',roles:['approver'],active:true})
 await command('policy',{name:'Safety purchases',currency:'USD',category:'Safety',project:'Workshop',approver:email,limitMinor:1000000,budgetMinor:5000000})
 const requester=await reviewers.initialize('requester',{cookie})
 const suppliers=await request(new URL('/api/purse/state',origin).href,{headers:{cookie:requester.cookie}})
 const supplier=(await suppliers.json()).data.supplier[0]
 const surface=JSON.parse(await readFile(new URL('../agent-surface.json',import.meta.url),'utf8'))
 const phases=2+new Set(surface.tools.flatMap(tool=>tool.classes).filter(cls=>cls!=='standard')).size
 for(let index=0;index<phases*2+1;index++) {
  const title='Workshop source purchase '+(index+1)
  const native=await request(new URL('/api/purse/command/request',origin).href,{method:'POST',headers:{origin,cookie:requester.cookie,'content-type':'application/json'},body:JSON.stringify({title,supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Safety gloves',quantity:'2',unitMinor:1500,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Internal fixture purchase'})})
  if(!native.ok)throw Error('Native requester preparation refused')
  const draft=await native.json()
  const submitted=await request(new URL('/api/purse/command/submit',origin).href,{method:'POST',headers:{origin,cookie:requester.cookie,'content-type':'application/json'},body:JSON.stringify({id:draft.id,revision:draft.revision})})
  if(!submitted.ok)throw Error('Native requester submission refused')
 }
 const second=await command('supplier',{name:'Juniper Tools',status:'preferred',reason:'Independent native supplier source',contacts:[{name:'Morgan Juniper',email:'orders@juniper.example.test'}]})
 const groupResponse=await request(new URL('/api/purse/command/request',origin).href,{method:'POST',headers:{origin,cookie:requester.cookie,'content-type':'application/json'},body:JSON.stringify({title:'Workshop supplier allocation',supplier:supplier.id,currency:'USD',needDate:'2026-12-15',location:'Denver',costCentre:'Operations',lines:[{description:'Safety gloves',quantity:'1',unitMinor:1500,category:'Safety',project:'Workshop'},{description:'Safety glasses',quantity:'1',unitMinor:1500,category:'Safety',project:'Workshop'}],freightMinor:0,taxMinor:0,terms:'Independent supplier allocation fixture'})})
 if(!groupResponse.ok)throw Error('Native grouped request preparation refused')
 const group=await groupResponse.json()
 await command('submit',{id:group.id,revision:group.revision})
 await command('decision',{id:group.id,revision:group.revision,decision:'approved',reason:'Independent native fixture review'})
 await command('convert',{id:group.id,revision:group.revision,conversionEdits:{lines:[{id:group.lines[1].id,supplier:second.id}],reason:'Native buyer supplier allocation'}})
 const complete=await request(new URL('/setup',origin).href,{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({displayName,confirm:'yes'}).toString()})
 if(complete.status!==303)throw Error('Native first-run confirmation refused')
 return response
}
