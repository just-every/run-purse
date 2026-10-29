import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHash,generateKeyPairSync,randomUUID,sign,verify} from 'node:crypto'

const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
const decode=value=>JSON.parse(Buffer.from(value,'base64url').toString())
const keyPair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'})

/** A local test IdP: actual discovery, authorization code, PKCE, client assertion and signed ID token. */
export async function identityIdp(){
 const provider=keyPair(),client=keyPair(),kid='synthetic-purse-idp-1',clientKid='synthetic-purse-client-1',clientId='synthetic-purse-client';
 const privateKey={...client.privateKey.export({format:'jwk'}),kid:clientKid,alg:'ES256'};
 const publicKey={...provider.publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'};
 const codes=new Map(),assertions=new Set();let origin,callback;
 let principal={sub:'synthetic-purse-person-1',email:'requester@example.test'},wrongNonce=false;
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin);
   if(url.pathname==='/.well-known/openid-configuration')return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',jwks_uri:origin+'/jwks',response_types_supported:['code'],response_modes_supported:['query'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],id_token_signing_alg_values_supported:['ES256'],token_endpoint_auth_methods_supported:['private_key_jwt'],token_endpoint_auth_signing_alg_values_supported:['ES256'],authorization_response_iss_parameter_supported:true,rer_interfaces:['oidc-provider@1.0.0']});
   if(url.pathname==='/jwks')return json({keys:[publicKey]});
   if(url.pathname==='/authorize'){
    assert.equal(req.method,'GET');assert.equal(url.searchParams.get('client_id'),clientId);assert.equal(url.searchParams.get('redirect_uri'),callback);
    assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('nonce'));
    const code=randomUUID();codes.set(code,{challenge:url.searchParams.get('code_challenge'),nonce:url.searchParams.get('nonce'),principal:{...principal},wrongNonce});
    const target=new URL(callback);for(const [name,value]of Object.entries({code,state:url.searchParams.get('state'),iss:origin}))target.searchParams.set(name,value);
    res.writeHead(303,{location:target.href});return res.end();
   }
   if(url.pathname==='/token'){
    assert.equal(req.method,'POST');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<16384);chunks.push(chunk)}
    const form=new URLSearchParams(Buffer.concat(chunks).toString());assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('client_id'),clientId);assert.equal(form.get('redirect_uri'),callback);
    assert.equal(form.get('client_assertion_type'),'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    const assertion=form.get('client_assertion'),parts=assertion.split('.'),header=decode(parts[0]),claims=decode(parts[1]);
    assert.equal(header.alg,'ES256');assert.equal(header.kid,clientKid);assert.equal(claims.iss,clientId);assert.equal(claims.sub,clientId);assert.equal(claims.aud,origin+'/token');
    assert.ok(claims.exp>Date.now()/1000);assert.ok(!assertions.has(claims.jti));assertions.add(claims.jti);
    assert.ok(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:client.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
    const code=form.get('code'),authorization=codes.get(code);assert.ok(authorization);codes.delete(code);
    assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),authorization.challenge);
    const now=Math.floor(Date.now()/1000),payload={iss:origin,aud:clientId,sub:authorization.principal.sub,email:authorization.principal.email,email_verified:true,email_verified_at:now,iat:now,exp:now+300,nonce:authorization.wrongNonce?'synthetic-purse-wrong-nonce':authorization.nonce,roles:['owner'],groups:['owner'],department:'Forged provider department'};
    const unsigned=encode({alg:'ES256',kid,typ:'JWT'})+'.'+encode(payload),signature=sign('sha256',Buffer.from(unsigned),{key:provider.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
    return json({id_token:unsigned+'.'+signature});
   }
   res.writeHead(404);res.end();
  }catch(error){const site=error.stack?.split('\n').find(line=>line.includes('identity-idp.mjs:'))?.trim();console.error('Local IdP refused '+new URL(req.url,origin).pathname+' at '+(site??error.name));res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'invalid_request'}))}
  function json(body){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body))}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 return {origin,privateKey,clientId,setCallback(value){callback=value},setPrincipal(value){principal={...value}},wrongNonce(value){wrongNonce=value},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
