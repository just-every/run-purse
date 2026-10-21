const string = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const timestamp = v => string(v, 40) && Number.isFinite(Date.parse(v));
const address = v => string(v, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const senderLabel = 'Provider-reported sender; supplier authorship is not verified';

/** Portable AP mail custody; archived captures confer no invoice, approval or supplier authority. */
export function validateInvoiceInbox(all, get, check) {
    const providerIds = new Set(all('emailIntake').map(intake => intake.providerEmailId)), keys = new Set(), sources = new Set();
    for (const config of all('invoiceInboxConfig')) {
        check(config.id === 'main' && address(config.address) && config.address === config.address.toLowerCase() && string(config.updatedBy) && timestamp(config.updatedAt), 'invoice_inbox_config');
        for (const request of all('emailIntakeConfig')) check(request.address !== config.address, 'invoice_inbox_separate_address');
    }
    for (const capture of all('apInvoiceEmail')) {
        check(string(capture.id, 200) && capture.id.length && capture.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(capture.providerEmailId) && !providerIds.has(capture.providerEmailId), 'invoice_inbox_identity');
        providerIds.add(capture.providerEmailId);
        check(string(capture.providerSender, 254) && capture.providerSenderLabel === senderLabel && capture.senderVerified === false && Array.isArray(capture.to) && capture.to.length > 0 && capture.to.every(address), 'invoice_inbox_sender');
        check(string(capture.subject) && (capture.sourceText === null || string(capture.sourceText, 500_000)) && (capture.sourceHtml === null || string(capture.sourceHtml, 500_000)) && timestamp(capture.receivedAt), 'invoice_inbox_content');
        check(Number.isSafeInteger(capture.version) && capture.version > 0 && ['held', 'draft'].includes(capture.status), 'invoice_inbox_status');
        check(capture.originalFormat === 'provider-api-json' && capture.original?.id === 'original' && Array.isArray(capture.files) && capture.files.length <= 3 && Array.isArray(capture.sources), 'invoice_inbox_original');
        let total = 0;
        for (const file of [capture.original, ...capture.files]) {
            check(string(file.id, 200) && file.id.length && string(file.name) && string(file.mediaType, 150) && /^[a-f0-9]{64}$/.test(file.sha256), 'invoice_inbox_file');
            check(file.key === `ap-inbox/${capture.id}/${file.id}` && !keys.has(file.key) && file.base64 === undefined && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= (file.id === 'original' ? 2_000_000 : 10_000_000), 'invoice_inbox_file_custody');
            keys.add(file.key); if (file.id !== 'original') total += file.size;
        }
        check(capture.embedded === undefined || Array.isArray(capture.embedded), 'invoice_inbox_embedded');
        for (const file of capture.embedded ?? []) {
            check(string(file.id, 200) && file.id.length && string(file.name) && file.mediaType === 'application/pdf' && /^[a-f0-9]{64}$/.test(file.sha256) && capture.files.some(f => f.id === file.embeddedIn) && string(file.path), 'invoice_inbox_embedded_file');
            check(file.key === `ap-inbox/${capture.id}/${file.id}` && !keys.has(file.key) && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 10_000_000, 'invoice_inbox_embedded_custody');
            keys.add(file.key); total += file.size;
        }
        check(total <= 30_000_000, 'invoice_inbox_file_total');
        if (capture.status === 'held') check(capture.supplier === null && string(capture.holdReason) && !capture.sources.length, 'invoice_inbox_hold');
        else get('supplier', capture.supplier);
        if (capture.assignment) check(string(capture.assignment.actor) && string(capture.assignment.reason) && capture.assignment.reason.trim() && capture.assignment.supplier === capture.supplier && timestamp(capture.assignment.at), 'invoice_inbox_assignment');
        for (const entry of capture.sources) {
            const source = get('invoiceSource', entry.source), file = capture.files.find(f => f.id === entry.file), attachment = get('attachment', source.attachment);
            check(file && !sources.has(entry.source) && source.apInvoiceEmail === capture.id && source.apFile === file.id && source.apSender === capture.providerSender && source.order === entry.order && attachment.sha256 === file.sha256 && attachment.size === file.size && timestamp(entry.at), 'invoice_inbox_source');
            sources.add(entry.source);
        }
    }
    for (const source of all('invoiceSource').filter(source => source.apInvoiceEmail)) check(sources.has(source.id), 'invoice_inbox_source_link');
}
