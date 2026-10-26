import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {inflateRawSync} from 'node:zlib'
import {DOMParser} from '@xmldom/xmldom'

const require=createRequire(import.meta.url),{SignedXml}=createRequire(require.resolve('@node-saml/node-saml'))('xml-crypto')
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
/** An actual signed-response IdP at the SAML network edge. Keys exist only in temporary custody. */
export async function samlIdp(origin){
 const dir=await mkdtemp(join(tmpdir(),'purse-saml-idp-'))
 let key,cert
 try{execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=Synthetic Purse'],{stdio:'ignore'});key=await readFile(join(dir,'key.pem'),'utf8');cert=await readFile(join(dir,'cert.pem'),'utf8')}finally{await rm(dir,{recursive:true,force:true})}
 const provider={id:'company-saml',label:'Purse SAML',issuer:'https://synthetic-purse-41.example.test',entryPoint:'https://synthetic-purse-41.example.test/sso',entityId:origin+'/purse-saml',idpCert:cert,subjectEmails:{}}
 function sign(xml,element){const signature=new SignedXml({privateKey:key,publicCert:cert,signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',canonicalizationAlgorithm:'http://www.w3.org/2001/10/xml-exc-c14n#'});signature.addReference({xpath:"//*[local-name()='"+element+"']",transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256'});signature.computeSignature(xml,{location:{reference:"//*[local-name()='"+element+"']/*[local-name()='Issuer']",action:'after'}});return signature.getSignedXml()}
 return {provider,response(location,{subject='synthetic-purse-41',audience=provider.entityId,recipient=origin+'/auth/saml/company-saml/callback',destination=origin+'/auth/saml/company-saml/callback',issuer=provider.issuer,expired=false}={}){
  const url=new URL(location),request=new DOMParser().parseFromString(inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'),'base64')).toString(),'text/xml'),id=request.documentElement.getAttribute('ID'),now=new Date().toISOString(),expiry=new Date(Date.now()+(expired?-600000:180000)).toISOString()
  let xml=`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_synthetic-purse-response-41" Version="2.0" IssueInstant="${now}" Destination="${escape(destination)}" InResponseTo="${escape(id)}"><saml:Issuer>${escape(issuer)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_synthetic-purse-assertion-41" Version="2.0" IssueInstant="${now}"><saml:Issuer>${escape(issuer)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${escape(subject)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${escape(id)}" Recipient="${escape(recipient)}" NotOnOrAfter="${expiry}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(Date.now()-1000).toISOString()}" NotOnOrAfter="${expiry}"><saml:AudienceRestriction><saml:Audience>${escape(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}" SessionIndex="synthetic-purse-41"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion></samlp:Response>`
  xml=sign(sign(xml,'Assertion'),'Response')
  return new URLSearchParams({SAMLResponse:Buffer.from(xml).toString('base64'),RelayState:url.searchParams.get('RelayState')}).toString()
 }}
}
