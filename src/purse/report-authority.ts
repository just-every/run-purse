import { requirePermission } from './access';
import { visible } from './documents';
import { filtersFor } from './saved-reports';
import { spendReport } from './spend-report';
import { get, requireThat, type Actor, type Data, type State } from './types';

export async function reportMember(db: D1Database, state: State, id: string, version?: number): Promise<Actor> {
    const row = await db.prepare("SELECT id,email,version,role FROM oa_operators WHERE id=? AND status='active'").bind(id).first<Data>();
    requireThat(row && (version === undefined || row.version === version), 'Report member authority ended', 403);
    const a: Actor = { id: row.id, email: row.email, version: row.version, owner: row.role === 'owner', dev: false, session: '' };
    requirePermission(state, a, 'report.read');
    return a;
}
export function boundReport(state: State, a: Actor, binding: Data) {
    const definition = get(state, 'savedReport', binding.view);
    requireThat(definition.actor === binding.actor && definition.version === binding.view_version, 'Saved view changed; configure a new binding', 409);
    const data = visible(state, a).data;
    const filters = filtersFor(data, definition.filters);
    if (binding.department) {
        requireThat(!filters.department || filters.department === binding.department, 'Department differs from saved view', 403);
        filters.department = binding.department;
    }
    return { definition, report: spendReport(data, filtersFor(data, filters)) };
}
export const activeReportMember = "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')";
