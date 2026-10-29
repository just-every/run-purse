import {readFile} from 'node:fs/promises';
// Synthetic CSL transport bytes; never a substitute in application code.
export const ofacUrl = 'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.csv';
export const ofacDate = 'Sun, 18 Oct 2026 12:00:00 GMT';
export const ofacCsv = await readFile(new URL('./fixtures/ofac.csv',import.meta.url),'utf8');
