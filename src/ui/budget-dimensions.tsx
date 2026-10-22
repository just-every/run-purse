import { useState } from 'react';
import { Field, type D } from './shared';

export function budgetDimensionForm(input: D) {
    const header: D = {}, line: D = {};
    for (const [name, value] of Object.entries(input)) {
        if (!value) continue;
        if (name.startsWith('budgetHeader:')) header[name.slice(13)] = value;
        if (name.startsWith('budgetLine:')) line[name.slice(11)] = value;
    }
    return { budgetFields: input.budgetForm && Object.keys(header).length + Object.keys(line).length
        ? { form: input.budgetForm, header, line } : null };
}
export function BudgetDimensionFields({ policy, data }: { policy?: D; data: D }) {
    const [formId, setFormId] = useState(policy?.budgetFields?.form ?? '');
    const form = data.intakeForm?.find((form: D) => form.id === formId);
    return <><Field label="Budget location (blank means all)" name="location" required={false} defaultValue={policy?.location ?? ''}/>
        <Field label="Budget GL account (blank means all)" name="glAccount" required={false} defaultValue={policy?.glAccount ?? ''}/>
        <label className="field">Budget custom field form<select aria-label="Budget custom field form" name="budgetForm" value={formId} onChange={event => setFormId(event.target.value)}><option value="">All forms</option>{(data.intakeForm ?? []).filter((form: D) => form.active || form.id === formId).map((form: D) => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
        {form && <div key={formId} className="field-wide">{['header', 'line'].map(scope => form[scope + 'Fields'].filter((field: D) => field.active).map((field: D) => <Field key={scope + field.id} label={'Budget ' + scope + ' · ' + field.label + ' (blank means all)'} name={(scope === 'header' ? 'budgetHeader:' : 'budgetLine:') + field.id} required={false} options={field.type === 'choice' ? field.options.map((value: string) => ({ value, label: value })) : undefined} defaultValue={policy?.budgetFields?.form === formId ? policy?.budgetFields?.[scope]?.[field.id] ?? '' : ''}/>))}</div>}
    </>;
}
