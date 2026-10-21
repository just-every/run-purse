import type { Bindings } from '../auth.server';
import { intakeAddress } from './email-intake';
import { invoiceReading } from './invoice-reading';
import { senderAddress, senderDomainRelation } from './invoice-risk';
import { canonicalSupplier } from './supplier-identity';
import { all, audit, can, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { accessGrants, allowed, requirePermission } from './access';

export const apSenderLabel = 'Provider-reported sender; supplier authorship is not verified';
export const apFileKey = (capture: string, file: string) => `ap-inbox/${capture}/${file}`;
const invoiceDocumentBytes = 1_000_000;

function contactAddress(email: unknown) { try { return senderAddress(email); } catch { return null; } }

/** Routing only. An exact recorded contact links a draft; nothing else is trusted. */
export function apSenderMatch(s: State, from: string): Data {
    const sender = contactAddress(from);
    if (!sender) return { supplier: null, basis: 'invalid-sender', holdReason: 'Provider-reported sender is not a valid email address' };
    const contacts = all(s, 'supplier').flatMap(supplier => (supplier.contacts ?? []).map((contact: Data) => ({ supplier: supplier.id, address: contactAddress(contact.email) }))).filter(c => c.address);
    const exact = [...new Set(contacts.filter(c => c.address!.address === sender.address).map(c => canonicalSupplier(s, c.supplier)))];
    if (exact.length === 1) return { supplier: exact[0], basis: 'exact-recorded-contact', holdReason: null };
    if (exact.length > 1) return { supplier: null, basis: 'ambiguous-contact', holdReason: 'Sender is a recorded contact of more than one supplier' };
    const domains = [...new Set(contacts.map(c => c.address!.domain))];
    if (domains.includes(sender.domain)) return { supplier: null, basis: 'unrecorded-mailbox', holdReason: 'Sender domain belongs to a supplier contact, but this mailbox is not a recorded contact' };
    const relation = domains.length ? senderDomainRelation(domains, sender.domain) : 'different domain';
    if (relation !== 'different domain') return { supplier: null, basis: 'look-alike', holdReason: 'Look-alike sender: ' + relation + ' from a recorded supplier contact domain' };
    return { supplier: null, basis: 'unknown-sender', holdReason: 'Sender matches no supplier contact' };
}

export function apInvoiceEmail(s: State, input: Data): Data {
    const match = apSenderMatch(s, input.from);
    const earlier = all(s, 'apInvoiceEmail');
    const repeatedFiles = input.files.flatMap((file: Data) => earlier.flatMap(capture => capture.files.filter((f: Data) => f.sha256 === file.sha256).map((f: Data) => ({ file: file.id, capture: capture.id, capturedFile: f.id }))));
    return { id: input.id, provider: 'resend', providerEmailId: input.emailId, providerSender: input.from, providerSenderLabel: apSenderLabel, senderVerified: false,
        to: input.normalized.to, subject: input.normalized.subject, sourceText: input.normalized.text, sourceHtml: input.normalized.html, messageId: input.normalized.messageId,
        originalFormat: 'provider-api-json', original: input.original, files: input.files, embedded: input.embedded, repeatedFiles, supplier: match.supplier, match: match.basis,
        status: match.supplier ? 'draft' : 'held', holdReason: match.holdReason, sources: [], version: 1, receivedAt: new Date().toISOString() };
}

function inboxAllowed(s: State, a: Actor, capture: Data, permission: string) {
    if (a.owner) return true;
    const orders = (capture.sources ?? []).map((source: Data) => get(s, 'order', source.order));
    return accessGrants(s, a).some(grant => {
        if (!grant.permissions.includes(permission)) return false;
        const scopes: Data[] = [grant.scope ?? {}, ...(grant.roleScope ? [grant.roleScope] : [])];
        // A supplier identity cannot establish a department for raw inbound mail.
        if (!orders.length) return scopes.every(scope => ['departments', 'locations', 'projects', 'entities'].every(d => scope[d] === undefined));
        return orders.every((order: Data) => {
            if (!allowed(s, a, permission, order)) return false;
            const request = get(s, 'request', order.request);
            const dimensions: Data = { departments: [order.costCentre ?? request.costCentre], locations: [order.location ?? request.location],
                projects: order.lines.map((line: Data) => line.project), entities: [order.entity ?? request.entity ?? 'main'] };
            return scopes.every(scope => Object.entries(dimensions).every(([dimension, values]) => scope[dimension] === undefined
                || values.every((value: string) => scope[dimension].includes(value))));
        });
    });
}
export function apScope(s: State, a: Actor, capture: Data, permission = 'invoice.read') {
    requirePermission(s, a, permission);
    requireThat(inboxAllowed(s, a, capture, permission), 'AP email outside your scope', 403);
}
export function projectInvoiceInbox(s: State, a: Actor, capture: Data) {
    return { ...capture, mayCapture: inboxAllowed(s, a, capture, 'invoice.capture'),
        repeatedFiles: (capture.repeatedFiles ?? []).map((repeat: Data) => {
            const prior = s.get('apInvoiceEmail:' + repeat.capture)?.value;
            return prior && inboxAllowed(s, a, prior, 'invoice.read') ? repeat : { file: repeat.file, repeated: true };
        }) };
}
export function visibleInvoiceInbox(s: State, a: Actor) {
    return { apInvoiceEmail: all(s, 'apInvoiceEmail').filter(capture => inboxAllowed(s, a, capture, 'invoice.read')).map(capture => projectInvoiceInbox(s, a, capture)),
        invoiceInboxConfig: allowed(s, a, 'invoice.read') ? all(s, 'invoiceInboxConfig') : [] };
}

export async function invoiceInbox(s: State, a: Actor, op: string, b: Data, env?: Bindings): Promise<Data | undefined> {
    if (!['invoice-inbox-config', 'invoice-inbox-assign', 'invoice-inbox-source'].includes(op)) return;
    if (op === 'invoice-inbox-config') {
        can(s, a, 'owner');
        const address = intakeAddress(b.address);
        requireThat(s.get('emailIntakeConfig:main')?.value.address !== address, 'Use an AP address separate from the request address', 409);
        const config = { address, updatedBy: a.id, updatedAt: new Date().toISOString() };
        put(s, 'invoiceInboxConfig', 'main', config); audit(s, a, op, 'main', { address });
        return get(s, 'invoiceInboxConfig', 'main');
    }
    requirePermission(s, a, 'invoice.capture');
    const capture = get(s, 'apInvoiceEmail', b.id);
    apScope(s, a, capture, 'invoice.capture');
    requireThat(capture.version === b.version, 'AP email changed; reload', 409);
    if (op === 'invoice-inbox-assign') {
        requireThat(capture.status === 'held', 'Only held AP email can be assigned', 409);
        const reason = text(b.reason, 'Assignment reason'), supplier = canonicalSupplier(s, text(b.supplier, 'Supplier'));
        const next = { ...capture, status: 'draft', supplier, version: capture.version + 1, assignment: { actor: a.id, reason, supplier, at: new Date().toISOString() } };
        put(s, 'apInvoiceEmail', capture.id, next); audit(s, a, op, capture.id, { supplier, reason, match: capture.match });
        return get(s, 'apInvoiceEmail', capture.id);
    }
    requireThat(capture.status === 'draft' && capture.supplier, 'Assign held AP email to a supplier first', 409);
    requireThat(env, 'AP inbox runtime unavailable', 503);
    const file = capture.files.find((f: Data) => f.id === b.file);
    requireThat(file, 'Choose an attachment of this AP email', 404);
    requireThat(!capture.sources.some((x: Data) => x.file === file.id), 'This attachment already opened an invoice reading', 409);
    const order = get(s, 'order', text(b.order, 'Purchase order'));
    requirePermission(s, a, 'invoice.capture', order);
    requireThat(inboxAllowed(s, a, { ...capture, sources: [...capture.sources, { order: order.id }] }, 'invoice.capture'), 'AP email sources must remain within one grant scope', 403);
    requireThat(canonicalSupplier(s, order.supplier) === capture.supplier, 'Choose a PO of the supplier linked to this AP email', 409);
    requireThat(file.size <= invoiceDocumentBytes, 'Attachment exceeds the 1 MB invoice reading limit; its original remains downloadable and nothing was truncated', 413);
    requireThat(file.key === apFileKey(capture.id, file.id), 'Invalid AP email custody', 409);
    const object = await env.ORIGINALS.get(file.key); requireThat(object, 'AP email original unavailable', 409);
    const bytes = new Uint8Array(await object.arrayBuffer());
    const source = (await invoiceReading(s, a, 'invoice-source', { order: order.id, document: { name: file.name, mediaType: file.mediaType, base64: Buffer.from(bytes).toString('base64') } }))!;
    const attachment = get(s, 'attachment', source.attachment);
    requireThat(attachment.size === file.size && attachment.sha256 === file.sha256, 'AP email original custody mismatch', 409);
    put(s, 'invoiceSource', source.id, { ...source, apInvoiceEmail: capture.id, apFile: file.id, apSender: capture.providerSender, apReceivedAt: capture.receivedAt });
    const entry = { file: file.id, order: order.id, source: source.id, actor: a.id, at: new Date().toISOString() };
    put(s, 'apInvoiceEmail', capture.id, { ...capture, sources: [...capture.sources, entry], version: capture.version + 1 });
    audit(s, a, op, capture.id, { file: file.id, order: order.id, source: source.id });
    return get(s, 'invoiceSource', source.id);
}
