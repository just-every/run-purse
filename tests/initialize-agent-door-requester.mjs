import assert from 'node:assert/strict'

let currentSession
export function requesterSession(){assert.ok(currentSession);return currentSession}

// A real requester independent of the owner, using native invitations and mail.
export default async function({request,origin,email,owner,mail,returnTo}) {
 const post=async(path,body,cookie=owner.cookie)=>request(new URL(path,origin).href,{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
 const confirm=async()=>{
  const messages=await mail.read({limit:10})
  const message=[...messages].reverse().find(item=>item.text?.includes('/auth/confirm?token='))
  assert.ok(message)
  const url=new URL(message.text.match(/https:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0])
  const response=await post('/auth/confirm',{token:url.searchParams.get('token'),returnTo},'')
  assert.equal(response.status,303)
  return response
 }
 const cookieOf=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
 assert.equal((await post('/api/purse/command/member',{email,name:'Jordan Requester',roles:['requester'],active:true})).status,200)
 assert.equal((await post('/api/purse/invite',{email})).status,200)
 const invited=await confirm(),originalCookie=cookieOf(invited)
 const session=await request(new URL('/auth/session',origin).href,{headers:{cookie:originalCookie}})
 assert.equal(session.status,200)
 const {operator}=await session.json()
 assert.equal((await post('/auth/operator/role',{operatorId:operator.id,role:'admin'})).status,200)
 // A native role change invalidates the old session. Authenticate again through
 // the native mail lifecycle; retaining that cookie would test no admin at all.
 assert.equal((await post('/auth/magic-link',{email,returnTo},'')).status,202)
 const refreshed=await confirm(),cookie=cookieOf(refreshed)
 const purchasing=await request(new URL('/api/purse/state',origin).href,{headers:{cookie}})
 const audit=await request(new URL('/agents/api/audit',origin).href,{headers:{cookie}})
 console.log('Native promoted-admin purchasing/audit status',purchasing.status,audit.status)
 assert.equal(purchasing.status,200)
 assert.equal(audit.status,403)
 console.log('Native role lifecycle: locally promoted admin retains requester grants and is refused Business editor authority')
 currentSession={cookie}
 return refreshed
}
