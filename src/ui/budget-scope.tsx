import type { D } from './shared';

/** A budget's coding is visible with its position; private purchase rows are not. */
export function BudgetScope({budget,data}:{budget:D;data:D}) {
    const codes=[budget.department,budget.project,budget.category,budget.location,budget.glAccount && budget.glAccount!=='*' && 'GL '+budget.glAccount].filter(code=>code && code!=='*');
    const form=data.intakeForm?.find((form:D)=>form.id===budget.budgetFields?.form);
    for(const scope of ['header','line'])for(const [key,value]of Object.entries(budget.budgetFields?.[scope]??{})) {
        const field=form?.[scope+'Fields']?.find((field:D)=>field.id===key);
        codes.push((field?.label??key)+': '+value);
    }
    return codes.length ? <span>{codes.join(' · ')}</span> : null;
}
