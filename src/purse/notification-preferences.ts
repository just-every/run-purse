import { createHash } from 'node:crypto';
import { all, audit, get, put, requireThat, roles, text, type Actor, type Data, type State } from './types';
export const notificationTypes = ['approval-needed','returned','approved','comment-mention','receipt-needed','approver-edit','buyer-edit','po-acknowledged','chase-sent','delivered','exception-assigned','document-expiring'] as const;
export const notificationId = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const time = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function notificationPreference(s: State, a: Actor): Data {
    requireThat(roles(s,a).length, 'No active business membership',403);
    return all(s,'notificationPreference').find(p => p.recipient === a.id && !p.erasure) ?? {
        id: notificationId(['preferences',a.id]), recipient: a.id, version: 0, channel: 'in-app', cadence: 'immediate',
        timezone: s.get('business:main')?.value.timezone || 'America/New_York', quiet: true, quietStart: '20:00', quietEnd: '07:00', weekends: false, digestAt: '07:00',
    };
}
export function notificationSettings(s: State, a: Actor) {
    const preferences = notificationPreference(s,a);
    return { preferences, urgency: a.owner ? all(s,'notificationUrgency') : [], urgentTypes: all(s,'notificationUrgency').filter(p => p.urgent).map(p => p.type),
        deliveries: all(s,'notificationDelivery').filter(d => d.recipient === a.id && !d.erasure).map(({ id, channel, cadence, status, code, at, batch, count }) => ({ id, channel, cadence, status, code, at, batch, count })) };
}
export function notificationPreferences(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'notification-urgency') {
        requireThat(a.owner, 'Current native owner required',403);
        requireThat(notificationTypes.includes(b.type) && typeof b.urgent === 'boolean','Choose a supported event and urgency');
        const previous = s.get('notificationUrgency:' + b.type)?.value;
        requireThat(b.version === (previous?.version ?? 0),'Urgency changed; reload',409);
        put(s,'notificationUrgency',b.type,{type:b.type,urgent:b.urgent,version:(previous?.version ?? 0)+1});
        audit(s,a,op,b.type,{urgent:b.urgent}); return get(s,'notificationUrgency',b.type);
    }
    if (op !== 'notification-preferences') return;
    const previous = notificationPreference(s,a);
    requireThat(b.version === previous.version,'Notification preferences changed; reload',409);
    requireThat(['in-app','email','slack','teams','push'].includes(b.channel) && ['immediate','daily'].includes(b.cadence),'Choose a notification channel and frequency');
    const timezone = text(b.timezone,'Time zone',80);
    try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(0); } catch { requireThat(false,'Use an IANA time zone'); }
    requireThat(time(b.quietStart) && time(b.quietEnd) && b.quietStart !== b.quietEnd && time(b.digestAt),'Choose distinct quiet-hour times and a digest time');
    requireThat(typeof b.quiet === 'boolean' && typeof b.weekends === 'boolean','Choose quiet hours and weekends');
    const next = {recipient:a.id, version:previous.version+1, channel:b.channel, cadence:b.cadence, timezone,
        quiet:b.quiet, quietStart:b.quietStart, quietEnd:b.quietEnd, weekends:b.weekends, digestAt:b.digestAt};
    put(s,'notificationPreference',previous.id,next);
    audit(s,a,op,previous.id,{version:next.version});
    return get(s,'notificationPreference',previous.id);
}

const formatters = new Map<string,Intl.DateTimeFormat>();
function local(now: number, timezone: string) {
    let formatter = formatters.get(timezone);
    if (!formatter) { formatter = new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}); formatters.set(timezone,formatter); }
    const p = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type,p.value]));
    return { date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}`, weekend:['Sat','Sun'].includes(p.weekday) };
}
function quietAt(p: Data, now: number) {
    if (!p.quiet) return false;
    const wall = local(now,p.timezone);
    return p.weekends && wall.weekend || (p.quietStart < p.quietEnd ? wall.time >= p.quietStart && wall.time < p.quietEnd : wall.time >= p.quietStart || wall.time < p.quietEnd);
}
/** Scan real instants, so skipped and repeated local hours never use a fixed UTC offset. */
export function notificationDue(at: string, p: Data, urgent: boolean): number {
    const start = Date.parse(at);
    if (urgent) return start;
    const born = local(start,p.timezone);
    if (p.cadence === 'immediate' && !quietAt(p,start)) return start;
    const minute = 60000;
    for (let next = Math.ceil(start/minute)*minute; next <= start+8*86400000; next += minute) {
        const wall = local(next,p.timezone);
        const digest = p.cadence !== 'daily' || (wall.date > born.date || wall.date === born.date && born.time < p.digestAt) && wall.time >= p.digestAt;
        if (digest && !quietAt(p,next)) return next;
    }
    throw new Error('Notification schedule unavailable');
}
