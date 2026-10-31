import assert from 'node:assert/strict'
import {sponsorIdentity} from './initialize-agent-door-sponsor.mjs'

let suspended

// Phase fixtures receive no signer. The verifier signs the otherwise-valid
// tokens; this module only prepares native people through production doors.
export default async function({phase,request,origin,cookie,database}) {
 const get=(path,session)=>request(new URL(path,origin).href,{headers:{cookie:session}})
 const people=async()=>{
  const response=await get('/auth/operators',cookie)
  assert.equal(response.status,200)
  return (await response.json()).map(({id,email,role,status,version})=>({id,email,role,status,version}))
 }
 if(phase==='consent'&&suspended) {
  // Runs after the verifier's inactive-sponsor probe: a refused token neither
  // restored the person nor changed any native account.
  assert.deepEqual(await people(),suspended)
  console.log('Native inactive sponsor: refused probe left every native account unchanged')
 }
 if(phase!=='negative')return {}
 const inactive=sponsorIdentity(origin,'inactive'),colleague=sponsorIdentity(origin,'colleague')
 assert.notEqual(inactive.id,colleague.id)
 // Read-only disposable state: the signed roster bound this subject before suspension.
 const binding=await (await database('DB')).prepare('SELECT operator_id,email,business_role FROM bs_team WHERE business_id=?').bind(inactive.sub).first()
 assert.deepEqual(binding,{operator_id:inactive.id,email:inactive.email,business_role:'member'})
 assert.equal((await get('/api/purse/state',inactive.cookie)).status,200,'The bound sponsor is active before suspension')
 const response=await request(new URL('/auth/operator/status',origin).href,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({operatorId:inactive.id,status:'inactive'})})
 assert.equal(response.status,200)
 assert.equal((await response.json()).status,'inactive')
 assert.equal((await get('/api/purse/state',inactive.cookie)).status,401)
 assert.equal((await get('/auth/session',inactive.cookie)).status,401)
 assert.equal((await get('/api/purse/state',colleague.cookie)).status,200,'Suspension is limited to its person')
 suspended=await people()
 assert.equal(suspended.find(person=>person.id===inactive.id)?.status,'inactive')
 console.log('Native inactive sponsor: bound and active, suspended through the native account door, its session refused with HTTP 401')
 return {sponsors:{inactive:{sub:inactive.sub,email:inactive.email}}}
}
