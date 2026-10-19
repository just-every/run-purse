import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const string = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const timestamp = v => string(v, 40) && Number.isFinite(Date.parse(v));
const address = v => string(v, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const senderLabel = 'Provider-reported sender; employee authorship is not verified';

/** Portable source custody and request lineage; archived principals confer no native authority. */
export function validateEmailIntakes(all, get, check) {
    const providerIds = new Set(), keys = new Set(), requests = new Set();
    for (const config of all('emailIntakeConfig')) {
        check(config.id === 'main' && address(config.address) && config.address === config.address.toLowerCase() && string(config.updatedBy) && timestamp(config.updatedAt), 'email_intake_config');
    }
    for (const intake of all('emailIntake')) {
        check(string(intake.id, 200) && intake.id.length && intake.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(intake.providerEmailId) && !providerIds.has(intake.providerEmailId), 'email_intake_identity');
        providerIds.add(intake.providerEmailId);
        check(address(intake.providerSender) && intake.providerSenderLabel === senderLabel && intake.senderVerified === false && Array.isArray(intake.to) && intake.to.length > 0 && intake.to.every(address), 'email_intake_sender');
        check(string(intake.subject) && string(intake.title) && string(intake.body, 500_000) && Buffer.byteLength(intake.body) <= 500_000 && (intake.sourceText === null || string(intake.sourceText, 500_000)) && (intake.sourceHtml === null || string(intake.sourceHtml, 500_000)) && timestamp(intake.receivedAt), 'email_intake_content');
        check(Number.isSafeInteger(intake.version) && intake.version > 0 && ['held', 'draft', 'completed'].includes(intake.status), 'email_intake_status');
        check(intake.originalFormat === 'provider-api-json' && intake.original?.id === 'original' && Array.isArray(intake.files) && intake.files.length <= 3, 'email_intake_original');
        let total = 0;
        for (const file of [intake.original, ...intake.files]) {
            check(string(file.id, 200) && file.id.length && string(file.name) && string(file.mediaType, 150) && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.mediaType) && /^[a-f0-9]{64}$/.test(file.sha256), 'email_intake_file');
            check(file.key === `intake/${intake.id}/${file.id}` && !keys.has(file.key) && file.base64 === undefined && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= (file.id === 'original' ? 2_000_000 : 10_000_000), 'email_intake_file_custody');
            keys.add(file.key); if (file.id !== 'original') total += file.size;
        }
        check(total <= 30_000_000, 'email_intake_file_total');
        if (intake.status === 'held') {
            check(intake.requester === null && intake.requesterEmail === null && intake.requesterVersion === null && string(intake.holdReason) && !intake.request, 'email_intake_hold');
        } else {
            check(string(intake.requester) && intake.requester.length && address(intake.requesterEmail) && Number.isSafeInteger(intake.requesterVersion) && intake.requesterVersion > 0, 'email_intake_assignment');
        }
        if (intake.assignment) check(string(intake.assignment.actor) && string(intake.assignment.reason) && intake.assignment.reason.trim() && timestamp(intake.assignment.at), 'email_intake_assignment_reason');
        if (intake.editedAt) check(timestamp(intake.editedAt) && intake.editedBy === intake.requester, 'email_intake_edit');
        if (intake.status === 'completed') {
            const request = get('request', intake.request);
            check(!requests.has(request.id) && request.emailIntake === intake.id && request.requester === intake.requester && request.requesterEmail === intake.requesterEmail && intake.completedBy === intake.requester && timestamp(intake.completedAt), 'email_intake_request');
            requests.add(request.id);
        } else check(!intake.request && !intake.completedAt && !intake.completedBy, 'email_intake_uncompleted');
    }
    for (const request of all('request').filter(r => r.emailIntake)) check(get('emailIntake', request.emailIntake).request === request.id, 'email_intake_request_link');
    for (const event of all('emailIntakeMailEvent')) {
        const intake = get('emailIntake', event.intake);
        check(event.id.startsWith(intake.id + ':link:') && /^\d+$/.test(event.id.slice((intake.id + ':link:').length)) && Number(event.id.slice((intake.id + ':link:').length)) <= intake.version && event.requester === intake.requester && event.recipient === intake.requesterEmail && timestamp(event.at), 'email_intake_mail_identity');
        check(['pending', 'uncertain', 'unavailable', 'suppressed', 'accepted', 'rejected', 'rate_limited'].includes(event.status), 'email_intake_mail_status');
        if (event.claimedAt) check(timestamp(event.claimedAt), 'email_intake_mail_claim');
        if (event.outcomeAt) check(timestamp(event.outcomeAt), 'email_intake_mail_outcome');
        if (event.delivery) {
            try { validateSendResult(event.delivery, event.delivery.provider); } catch { check(false, 'email_intake_mail_delivery'); }
            check(event.status === (event.delivery.status === 'development' ? 'suppressed' : event.delivery.status), 'email_intake_mail_delivery_status');
        }
    }
}
