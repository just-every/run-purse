import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { accrualReport } from './accrual-report';
import { accrualExport } from './accrual-exports';
import { actor, load, readFence } from './store';
import { requireThat } from './types';

export const accrualApi = new Hono<{ Bindings: Bindings }>();
accrualApi.get('/api/purse/accrual-report/:format', async c => {
    const a = await actor(c.req.raw,c.env), { state, revision } = await load(c.env.DB);
    const input = c.req.query(), format = c.req.param('format');
    requireThat(['view','csv','xlsx','xero'].includes(format), 'Unknown accrual format', 404);
    const report = accrualReport(state,a,input);
    const result = format === 'view' ? c.json(report) : accrualExport(report,format,input);
    await readFence(c.env.DB,a,revision);
    return result;
});
