// Portable definitions contain neither cached report data nor executable authority.
export function validateSavedReports(all, check) {
    const dimensions = ['department', 'project', 'location', 'supplier', 'category', 'glAccount'];
    const dimension = value => dimensions.includes(value) || /^(header|line):[^:]+:[^:]+$/.test(value);
    for (const view of all('savedReport')) {
        check(Object.keys(view).length === 5 && ['id', 'actor', 'name', 'filters', 'version'].every(key => Object.hasOwn(view, key)), 'saved_report_shape');
        check(typeof view.actor === 'string' && view.actor.length > 0 && typeof view.name === 'string' && view.name.length > 0 && view.name.length <= 100 && Number.isSafeInteger(view.version) && view.version > 0, 'saved_report_definition');
        check(view.filters && typeof view.filters === 'object' && !Array.isArray(view.filters), 'saved_report_filters');
        for (const [key, value] of Object.entries(view.filters)) {
            check(['from', 'through', 'groupBy'].includes(key) || dimension(key), 'saved_report_filter');
            check(typeof value === 'string' && value.length > 0 && value.length <= 2000, 'saved_report_filter');
            if (key === 'groupBy') check(dimension(value), 'saved_report_group');
            if (['from', 'through'].includes(key)) check(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'saved_report_date');
        }
        check(!view.filters.from || !view.filters.through || view.filters.from <= view.filters.through, 'saved_report_period');
        check(all('audit').some(event => event.action === 'saved-report-save' && event.record === view.id && event.actor === view.actor && event.version === view.version), 'saved_report_audit');
    }
}
