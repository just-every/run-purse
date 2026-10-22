import { gsaLocalities, gsaSources, type GsaLocality } from './data/gsa-mie';
import type { Data } from './types';

const stateNames = 'AL:Alabama|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'
    .split('|').map(value => value.split(':'));

function normalized(value: unknown) {
    return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function countyName(value: unknown) {
    return normalized(value).replace(/\s+(counties|county|parishes|parish)$/, '');
}
function cityNames(row: GsaLocality) {
    const names = [normalized(row[1]), ...row[1].split('/').map(normalized)];
    if (row[0] === 'DC') names.push('washington', 'washington dc');
    if (row[1] === 'Baltimore City') names.push('baltimore');
    if (row[1] === 'New York City') names.push('new york');
    return names;
}
function countyNames(row: GsaLocality) {
    // A partial county, independent city or installation definition is not a
    // whole-county match. Preserve its original boundary text in the result.
    if (/less|excluding|city|cities|AFB|NAWS|\(|,/i.test(row[2]) || (row[0] === 'PA' && row[1] === 'Hershey')) return [];
    return row[2].split('/').map(countyName);
}
function intersectsCounty(row: GsaLocality, county: string) {
    // Reject a conflicting standard selection or validate a known key city;
    // never assign an unknown city a partial-county rate through this function.
    return row[2].split('/').map(value => countyName(value.split(/\bless\b|\bexcluding\b/i)[0])).includes(county);
}
function dcBoundary(state: string, city: string, county: string) {
    // Verbatim scope is retained in the official DC row in each fiscal year.
    if (state === 'DC') return true;
    if (state === 'VA') return (!county && ['alexandria', 'falls church', 'fairfax'].includes(city)) || ['arlington', 'fairfax'].includes(county);
    return state === 'MD' && ['montgomery', 'prince georges'].includes(county);
}

/** Exact published key-city/county matches only. Unknown geography does not
 * establish standard-CONUS eligibility; the traveler must explicitly select it.
 * Qualified county boundaries require a recognized key city or an estimate. */
export function gsaRate(destination: Data, fiscalYear: number) {
    const source = gsaSources[fiscalYear];
    if (!source || normalized(destination.country) !== 'us') return;
    const state = stateNames.find(([code, name]) => normalized(code) === normalized(destination.state) || normalized(name) === normalized(destination.state))?.[0];
    if (!state) return;
    const city = normalized(destination.city), county = countyName(destination.county);
    const rows = gsaLocalities.filter(row => row[fiscalYear - 2025 + 3] != null);
    const inState = rows.filter(row => row[0] === state);
    const dc = rows.find(row => row[0] === 'DC');
    const dcMatch = dc && dcBoundary(state, city, county);
    const dcCity = state === 'VA' && ['alexandria', 'falls church', 'fairfax'].includes(city);
    const cities = inState.filter(row => cityNames(row).includes(city));
    const counties = county ? inState.filter(row => countyNames(row).includes(county)) : [];
    if (destination.standardConus === true) {
        if (cities.length || counties.length || dcMatch || dcCity || (county && inState.some(row => intersectsCounty(row, county)))) return;
        return { dailyMinor: source.standardMinor, destination: `Standard CONUS, ${state}, US`,
            state, fiscalYear, source, standardConus: true, matchBasis: 'traveler-selected-standard-conus' };
    }
    let matches = cities.length ? cities : counties;
    if (dcMatch) matches = [...matches, dc];
    matches = [...new Set(matches)];
    if (matches.length !== 1) return;
    const row = matches[0];
    // Conflicting destination fields cannot silently select a different county.
    if (cities.length && county && !intersectsCounty(row, county) && !countyNames(row).includes(county)) return;
    const dailyMinor = Number(row[fiscalYear - 2025 + 3]) * 100;
    return { dailyMinor, destination: `${row[1]}, ${row[2]}, ${row[0]}, US`, state, fiscalYear, source,
        standardConus: false, matchBasis: cities.length ? 'published-key-city' : dcMatch ? 'published-dc-boundary' : 'published-whole-county',
        locality: { state: row[0], destination: row[1], countyOrLocation: row[2] } };
}
