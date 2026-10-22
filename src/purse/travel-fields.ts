import { moneyInput } from './money';
import { travelPerDiem } from './travel-rates';
import { date, minor, requireThat, text, type Data } from './types';

export const travelCostCategories = ['airfare', 'lodging', 'groundTransport', 'mealsIncidentals', 'registration', 'other'] as const;
export const travelCostLabels: Record<typeof travelCostCategories[number], string> = {
    airfare: 'Airfare', lodging: 'Lodging', groundTransport: 'Ground transport', mealsIncidentals: 'Meals and incidentals', registration: 'Registration fees', other: 'Other',
};
export function travelFields(input: Data) {
    const raw = input.travel;
    requireThat(raw && typeof raw === 'object' && !Array.isArray(raw), 'Trip details required');
    const travelerEmail = text(raw.travelerEmail, 'Traveler email', 254).toLowerCase();
    requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(travelerEmail), 'Use a traveler email');
    const traveler = text(raw.traveler, 'Traveler', 200), purpose = text(raw.purpose, 'Trip purpose'), origin = text(raw.origin, 'Trip origin', 300);
    requireThat(Array.isArray(raw.destinations) && raw.destinations.length >= 1 && raw.destinations.length <= 20, 'Provide 1–20 destinations');
    const destinations = raw.destinations.map((destination: Data) => {
        requireThat(destination.standardConus === undefined || typeof destination.standardConus === 'boolean', 'Choose whether the published standard CONUS rate applies');
        return { city: text(destination.city, 'Destination city', 200), state: destination.state ? text(destination.state, 'Destination state', 100).toUpperCase() : '', country: text(destination.country, 'Destination country', 2).toUpperCase(),
            ...(destination.county ? { county: text(destination.county, 'Destination county', 200) } : {}), ...(destination.standardConus ? { standardConus: true } : {}) };
    });
    requireThat(destinations.every((destination: Data) => /^[A-Z]{2}$/.test(destination.country)), 'Use two-letter destination country codes');
    const departureDate = date(raw.departureDate, 'Departure date'), returnDate = date(raw.returnDate, 'Return date');
    requireThat(departureDate <= returnDate, 'Return date must follow departure');
    const perDiem = travelPerDiem(destinations[0], departureDate, returnDate), costs: Data = {};
    const supplied = raw.costs ?? {};
    for (const category of travelCostCategories) {
        const hasEstimate = Object.hasOwn(supplied, category + 'Amount') || Object.hasOwn(supplied, category + 'Minor');
        if (category === 'mealsIncidentals' && !hasEstimate) {
            requireThat(perDiem.available && destinations.length === 1, 'Enter a meals and incidentals estimate when a single destination GSA default is unavailable');
            costs[category + 'Minor'] = perDiem.amountMinor;
        } else costs[category + 'Minor'] = moneyInput(supplied, category + 'Amount', category + 'Minor', travelCostLabels[category], { fallback: 0 });
    }
    const totalMinor = minor(Object.values(costs).reduce((sum: number, value: any) => sum + value, 0), 'Trip estimate');
    requireThat(totalMinor > 0, 'Trip estimate must be positive');
    return { traveler, travelerEmail, purpose, origin, destinations, departureDate, returnDate, costs, perDiem,
        mealsBasis: Object.hasOwn(supplied, 'mealsIncidentalsAmount') || Object.hasOwn(supplied, 'mealsIncidentalsMinor') ? 'explicit-estimate' : 'gsa-default',
        international: destinations.some((destination: Data) => destination.country !== 'US'), totalMinor };
}
