import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { X509Certificate } from 'node:crypto';
import { samlError, type SamlProvider } from './saml-config';

const assertionNS = 'urn:oasis:names:tc:SAML:2.0:assertion', protocolNS = 'urn:oasis:names:tc:SAML:2.0:protocol';
const signatureNS = 'http://www.w3.org/2000/09/xmldsig#';
const exclusive = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const rsa256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', sha256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
type Element = NonNullable<ReturnType<DOMParser['parseFromString']>['documentElement']>;
const check: (condition: unknown) => asserts condition = condition => { if (!condition) samlError(); };
function parse(xml: string) {
    check(xml.length <= 131072 && !/<!|<\?(?!xml\s)/i.test(xml));
    const doc = new DOMParser({ onError: () => samlError() }).parseFromString(xml, 'application/xml');
    check(doc.documentElement);
    const ids = new Set<string>();
    for (const element of Array.from(doc.getElementsByTagName('*'))) {
        const attributes = Array.from(element.attributes).filter(attr => attr.localName?.toLowerCase() === 'id');
        check(attributes.length <= 1);
        for (const attr of attributes) { check(attr.value && !ids.has(attr.value)); ids.add(attr.value); }
    }
    return doc.documentElement;
}
const children = (parent: Element, ns: string, name: string) => Array.from(parent.childNodes).filter(node => node.nodeType === 1 && node.namespaceURI === ns && node.localName === name) as Element[];
function one(parent: Element, ns: string, name: string) { const entries = children(parent, ns, name); check(entries.length === 1); return entries[0]; }
function text(parent: Element) { check(!Array.from(parent.childNodes).some(child => child.nodeType === 1)); return parent.textContent ?? ''; }
function instant(value: string | null) { check(value && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)); const number = Date.parse(value); check(Number.isFinite(number)); return number; }
function signed(xml: string, element: Element, provider: SamlProvider) {
    const signature = one(element, signatureNS, 'Signature'), info = one(signature, signatureNS, 'SignedInfo');
    check(one(info, signatureNS, 'CanonicalizationMethod').getAttribute('Algorithm') === exclusive);
    check(one(info, signatureNS, 'SignatureMethod').getAttribute('Algorithm') === rsa256);
    const reference = one(info, signatureNS, 'Reference'), id = element.getAttribute('ID');
    check(id && reference.getAttribute('URI') === '#' + id);
    check(one(reference, signatureNS, 'DigestMethod').getAttribute('Algorithm') === sha256);
    const transforms = children(one(reference, signatureNS, 'Transforms'), signatureNS, 'Transform');
    check(transforms.length === 2 && transforms[0].getAttribute('Algorithm') === signatureNS + 'enveloped-signature' && transforms[1].getAttribute('Algorithm') === exclusive);
    const verifier = new SignedXml({ publicCert: provider.certificate, getCertFromKeyInfo: () => null });
    verifier.loadSignature(new XMLSerializer().serializeToString(signature));
    check(verifier.checkSignature(xml));
    const references = verifier.getSignedReferences();
    check(references.length === 1);
    const trusted = parse(references[0]);
    check(trusted.localName === element.localName && trusted.namespaceURI === element.namespaceURI && trusted.getAttribute('ID') === id);
    return trusted;
}

/** Read identity only from the verified reference, with a single assertion and
 * exact bearer confirmation. Assertion attributes never confer authority. */
export function verifySaml(encoded: string, provider: SamlProvider, requestId: string, now = Date.now()) {
    try {
        check(encoded.length <= 180000 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded));
        const xml = Buffer.from(encoded, 'base64').toString('utf8'), response = parse(xml);
        check(response.namespaceURI === protocolNS && response.localName === 'Response' && response.getAttribute('Version') === '2.0');
        check(response.getAttribute('Destination') === provider.callback && response.getAttribute('InResponseTo') === requestId);
        check(text(one(response, assertionNS, 'Issuer')) === provider.issuer);
        check(one(one(response, protocolNS, 'Status'), protocolNS, 'StatusCode').getAttribute('Value') === protocolNS + ':status:Success');
        check(response.getElementsByTagNameNS(assertionNS, 'Assertion').length === 1);
        check(response.getElementsByTagNameNS(assertionNS, 'EncryptedAssertion').length === 0);
        const assertion = one(response, assertionNS, 'Assertion');
        check(response.getElementsByTagNameNS(signatureNS, 'Signature').length === (children(response, signatureNS, 'Signature').length ? 2 : 1));
        if (children(response, signatureNS, 'Signature').length) signed(xml, response, provider);
        const trusted = signed(xml, assertion, provider);
        const cert = new X509Certificate(provider.certificate);
        check(Date.parse(cert.validFrom) <= now && now < Date.parse(cert.validTo));
        check(trusted.getAttribute('Version') === '2.0' && text(one(trusted, assertionNS, 'Issuer')) === provider.issuer);
        const issued = instant(trusted.getAttribute('IssueInstant'));
        check(issued <= now + 60000 && issued >= now - 300000);
        const conditions = one(trusted, assertionNS, 'Conditions');
        const start = instant(conditions.getAttribute('NotBefore')), expiry = instant(conditions.getAttribute('NotOnOrAfter'));
        check(start <= now + 60000 && expiry > now && expiry <= now + 600000 && start < expiry);
        check(children(conditions, assertionNS, 'OneTimeUse').length <= 1 && children(conditions, assertionNS, 'ProxyRestriction').length === 0);
        const restrictions = children(conditions, assertionNS, 'AudienceRestriction'); check(restrictions.length > 0);
        check(Array.from(conditions.childNodes).filter(node => node.nodeType === 1).every(node => node.namespaceURI === assertionNS && ['AudienceRestriction', 'OneTimeUse'].includes(node.localName ?? '')));
        for (const restriction of restrictions) check(children(restriction, assertionNS, 'Audience').some(audience => text(audience) === provider.entityId));
        const subject = one(trusted, assertionNS, 'Subject'), name = one(subject, assertionNS, 'NameID');
        check(name.getAttribute('Format') === 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent');
        if (name.hasAttribute('NameQualifier')) check(name.getAttribute('NameQualifier') === provider.issuer);
        if (name.hasAttribute('SPNameQualifier')) check(name.getAttribute('SPNameQualifier') === provider.entityId);
        check(!name.hasAttribute('SPProvidedID'));
        const identity = text(name); check(identity && identity.length <= 255 && identity.trim() === identity);
        const confirmation = one(subject, assertionNS, 'SubjectConfirmation');
        check(confirmation.getAttribute('Method') === 'urn:oasis:names:tc:SAML:2.0:cm:bearer');
        const data = one(confirmation, assertionNS, 'SubjectConfirmationData');
        check(data.getAttribute('InResponseTo') === requestId && data.getAttribute('Recipient') === provider.callback && !data.hasAttribute('NotBefore'));
        const bearerExpiry = instant(data.getAttribute('NotOnOrAfter')); check(bearerExpiry > now && bearerExpiry <= expiry);
        const statement = one(trusted, assertionNS, 'AuthnStatement');
        check(instant(statement.getAttribute('AuthnInstant')) <= now + 60000);
        check(text(one(one(statement, assertionNS, 'AuthnContext'), assertionNS, 'AuthnContextClassRef')).length > 0);
        if (statement.hasAttribute('SessionNotOnOrAfter')) check(instant(statement.getAttribute('SessionNotOnOrAfter')) > now);
        return { subject: identity, expiresAt: Math.min(expiry, bearerExpiry), assertionId: trusted.getAttribute('ID')! };
    } catch { return samlError(); }
}
