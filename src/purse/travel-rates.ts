import { gsaBreakdownSource, gsaMealBreakdowns, gsaVerifiedOn } from './data/gsa-mie';
import { gsaRate } from './gsa-rates';
import { date, requireThat, type Data } from './types';

/** Published GSA data, retained with each draft/submitted revision. No network
 * failure substitutes a standard rate for an unknown destination or year. */
export function travelPerDiem(destination: Data, departure: unknown, returning: unknown) {
    const from = date(departure, 'Departure date'), through = date(returning, 'Return date');
    requireThat(from <= through, 'Return date must follow departure');
    const days = Math.round((Date.parse(through) - Date.parse(from)) / 86400000) + 1;
    requireThat(days <= 366, 'A trip must be at most 366 calendar days');
    const fiscalYear = (day: string) => Number(day.slice(0, 4)) + (Number(day.slice(5, 7)) >= 10 ? 1 : 0);
    const firstYear = fiscalYear(from), lastYear = fiscalYear(through);
    const unavailable = { available: false as const, days, reason: 'No unambiguous published destination rate is loaded for these dates; enter an explicit meals and incidentals estimate.' };
    const periods = [];
    for (let year = firstYear; year <= lastYear; year++) {
        const rate = gsaRate(destination, year);
        if (!rate) return unavailable;
        periods.push(rate);
    }
    const first = periods[0], dailyMinor = first.dailyMinor, boundaryMinor = dailyMinor * 3 / 4;
    // The form displays one daily rate. Do not misstate a trip with differing
    // fiscal-year rates; it requires a reviewed explicit estimate instead.
    if (periods.some(rate => rate.dailyMinor !== dailyMinor)) return unavailable;
    const amountMinor = days === 1 ? boundaryMinor : 2 * boundaryMinor + Math.max(0, days - 2) * dailyMinor;
    const [breakfastMinor, lunchMinor, dinnerMinor, incidentalsMinor] = gsaMealBreakdowns[dailyMinor];
    return { available: true as const, destination: first.destination, days, dailyMinor, boundaryMinor, amountMinor,
        breakfastMinor, lunchMinor, dinnerMinor, incidentalsMinor,
        firstFiscalYear: firstYear, lastFiscalYear: lastYear, effectiveFrom: first.source.effectiveFrom, effectiveThrough: periods.at(-1)!.source.effectiveThrough,
        source: first.source.url, breakdownSource: gsaBreakdownSource, verifiedOn: gsaVerifiedOn,
        standardConus: first.standardConus, matchBasis: first.matchBasis,
        ratePeriods: periods.map(rate => ({ fiscalYear: rate.fiscalYear, destination: rate.destination, dailyMinor: rate.dailyMinor,
            boundaryMinor: rate.dailyMinor * 3 / 4, effectiveFrom: rate.source.effectiveFrom, effectiveThrough: rate.source.effectiveThrough,
            source: rate.source.url, sha256: rate.source.sha256, matchBasis: rate.matchBasis, standardConus: rate.standardConus })),
        basis: 'GSA M&IE: 75% on the first and last calendar days; 100% on intervening days.' };
}
