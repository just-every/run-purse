import { operatorAuthPeople, type PeopleAdapter, type Person } from '../modules/agent-door/index.ts'
import { authConfig, operatorAuth, type Bindings } from '../auth.server'
import { load } from '../purse/store'
import { roles, type Actor } from '../purse/types'

export function nativePeople(env: Bindings): PeopleAdapter {
  const native=operatorAuthPeople({db:env.DB,allowList:authConfig(env).allowList,session:request=>operatorAuth(env).getSession(request)})
  async function admitted(person: Person|null) {
    if (!person?.active) return null
    const {state}=await load(env.DB)
    const actor:Actor={id:person.id,email:person.email,owner:person.role==='owner',session:'',version:0,dev:false}
    return roles(state,actor).length ? person : null
  }
  return { person:async id=>admitted(await native.person(id)), sponsor:async claims=>admitted(await native.sponsor(claims)),
    session:async request=>admitted(await native.session(request)),businessMember:native.businessMember }
}
