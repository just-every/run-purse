import { requireThat, text, type Data } from './types';

const optionalCode = (value: unknown) => value == null || value === '' || value === '*' ? undefined : text(value, 'Budget coding', 200);
/** Native form keys are namespaced by their form and header/line scope. */
export function budgetDimensionInput(input: Data, prior?: Data, forms?: Data[]) {
    const result: Data = {};
    for (const key of ['location', 'glAccount']) {
        const value = optionalCode(input[key] === undefined ? prior?.[key] : input[key]);
        if (value) result[key] = value;
    }
    const fields = input.budgetFields === undefined ? prior?.budgetFields : input.budgetFields;
    if (fields != null) {
        requireThat(fields && typeof fields === 'object' && !Array.isArray(fields), 'Choose native budget fields');
        const value: Data = { form: text(fields.form, 'Budget purchase form'), header: {}, line: {} };
        for (const scope of ['header', 'line']) {
            const selectors = fields[scope] ?? {};
            requireThat(selectors && typeof selectors === 'object' && !Array.isArray(selectors) && Object.keys(selectors).length <= 30, 'Use up to 30 budget field selectors');
            for (const key of Object.keys(selectors).sort()) {
                requireThat(/^[a-z][a-z0-9_]*$/.test(key), 'Use an existing native field key');
                value[scope][key] = text(selectors[key], 'Budget field value');
            }
        }
        requireThat(Object.keys(value.header).length + Object.keys(value.line).length > 0, 'Select a native budget field value');
        if (forms && JSON.stringify(value) !== JSON.stringify(prior?.budgetFields)) {
            const form = forms.find(form => form.id === value.form && form.active);
            requireThat(form, 'Choose an active native purchase form');
            for (const scope of ['header', 'line']) for (const [key, selected] of Object.entries(value[scope])) {
                const definition = form[scope + 'Fields'].find((field: Data) => field.id === key && field.active);
                requireThat(definition && (definition.type !== 'choice' || definition.options.includes(selected)), 'Budget field or value is inactive or unknown');
            }
        }
        result.budgetFields = value;
    }
    return result;
}
export function sameBudgetDimensions(a: Data, b: Data) {
    return JSON.stringify(budgetDimensionInput(a)) === JSON.stringify(budgetDimensionInput(b));
}
export function budgetCoding(request: Data, line: Data, allocation: Data = {}) {
    return { costCentre: allocation.costCentre ?? line.costCentre ?? request.costCentre, project: allocation.project ?? line.project,
        location: allocation.location ?? line.location ?? request.location, glAccount: allocation.glAccount ?? line.glAccount ?? request.glAccount,
        category: line.category, customFields: line.customFields ?? {}, headerFields: request.customFields ?? {}, intakeForm: request.intakeForm };
}
export function budgetScopeMatches(policy: Data, request: Data, code: Data) {
    if (policy.currency !== request.currency || policy.budgetPeriod && (request.needDate < policy.budgetPeriod.from || request.needDate > policy.budgetPeriod.through)) return false;
    for (const field of ['costCentre', 'project', 'category', 'location', 'glAccount']) {
        const selected = field === 'costCentre' ? policy.costCentre ?? policy.department : policy[field];
        if (selected && selected !== '*' && selected !== code[field]) return false;
    }
    const fields = policy.budgetFields;
    return !fields || fields.form === code.intakeForm && Object.entries(fields.header).every(([key, value]) => code.headerFields[key] === value)
        && Object.entries(fields.line).every(([key, value]) => code.customFields[key] === value);
}
function constraints(policy: Data) {
    const result: Data = {};
    for (const key of ['costCentre', 'project', 'category', 'location', 'glAccount']) {
        const value = key === 'costCentre' ? policy.costCentre ?? policy.department : policy[key];
        if (value && value !== '*') result[key] = value;
    }
    if (policy.budgetFields) {
        result.form = policy.budgetFields.form;
        for (const scope of ['header', 'line']) for (const [key, value] of Object.entries(policy.budgetFields[scope])) result[scope + ':' + key] = value;
    }
    return result;
}
/** Prefer the most-specific budget, retaining its already selected primary
 * authority tier. Equal or incomparable overlaps refuse rather than using UUID order. */
export function selectBudgetPolicy(candidates: Data[], primaryId?: string) {
    if (!candidates.length) return undefined;
    const narrowest = candidates.filter(candidate => {
        const own = constraints(candidate);
        return candidates.every(other => Object.entries(constraints(other)).every(([key, value]) => own[key] === value));
    });
    requireThat(narrowest.length > 0, 'Overlapping dated budget dimensions require an unambiguous policy', 409);
    const primary=narrowest.find(policy=>policy.id===primaryId);
    const limit = primary?.limitMinor ?? Math.min(...narrowest.map(policy => policy.limitMinor ?? Number.MAX_SAFE_INTEGER));
    const selected = narrowest.filter(policy => (policy.limitMinor ?? Number.MAX_SAFE_INTEGER) === limit);
    requireThat(selected.length === 1, 'Duplicate overlapping dated budgets require an unambiguous policy', 409);
    return selected[0];
}
export function budgetPositionDimensions(policy: Data) {
    return { department: policy.costCentre ?? '*', project: policy.project, category: policy.category,
        location: policy.location ?? '*', glAccount: policy.glAccount ?? '*', ...(policy.budgetFields ? { budgetFields: policy.budgetFields } : {}) };
}
