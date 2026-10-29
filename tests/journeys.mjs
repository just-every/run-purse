// A single process shares the native ingress build across the selected journeys.
import {readdir} from 'node:fs/promises';
const selected=process.env.PURSE_JOURNEYS?.split(',')??(await readdir(new URL('.',import.meta.url))).filter(file=>file.endsWith('-journey.test.mjs')).sort();
for(const file of selected)await import('./'+file);
