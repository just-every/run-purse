import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { accessGrants, requirePermission } from './access';
import { visible } from './documents';
import { spendReport } from './spend-report';
import { reportExport } from './report-exports';
import { actor, load, readFence, save } from './store';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

// A definition is a private preference, never a snapshot or an access grant.
function filtersFor(data: Data, input: Data) {
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Report filters required');
    const choices = spendReport(data), dimensions = Object.keys(choices.choices);
    requireThat(Object.keys(input).every(key => ['from', 'through', 'groupBy', ...dimensions].includes(key)), 'Unsupported report filter');
    const filters: Data = {};
    for (const [key, value] of Object.entries(input)) {
        requireThat(typeof value === 'string' && value.length <= 2000, 'Report filters must be text');
        if (value === '') continue;
        if (dimensions.includes(key)) requireThat(choices.choices[key].some((choice: Data) => String(choice.value) === value), 'Saved filter is unavailable in your current scope', 403);
        filters[key] = value;
    }
    spendReport(data, filters);
    return filters;
}
function ownDefinition(state: State, a: Actor, id: string) {
    requirePermission(state, a, 'report.read');
    const definition = get(state, 'savedReport', id);
    requireThat(definition.actor === a.id, 'Saved report belongs to another member', 403);
    return definition;
}
export const savedReportsApi = new Hono<{ Bindings: Bindings }>();
savedReportsApi.get('/api/purse/saved-reports', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const definitions = savedReportDefinitions(state, a);
    await readFence(c.env.DB, a, revision);
    return c.json({ definitions, maySave: accessGrants(state, a).some(grant => grant.role !== 'auditor' && grant.permissions.includes('report.read')) });
});
savedReportsApi.post('/api/purse/saved-reports', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB), before = structuredClone(state);
    requirePermission(state, a, 'report.read');
    requireThat(accessGrants(state, a).some(grant => grant.role !== 'auditor' && grant.permissions.includes('report.read')), 'Read-only auditors cannot change saved reports', 403);
    const body = await c.req.json();
    requireThat(body && Object.keys(body).every(key => ['id', 'version', 'name', 'filters', 'remove'].includes(key)), 'Unsupported saved report field');
    const prior = body.id ? ownDefinition(state, a, text(body.id, 'Saved report id', 100)) : undefined;
    if (prior) requireThat(body.version === prior.version, 'Saved report changed; reopen it before saving', 409);
    const id = prior?.id ?? uid();
    if (body.remove === true) {
        requireThat(prior, 'Saved report required', 404);
        state.delete('savedReport:' + id);
        audit(state, a, 'saved-report-remove', id);
        await save(c.env.DB, a, before, state, revision);
        return c.json({ removed: id });
    }
    requireThat(prior || all(state, 'savedReport').filter(row => row.actor === a.id).length < 100, 'Remove an unused saved report first', 409);
    const definition = { id, actor: a.id, name: text(body.name, 'View name', 100), filters: filtersFor(visible(state, a).data, body.filters), version: (prior?.version ?? 0) + 1 };
    put(state, 'savedReport', id, definition);
    audit(state, a, 'saved-report-save', id, { version: definition.version });
    await save(c.env.DB, a, before, state, revision);
    return c.json(definition);
});
savedReportsApi.get('/api/purse/saved-reports/:id/:format', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const definition = ownDefinition(state, a, c.req.param('id'));
    const data = visible(state, a).data, filters = filtersFor(data, definition.filters), report = spendReport(data, filters);
    const format = c.req.param('format');
    requireThat(['view', 'csv', 'xlsx'].includes(format), 'Unknown report format', 404);
    // Every download uses the same fresh native scope and final revision fence as report reads.
    const result = format === 'view' ? c.json({ definition, report }) : reportExport(report, format);
    await readFence(c.env.DB, a, revision);
    return result;
});

export function savedReportDefinitions(state: State, a: Actor) {
    requirePermission(state, a, 'report.read');
    const data = visible(state, a).data;
    const definitions = all(state, 'savedReport').filter(row => row.actor === a.id).flatMap(row => {
        try { filtersFor(data, row.filters); return [row]; } catch { return []; }
    });
    return definitions;
}
