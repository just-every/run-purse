import assert from 'node:assert/strict'

// A real native requester, independent of the owner who will sponsor decisions.
export default async function({request,origin,email,owner,mail,returnTo}) {
 const post=async(path,body,cookie=owner.cookie)=>request(new URL(path,origin).href,{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
 const member=await post('/api/purse/command/member',{email,name:'Jordan Requester',roles:['requester'],active:true})
 assert.equal(member.status,200)
 const invite=await post('/api/purse/invite',{email})
 assert.equal(invite.status,200)
 const messages=await mail.read({limit:10})
 const message=[...messages].reverse().find(item=>item.text?.includes('/auth/confirm?token='))
 assert.ok(message)
 const url=new URL(message.text.match(/https:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0])
 return post('/auth/confirm',{token:url.searchParams.get('token'),returnTo},'')
}
