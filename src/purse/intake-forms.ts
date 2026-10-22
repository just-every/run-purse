import { unrestrictedPermission } from './access-records';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { fieldDefinitions, purchaseTypes, splitValues } from './intake-fields';

export function intakeForms(s: State, a: Actor, op: string, b: Data) {
    if (op !== 'intake-form') return;
    requireThat(unrestrictedPermission(s, a, 'intake.admin'), 'Unrestricted intake administration required', 403);
    requireThat(b.consent === true, 'Confirm publishing this requester form');
    const old = b.id ? get(s, 'intakeForm', b.id) : undefined;
    if (old) requireThat(b.version === old.version, 'Form changed; reload', 409);
    requireThat(purchaseTypes.includes(b.purchaseType), 'Choose a purchase type');
    const defaults = b.defaults ?? {}, business = get(s, 'business', 'main');
    for (const [key, list] of [['location', 'locations'], ['costCentre', 'costCentres'], ['project', 'projects'], ['currency', 'currencies']])
        if (defaults[key]) requireThat(business[list].includes(defaults[key]), 'Use configured default ' + key);
    requireThat(Array.isArray(b.requiredFiles ?? []) && (b.requiredFiles ?? []).length <= 10, 'Use up to 10 required file names');
    const form = { id: old?.id ?? uid(), version: (old?.version ?? 0) + 1, active: b.active !== false,
        name: text(b.name, 'Form name', 200), purchaseType: b.purchaseType,
        questions: fieldDefinitions(b.questions ?? []), headerFields: fieldDefinitions(b.headerFields ?? []), lineFields: fieldDefinitions(b.lineFields ?? []),
        requiredFiles: (b.requiredFiles ?? []).map((x: unknown) => text(x, 'Required filename contains', 100)),
        defaults: { location: defaults.location || '', costCentre: defaults.costCentre || '', project: defaults.project || '', currency: defaults.currency || '', category: text(defaults.category || b.purchaseType, 'Default category'), allocations: splitValues(s, defaults.allocations) },
        updatedBy: a.id, updatedAt: new Date().toISOString() };
    put(s, 'intakeForm', form.id, form); audit(s, a, op, form.id, { version: form.version, consent: true }); return form;
}
export function visibleIntakeForms(s: State, a: Actor) {
    return { intakeForm: all(s, 'intakeForm'), mayConfigureIntake: unrestrictedPermission(s, a, 'intake.admin') };
}
