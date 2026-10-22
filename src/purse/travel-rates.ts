import { date, requireThat, type Data } from './types';

/** Published GSA data, retained with each draft/submitted revision. No network
 * failure substitutes a standard rate for an unknown destination or year. */
export function travelPerDiem(destination: Data, departure: unknown, returning: unknown) {
    const from = date(departure, 'Departure date'), through = date(returning, 'Return date');
    requireThat(from <= through, 'Return date must follow departure');
    const days = Math.round((Date.parse(through) - Date.parse(from)) / 86400000) + 1;
    requireThat(days <= 366, 'A trip must be at most 366 calendar days');
    const country = String(destination.country ?? '').toUpperCase(), state = String(destination.state ?? '').toUpperCase();
    const city = String(destination.city ?? '').trim().toLowerCase();
    const firstYear = Number(from.slice(0, 4)) + (Number(from.slice(5, 7)) >= 10 ? 1 : 0);
    const lastYear = Number(through.slice(0, 4)) + (Number(through.slice(5, 7)) >= 10 ? 1 : 0);
    if (country !== 'US' || state !== 'TX' || city !== 'austin' || firstYear < 2025 || lastYear > 2027) return { available: false, days, reason: 'No published destination rate is loaded for these dates; enter an explicit meals and incidentals estimate.' };
    const dailyMinor = 8000, boundaryMinor = 6000;
    // A one-day trip has one travel day, never two first/last allowances.
    const amountMinor = days === 1 ? boundaryMinor : 2 * boundaryMinor + Math.max(0, days - 2) * dailyMinor;
    return { available: true, destination: 'Austin, Travis County, Texas, US', days, dailyMinor, boundaryMinor, amountMinor,
        breakfastMinor: 2000, lunchMinor: 2200, dinnerMinor: 3300, incidentalsMinor: 500,
        firstFiscalYear: firstYear, lastFiscalYear: lastYear, effectiveFrom: '2024-10-01', effectiveThrough: '2027-09-30',
        source: `https://www.gsa.gov/travel/plan-book/per-diem-rates/per-diem-rates-results?action=perdiems_report&fiscal_year=${firstYear}&state=TX`,
        verifiedOn: '2026-10-23', basis: 'GSA M&IE: 75% on the first and last calendar days; 100% on intervening days.' };
}
