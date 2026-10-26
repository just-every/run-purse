import { DOMParser } from '@xmldom/xmldom';
import type { Profile } from '@node-saml/node-saml';
import { AuthError } from '../modules/operator-auth/index.mjs';

const protocol = 'urn:oasis:names:tc:SAML:2.0:protocol', assertion = 'urn:oasis:names:tc:SAML:2.0:assertion';
function requireValid(value: unknown): asserts value { if (!value) throw new AuthError('saml_invalid_response', 400); }
/** Inspect only the exact response that the library has verified with the pinned certificate. */
export function validateSamlDestination(profile: Profile, callback: string, requestId: string, issuer: string) {
    const xml = profile.getSamlResponseXml?.();
    requireValid(xml && !/<!DOCTYPE|<!ENTITY/i.test(xml));
    const doc = new DOMParser({ errorHandler: { warning() {}, error() { throw new AuthError('saml_invalid_response'); }, fatalError() { throw new AuthError('saml_invalid_response'); } } }).parseFromString(xml, 'text/xml');
    const response = doc.documentElement;
    requireValid(response.localName === 'Response' && response.namespaceURI === protocol
        && response.getAttribute('Destination') === callback && response.getAttribute('InResponseTo') === requestId
        && profile.issuer === issuer && typeof profile.nameID === 'string' && profile.nameID.length > 0 && profile.nameID.length <= 255);
    const assertions = response.getElementsByTagNameNS(assertion, 'Assertion');
    requireValid(assertions.length === 1);
    const subject = assertions[0].getElementsByTagNameNS(assertion, 'SubjectConfirmation');
    requireValid(subject.length === 1 && subject[0].getAttribute('Method') === 'urn:oasis:names:tc:SAML:2.0:cm:bearer');
    const data = subject[0].getElementsByTagNameNS(assertion, 'SubjectConfirmationData');
    requireValid(data.length === 1 && data[0].getAttribute('Recipient') === callback && data[0].getAttribute('InResponseTo') === requestId);
    const expiry = Date.parse(data[0].getAttribute('NotOnOrAfter') ?? '');
    requireValid(Number.isFinite(expiry) && expiry > Date.now());
    for (const algorithm of ['SignatureMethod', 'DigestMethod']) {
        const elements = response.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', algorithm);
        requireValid(elements.length >= 2);
        for (let i = 0; i < elements.length; i++) requireValid(elements[i].getAttribute('Algorithm') === (algorithm === 'SignatureMethod'
            ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' : 'http://www.w3.org/2001/04/xmlenc#sha256'));
    }
}
