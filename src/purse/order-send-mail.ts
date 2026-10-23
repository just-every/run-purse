import { operatorMail } from '../mail.server.mjs';
import type { Bindings } from '../auth.server';
import { orderBytes } from './order-send-document';
import type { Data } from './types';

/** Only the explicit native buyer send door calls this adapter. An exception
 * after a claimed effect is uncertain; neither a cron nor a replay retries it. */
export async function deliverOrderChange(env: Bindings, event: Data, url: string) {
    const sender = operatorMail(env);
    if (!sender || !env.MAIL_FROM) return { status: 'unavailable', reason: 'mail-not-configured' };
    try {
        const instructions = event.mode === 'initial' ? 'Accept, accept with changes, or reject this exact revision and give a promised delivery date. Proposed changes require the buyer to create an amendment and obtain renewed approval.' : 'Contact the buyer to propose changes; acknowledgment cannot change the order.';
        const message = { deliveryId: (event.mode === 'initial' ? 'po-initial:' : 'po-change:') + event.id, from: env.MAIL_FROM, to: [event.recipient], headers: {}, html: '',
            subject: `${event.changeLabel}: ${event.number} · approved revision ${event.revision}`,
            text: `${event.changeLabel} for ${event.number}, approved request/PO revision ${event.revision}. Review the attached exact purchase order and original terms, then respond to this revision: ${url}\nThis link expires ${event.expiresAt}. It grants access only to this exact purchase order. ${instructions}`,
            attachments: [{ filename: event.pdf.name, contentType: 'application/pdf', content: orderBytes(event.pdf.base64) },
                ...event.content.attachments.map((file: Data) => ({ filename: file.name, contentType: 'application/pdf', content: orderBytes(file.base64) }))] };
        const delivery = await sender.send(message);
        return { delivery, status: delivery.status === 'development' ? 'suppressed' : delivery.status };
    } catch { return { status: 'uncertain', reason: 'provider-outcome-unknown' }; }
}
