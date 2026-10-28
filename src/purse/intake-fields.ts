import { customValue } from './custom-fields';
import { containsProtectedInput } from './protected-context-fields.mjs';
import { get, requireThat, text, type Data, type State } from './types';

export const purchaseTypes = ['goods', 'software', 'services', 'contractors', 'equipment'];
export function shown(field: Data, answers: Data) { return !field.when || answers[field.when.field] === field.when.equals; }
export function fieldDefinitions(input: unknown) {
    requireThat(Array.isArray(input) && input.length <= 30, 'Use up to 30 fields');
    const fields: Data[] = input.map((f: Data) => {
        const id = text(f.id, 'Field key', 60); requireThat(!containsProtectedInput({field:id}) && !containsProtectedInput({field:f.label}), 'Protected tax, bank and credential fields use their dedicated owner door'); requireThat(/^[a-z][a-z0-9_]*$/.test(id), 'Use lowercase field keys');
        requireThat(['text', 'choice', 'number', 'date', 'boolean'].includes(f.type), 'Choose text, choice, number, date or yes or no');
        requireThat(f.type !== 'choice' || Array.isArray(f.options) && Array.isArray(f.inactiveOptions ?? []), 'Supply choice lists');
        const options = f.type === 'choice' ? (f.options ?? []).map((v: unknown) => text(v, 'Choice', 200)) : [];
        requireThat(f.type !== 'choice' || options.length > 0 && options.length <= 50 && new Set(options).size === options.length, 'Supply unique choices');
        const inactiveOptions = f.type === 'choice' ? (f.inactiveOptions ?? []).map((v: unknown) => text(v, 'Inactive choice', 200)) : [];
        requireThat(inactiveOptions.length <= 50 && new Set(inactiveOptions).size === inactiveOptions.length && inactiveOptions.every((value: string) => options.includes(value)), 'Inactive choices must belong to this list');
        return { id, label: text(f.label, 'Field label', 200), type: f.type, options, inactiveOptions, required: f.required === true, active: f.active !== false,
            ...(f.when ? { when: { field: text(f.when.field, 'Conditional field'), equals: text(f.when.equals, 'Conditional answer') } } : {}) };
    });
    requireThat(new Set(fields.map(f => f.id)).size === fields.length, 'Field keys must be unique');
    fields.forEach((f, i) => { if (f.when) requireThat(fields.slice(0, i).some(before => before.id === f.when.field && before.type === 'choice' && before.options.includes(f.when.equals)), 'Conditions must reference an earlier choice'); });
    return fields;
}
export function fieldValues(fields: Data[], input: Data = {}, required = false) {
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Field values must be an object');
    const values: Data = {};
    for (const field of fields) {
        if (!field.active || !shown(field, input)) continue;
        const value = input[field.id];
        if (value == null || value === '') { requireThat(!required || !field.required, field.label + ' is required'); continue; }
        values[field.id] = customValue(field, value);
    }
    return values;
}
/** Shares are integer basis points. The first allocation receives remainder cents. */
export function splitValues(s: State, input: unknown, totalMinor?: number) {
    if (input == null || Array.isArray(input) && !input.length) return [];
    requireThat(Array.isArray(input) && input.length <= 20, 'Use up to 20 split allocations');
    const business = get(s, 'business', 'main');
    const values = input.map((x: Data) => {
        requireThat(business.costCentres.includes(x.costCentre) && business.projects.includes(x.project), 'Split coding is inactive or unknown');
        requireThat(Number.isInteger(x.basisPoints) && x.basisPoints > 0 && x.basisPoints <= 10000, 'Split share must be positive basis points');
        if(x.location!==undefined)requireThat(business.locations.includes(x.location), 'Split location is inactive or unknown');
        return { costCentre: x.costCentre, project: x.project, basisPoints: x.basisPoints, amountMinor: 0,
            ...(x.location!==undefined?{location:x.location}:{}), ...(x.glAccount!==undefined?{glAccount:text(x.glAccount,'Split GL account',200)}:{}) };
    });
    requireThat(values.reduce((sum, x) => sum + x.basisPoints, 0) === 10000, 'Split shares must total 100%');
    if (totalMinor !== undefined) {
        values.forEach(x => { x.amountMinor = Number(BigInt(totalMinor) * BigInt(x.basisPoints) / 10000n); });
        values[0].amountMinor += totalMinor - values.reduce((sum, x) => sum + x.amountMinor, 0);
    }
    return values;
}
export function applyIntakeFields(s: State, r: Data, input: Data, required = false) {
    if (!input.intakeForm) return;
    const form = get(s, 'intakeForm', input.intakeForm);
    requireThat(form.active, 'This purchase form is inactive', 409);
    r.intakeForm = form.id; r.intakeFormVersion = form.version;
    r.intakeFormSnapshot = structuredClone(form);
    r.answers = fieldValues(form.questions, input.answers, required);
    r.customFields = fieldValues(form.headerFields, input.customFields, required);
    r.lines.forEach((line: Data, index: number) => { line.customFields = fieldValues(form.lineFields, input.lines[index]?.customFields, required); });
    if (required) {
        const files = [...s.values()].filter(row => row.kind === 'attachment' && row.value.kind === 'request' && row.value.record === r.id && !row.value.erasure).map(row => row.value.name.toLowerCase());
        for (const name of form.requiredFiles) requireThat(files.some(file => file.includes(name.toLowerCase())), 'Attach required file: ' + name, 409);
    }
}

export function intakeDefaults(s: State, input: Data) {
    if (!input.intakeForm) return input;
    const form = get(s, 'intakeForm', input.intakeForm), defaults = form.defaults;
    return { currency: defaults.currency, location: defaults.location, costCentre: defaults.costCentre, ...input,
        lines: (input.lines ?? []).map((line: Data) => ({category: defaults.category, project: defaults.project, allocations: defaults.allocations, ...line})) };
}
