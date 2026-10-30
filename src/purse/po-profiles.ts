import { activeEntity, entityId, requireEntityPurchase } from './entities';
import { PDFDocument } from 'pdf-lib';
import { all, audit, can, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
export const poLabels: Record<string, string> = { supplier: 'Supplier', remitTo: 'Remit to', paymentTerms: 'Payment terms', shippingTerms: 'FOB / shipping terms', needDate: 'Need by', promisedDate: 'Promised date', partNumber: 'Supplier part number', description: 'Description', quantity: 'Quantity', unit: 'Unit', unitPrice: 'Unit price', lineTax: 'Line tax', lineTotal: 'Line total including allocated tax', freight: 'Freight', tax: 'Supplied tax', total: 'Order total', notes: 'Notes to supplier' };
export const optionalPoText = (v: unknown, label: string, max = 2000) => v == null || v === '' ? '' : text(v, label, max);
const address = (b: Data, label: string) => ({ label: text(b?.label || label, 'Address label', 80), name: text(b?.name, label + ' name'), address: text(b?.address, label + ' address'), attention: optionalPoText(b?.attention, 'Attention') });
async function original(b: Data, label: string) {
    requireThat(b && typeof b.base64 === 'string' && b.base64.length <= 1333336, label + ' must be a PDF no larger than 1 MB');
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b.base64), c => c.charCodeAt(0)); } catch { requireThat(false, 'Invalid PDF bytes'); }
    requireThat(bytes!.length > 0 && bytes!.length <= 1000000, label + ' must contain up to 1 MB');
    const pdf = await PDFDocument.load(bytes!); requireThat(pdf.getPageCount() > 0, label + ' requires pages');
    return { name: text(b.name, 'PDF filename', 200), base64: b.base64 };
}
export async function poProfiles(s: State, a: Actor, op: string, b: Data) {
    if (op !== 'po-profile') return;
    can(s, a, 'owner');
    const previous = b.id ? get(s, 'poProfile', b.id) : undefined, business = get(s, 'business', 'main');
    requireThat(b.version === (previous?.version ?? 0), 'PO profile changed; reload', 409);
    requireThat(business.locations.includes(b.location), 'Use a configured location');
    const entityKey = b.entity ?? previous?.entity ?? 'main', entity = activeEntity(s,entityKey);
    requireThat(!previous || entityId(previous) === entityKey, 'PO profile entity is immutable',409);
    const purchaseType = text(b.purchaseType || '*', 'Purchase category');
    requireThat(!all(s, 'poProfile').some(p => p.id !== previous?.id && entityId(p) === entityKey && p.location === b.location && p.purchaseType === purchaseType), 'This location and category already have a profile', 409);
    let logo = null;
    if (b.logo) {
        requireThat(['image/png', 'image/jpeg'].includes(b.logo.mediaType) && typeof b.logo.base64 === 'string' && b.logo.base64.length <= 1333336, 'Logo must be PNG/JPEG up to 1 MB');
        const bytes = Uint8Array.from(atob(b.logo.base64), c => c.charCodeAt(0)); requireThat(bytes.length > 0 && bytes.length <= 1000000, 'Logo must contain up to 1 MB');
        const pdf = await PDFDocument.create(), image = b.logo.mediaType === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        requireThat(image.width > 0 && image.height > 0, 'Invalid logo');
        logo = { mediaType: b.logo.mediaType, base64: b.logo.base64 };
    }
    const labels = { ...poLabels };
    for (const [field, label] of Object.entries(b.fieldLabels || {})) { requireThat(field in poLabels, 'Unknown document field label'); labels[field] = text(label, 'Field label', 80); }
    const termsFile = b.termsFile ? await original(b.termsFile, 'Purchase terms') : null;
    const certificate = b.certificate ? { ...await original(b.certificate, 'Configured exemption certificate'), supplierStates: b.certificate.supplierStates } : null;
    if (certificate) requireThat(Array.isArray(certificate.supplierStates) && certificate.supplierStates.length > 0 && certificate.supplierStates.every((v: unknown) => typeof v === 'string' && /^[A-Z]{2}$/.test(v)), 'Certificate requires supplier state codes');
    const id = previous?.id ?? uid(), entry = { id, ...(entity ? {entity:entity.id, entityVersion:entity.version} : {}), version: (previous?.version ?? 0) + 1, location: b.location, purchaseType,
        legalName: entity?.legalName ?? text(b.legalName, 'Legal entity name'), logo,
        billTo: entity ? address({...b.billTo,name:entity.legalName,address:entity.billTo},'Bill to') : address(b.billTo,'Bill to'),
        shipTo: entity ? address({...b.shipTo,name:entity.legalName,address:entity.shipTo},'Ship to') : address(b.shipTo,'Ship to'),
        buyerContact: text(b.buyerContact, 'Buyer contact'), shippingTerms: optionalPoText(b.shippingTerms, 'Shipping terms'),
        standardTerms: text(b.standardTerms, 'Purchase terms', 20000), fieldLabels: labels, termsFile, certificate, actor: a.id, at: new Date().toISOString() };
    put(s, 'poProfile', id, entry); audit(s, a, op, id, { location: entry.location, version: entry.version }); return entry;
}
export function poProfileSnapshot(s: State, r: Data, buyer: Actor) {
    requireEntityPurchase(s,r);
    const categories = new Set(r.lines.map((l: Data) => l.category));
    const profiles = all(s, 'poProfile').filter(p => p.location === r.location && entityId(p) === entityId(r));
    const profile = (categories.size === 1 ? profiles.find(p => p.purchaseType === r.lines[0].category) : null) || profiles.find(p => p.purchaseType === '*');
    requireThat(profile, 'Configure a PO document profile for this location in Settings before conversion', 409);
    requireThat(entityId(r)==='main' || profile.entityVersion === r.entitySnapshot.version && profile.legalName === r.entitySnapshot.legalName && profile.billTo.address === r.entitySnapshot.billTo && profile.shipTo.address === r.entitySnapshot.shipTo, 'Entity profile is stale; configure the exact legal identity in Settings',409);
    return structuredClone({ ...profile, buyerContact: r.poDetails?.buyerContact || profile.buyerContact || buyer.email,
        shippingTerms: r.poDetails?.shippingTerms || profile.shippingTerms, notes: r.poDetails?.notes || '',
        certificate: profile.certificate?.supplierStates.includes(r.supplierSnapshot?.postalState) ? profile.certificate : null });
}
