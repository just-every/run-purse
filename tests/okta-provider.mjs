import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'

/** Creates only disposable Purse resources in the explicitly held Integrator org. */
export async function oktaProvider(callback){
 const origin=process.env.OKTA_ORG_URL?.replace(/\/$/,''),token=process.env.OKTA_API_TOKEN
 assert.equal(origin,'https://integrator-5551871.okta.com','Only the held owner Integrator org is authorized')
 assert.ok(token,'Run with the held-key injection wrapper')
 const owned={users:[],apps:[],policies:[]},suffix=Date.now().toString(36)+'-'+randomBytes(3).toString('hex')
 async function api(path,body,method=body===undefined?'GET':'POST'){
  const response=await fetch(origin+'/api/v1'+path,{method,headers:{authorization:'SSWS '+token,'content-type':'application/json',accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=response.status===204?null:await response.json()
  if(!response.ok)throw new Error('Okta management '+method+' '+path.split('?')[0]+' status '+response.status+' '+(value?.errorCode??''))
  return value
 }
 async function close(){
  for(const id of owned.apps.reverse()){await api('/apps/'+id+'/lifecycle/deactivate',{},'POST');await api('/apps/'+id,undefined,'DELETE')}
  for(const id of owned.policies.reverse())await api('/policies/'+id,undefined,'DELETE')
  for(const id of owned.users.reverse()){const user=await api('/users/'+id);if(user.status!=='DEPROVISIONED')await api('/users/'+id+'/lifecycle/deactivate',{},'POST');await api('/users/'+id,undefined,'DELETE')}
 }
 try{
  const password=randomBytes(30).toString('base64url')+'aA9!',email='synthetic-purse-'+suffix+'@example.com'
  const user=await api('/users?activate=true',{profile:{firstName:'Synthetic',lastName:'Purse',email,login:email,department:'Operations'},credentials:{password:{value:password}}});owned.users.push(user.id)
  const app=await api('/apps',{name:'oidc_client',label:'Purse ACCESS-002 '+suffix,signOnMode:'OPENID_CONNECT',credentials:{oauthClient:{token_endpoint_auth_method:'client_secret_basic'}},settings:{oauthClient:{application_type:'web',grant_types:['authorization_code'],response_types:['code'],redirect_uris:[callback],consent_method:'TRUSTED'}}});owned.apps.push(app.id)
  const policy=await api('/policies',{type:'ACCESS_POLICY',name:'Purse synthetic app '+suffix,description:'Only the disposable Purse qualification app',status:'ACTIVE'});owned.policies.push(policy.id)
  await api('/policies/'+policy.id+'/rules',{type:'ACCESS_POLICY',name:'Synthetic Purse password sign-in',priority:1,status:'ACTIVE',conditions:{people:{users:{include:[user.id]}}},actions:{appSignOn:{access:'ALLOW',verificationMethod:{factorMode:'1FA',type:'ASSURANCE',reauthenticateIn:'PT12H',constraints:[{knowledge:{types:['password']}}]}}})
  await api('/apps/'+app.id+'/policies/'+policy.id,undefined,'PUT')
  await api('/apps/'+app.id+'/users',{id:user.id,scope:'USER',credentials:{userName:email}})
  const client=app.credentials.oauthClient
  return {origin,user,app,clientId:client.client_id,clientSecret:client.client_secret,api,close,async authorize(url){
   const response=await fetch(origin+'/api/v1/authn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:email,password})}),authentication=await response.json()
   if(!response.ok||authentication.status!=='SUCCESS'||!authentication.sessionToken)throw new Error('Okta authentication status '+response.status+' '+(authentication.status??authentication.errorCode??'unknown'))
   const target=new URL(url);target.searchParams.set('sessionToken',authentication.sessionToken)
   const authorization=await fetch(target,{redirect:'manual'})
   const location=authorization.headers.get('location')
   if(!location||!location.startsWith(callback)){const html=await authorization.text(),title=html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1],actions=[...html.matchAll(/<form[^>]*action=["']([^"']*)["']/gi)].map(match=>{try{return new URL(match[1],origin).pathname}catch{return 'unknown'}});throw new Error('Okta authorization HTTP '+authorization.status+' title '+(title??'none')+' form paths '+JSON.stringify(actions))}
   return location
  }}
 }catch(error){await close();throw error}
}
