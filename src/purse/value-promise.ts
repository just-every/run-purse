import { date, minor, requireThat, type Data } from './types';

/** A promise is purchasing input: only a new request revision can change it. */
export function normalizeValuePromise(input: unknown, currency: string, needDate: string): Data | null {
    if (input === undefined || input === null) return null;
    requireThat(typeof input === 'object' && !Array.isArray(input), 'Value promise must be an object');
    const value = input as Data;
    if (value.kind === 'seats') {
        requireThat(Number.isSafeInteger(value.seats) && value.seats > 0 && value.seats <= 1000000, 'Promised seats must be a positive integer');
        return { kind: 'seats', seats: value.seats };
    }
    if (value.kind === 'need-date') {
        const promised = date(value.needDate ?? needDate, 'Promised need date');
        requireThat(promised === needDate, 'Promised need date must match the request need date');
        return { kind: 'need-date', needDate: promised };
    }
    requireThat(value.kind === 'quoted-saving', 'Choose seats, need-date or quoted-saving');
    requireThat(value.currency === undefined || value.currency === currency, 'Promised saving must use the request currency');
    return { kind: 'quoted-saving', amountMinor: minor(value.amountMinor, 'Promised saving'), currency };
}
