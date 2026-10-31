import assert from 'node:assert/strict'

// Disposable conformance state only. Each additional sponsor accepts the native
// invitation that the signed Business roster issued; no account, session or
// grant is written outside the production doors.
const lifecycles=new Map(),people=new Map()
const key=(origin,label)=>origin+' '+label

// The owner hands over its reviewer mailbox hook. Each sponsor runs it only once
// the roster has bound its Business subject and sent the invitation.
export function prepareSponsors(origin,reviewers,labels) {
 for(const label of labels)lifecycles.set(key(origin,label),owner=>reviewers.initialize(label,{cookie:owner.cookie}))
}

export function sponsorIdentity(origin,label) {
 const person=people.get(key(origin,label))
 assert.ok(person?.sub,'The '+label+' sponsor completed its native lifecycle')
 return person
}

export default async function(context) {
 const {request,origin,email,label}=context
 if(context.sub) {
  const lifecycle=lifecycles.get(key(origin,label))
  lifecycles.delete(key(origin,label))
  assert.equal(typeof lifecycle,'function','The owner prepared this sponsor mailbox')
  await lifecycle(context.owner)
  const person=people.get(key(origin,label))
  assert.equal(person?.email,email)
  person.sub=context.sub
  return person.response
 }
 const {owner,mail,returnTo}=context
 const get=(path,cookie)=>request(new URL(path,origin).href,{headers:{cookie}})
 const post=(path,body,cookie)=>request(new URL(path,origin).href,{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
 const operators=await get('/auth/operators',owner.cookie)
 assert.equal(operators.status,200)
 const invited=(await operators.json()).find(operator=>operator.email===email)
 assert.equal(invited?.status,'invited','The signed Business roster invited this person')
 assert.equal(invited.role,'member')
 // Purchasing grants stay the native owner's decision, never the roster's.
 const member=await post('/api/purse/command/member',{email,name:'Sponsor '+label,roles:['requester'],active:true},owner.cookie)
 assert.equal(member.status,200)
 const message=[...mail.read({limit:10})].reverse().find(item=>item.text?.includes('/auth/confirm?token='))
 assert.ok(message,'The roster invitation reached this sponsor mailbox')
 const link=new URL(message.text.match(/https:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0])
 assert.equal(link.origin,origin)
 const response=await post('/auth/confirm',{token:link.searchParams.get('token'),returnTo},'')
 assert.equal(response.status,303)
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
 const session=await get('/auth/session',cookie)
 assert.equal(session.status,200)
 const {operator}=await session.json()
 assert.equal(operator.id,invited.id)
 assert.equal(operator.status,'active')
 assert.equal((await get('/api/purse/state',cookie)).status,200)
 people.set(key(origin,label),{id:operator.id,email,cookie,response})
 console.log('Native sponsor lifecycle:',label,'accepted its Business roster invitation with requester grants')
 return response
}
