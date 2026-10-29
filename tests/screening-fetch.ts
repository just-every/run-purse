// Loaded only by the browser harness in vite dev, never by a production build.
// The sole non-synthetic name/id is already asserted by supplierScreeningJourney.
import csv from './fixtures/ofac.csv?raw';

// Fail any accidental live request as well: a journey must pass with this host
// blocked even if another supplier-save path bypasses the injected transport.
const liveFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'data.trade.gov') throw new Error('Live OFAC network blocked by test harness');
    return liveFetch(input, init);
};

export const fetchScreeningSource: typeof fetch = async () => new Response(csv, {
    headers: { 'last-modified': 'Sun, 18 Oct 2026 12:00:00 GMT' },
});
