import { receiptDay } from './receipt-routing';
import { all, date, requireThat, type Data, type State } from './types';

/** Effective dates are calendar facts; the recording instant never changes. */
export function receivedDates(s: State, order: Data, input: unknown, now = Date.now()) {
    const recordedAt = new Date(now).toISOString(), recordedDate = receiptDay(s, now);
    const effectiveDate = input === undefined || input === '' ? recordedDate : date(input, 'Effective received date');
    // An imported issue date is not established by native custody. Earlier history stays unqualified.
    const issue = order.issuedAt ?? order.adoptedAt;
    requireThat(issue, 'Native issuance or adoption date required', 409);
    const issuedDate = receiptDay(s, Date.parse(issue));
    requireThat(effectiveDate >= issuedDate && effectiveDate <= recordedDate, 'Effective received date must be on or after issuance and no later than today', 409);
    return { effectiveDate, recordedDate, at: recordedAt, receivedTimezone: all(s, 'business')[0]?.timezone || 'America/New_York' };
}
