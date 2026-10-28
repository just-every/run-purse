import { date, requireThat, text, type Data } from './types';

/** Native list membership is versioned with the form; old snapshots keep their values. */
export function activeChoices(field: Data): string[] {
    return (field.options ?? []).filter((value: string) => !(field.inactiveOptions ?? []).includes(value));
}
export function customValue(field: Data, input: unknown) {
    const value = text(input, field.label);
    if (field.type === 'choice') requireThat(activeChoices(field).includes(value), field.label + ' has an inactive or unknown value');
    if (field.type === 'number') requireThat(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER, field.label + ' must be a finite decimal number');
    if (field.type === 'date') {
        try { date(value); } catch { requireThat(false, field.label + ' must be a valid calendar date'); }
    }
    if (field.type === 'boolean') requireThat(['Yes', 'No'].includes(value), field.label + ' must be Yes or No');
    return value;
}
/** Bills inherit the issued source, never current definitions or caller-supplied coding. */
export function invoiceCustomFields(order: Data, input: Data) {
    if (!order.intakeForm) {
        requireThat(input.customFields === undefined, 'Custom fields require an issued category form');
        return {};
    }
    requireThat(input.customFields === undefined || JSON.stringify(input.customFields) === JSON.stringify(order.customFields), 'Bill header fields must match the issued PO');
    return { intakeForm: order.intakeForm, intakeFormVersion: order.intakeFormVersion,
        intakeFormSnapshot: structuredClone(order.intakeFormSnapshot), customFields: structuredClone(order.customFields), sourceOrderRevision: order.revision };
}
