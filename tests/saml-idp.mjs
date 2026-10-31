import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {SignedXml} from 'xml-crypto';
import {DOMParser} from '@xmldom/xmldom';
const a='urn:oasis:names:tc:SAML:2.0:assertion',p='urn:oasis:names:tc:SAML:2.0:protocol';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
/** An actual local HTTP IdP with fresh RSA keys and signed XML, never a provider receipt. */
export async function samlIdp(){
 const dir=await mkdtemp(join(tmpdir(),'purse-saml-idp-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','2','-subj','/CN=synthetic-purse-idp'],{stdio:'ignore'});
 const privateKey=await readFile(join(dir,'key.pem'),'utf8'),certificate=await readFile(join(dir,'cert.pem'),'utf8');
 const otherKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 let origin,callback,options={},last;
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin);assert.equal(url.pathname,'/sso');assert.equal(req.method,'GET');
   const xml=inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'),'base64')).toString();
   const request=new DOMParser().parseFromString(xml,'application/xml').documentElement;
   assert.equal(request.namespaceURI,p);assert.equal(request.localName,'AuthnRequest');assert.equal(request.getAttribute('Destination'),origin+'/sso');assert.equal(request.getAttribute('AssertionConsumerServiceURL'),callback);
   const audience=request.getElementsByTagNameNS(a,'Issuer')[0].textContent,id=request.getAttribute('ID');
   const now=Date.now(),time=n=>new Date(now+n).toISOString(),expiry=options.expired?time(-1000):time(180000);
   const subject=options.subject??'synthetic-purse-person-1',issuer=options.issuer??origin,recipient=options.recipient??callback,correlation=options.correlation??id;
   const assertion=`<saml:Assertion xmlns:saml="${a}" ID="_${randomUUID()}" Version="2.0" IssueInstant="${time(0)}"><saml:Issuer>${escape(issuer)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${escape(subject)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${escape(correlation)}" Recipient="${escape(recipient)}" NotOnOrAfter="${expiry}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${options.future?time(120000):time(-1000)}" NotOnOrAfter="${expiry}"><saml:AudienceRestriction><saml:Audience>${escape(options.audience??audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${time(0)}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="roles"><saml:AttributeValue>owner</saml:AttributeValue></saml:Attribute><saml:Attribute Name="email"><saml:AttributeValue>${escape(['synthetic-purse-1','example.test'].join('@'))}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
   const signer=new SignedXml({privateKey:options.wrongKey?otherKey:privateKey,publicCert:certificate,signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',canonicalizationAlgorithm:'http://www.w3.org/2001/10/xml-exc-c14n#'});
   signer.addReference({xpath:"//*[local-name()='Assertion']",transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256'});
   signer.computeSignature(assertion,{location:{reference:"//*[local-name()='Issuer']",action:'after'}});
   let signed=signer.getSignedXml();
   if(options.tamper)signed=signed.replace(subject,'synthetic-purse-tampered');
   if(options.unsigned)signed=assertion;
   if(options.wrapping)signed=assertion.replace('synthetic-purse-person-1','synthetic-purse-attacker')+'<samlp:Extensions>'+signed+'</samlp:Extensions>';
   if(options.duplicateId)signed=signed.replace('<saml:Subject>',`<saml:Subject ID="${new DOMParser().parseFromString(signed,'application/xml').documentElement.getAttribute('ID')}">`);
   const response=`<samlp:Response xmlns:samlp="${p}" xmlns:saml="${a}" ID="_${randomUUID()}" Version="2.0" IssueInstant="${time(0)}" Destination="${escape(options.destination??callback)}" InResponseTo="${escape(options.responseCorrelation??id)}"><saml:Issuer>${escape(origin)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="${p}:status:Success"/></samlp:Status>${signed}</samlp:Response>`;
   last={encoded:Buffer.from(response).toString('base64'),relay:url.searchParams.get('RelayState'),requestId:id,xml:response};
   res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Local test identity provider</h1><form method="post" action="${escape(callback)}"><input type="hidden" name="SAMLResponse" value="${last.encoded}"><input type="hidden" name="RelayState" value="${last.relay}"><button>Sign in to Purse</button></form></body></html>`);
  }catch(error){res.writeHead(400);res.end('Local IdP refused the authentication request');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 return {origin,certificate,privateKey,get last(){return last},setCallback(value){callback=value},setOptions(value={}){options=value},configuration(){return {id:'saml-company',label:'Local SAML company',issuer:origin,ssoUrl:origin+'/sso',certificate}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}};
}
