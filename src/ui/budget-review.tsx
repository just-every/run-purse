import { money, type D } from './shared';

/** Every mapped allocation shows a complete permitted position at review time. */
export function BudgetReview({data,request}:{data:D;request:D}) {
    const review=request.budgetReview;
    if(!review?.dated)return null;
    const positions=review.ids.map((id:string)=>(data.periodBudgets??[]).find((budget:D)=>budget.id===id));
    if(!review.complete||positions.some((position:D|undefined)=>!position))return <section aria-label="Current financial budget position"><h3>Current financial budget position</h3><p>Every allocation needs a permitted dated budget before a complete position can be shown.</p></section>;
    return <section aria-label="Current financial budget position"><h3>Current financial budget position</h3>
        {positions.map((budget:D)=><div key={budget.id}><p>{budget.name} · {budget.from} through {budget.through}</p>
            <p>Amount {money(budget.amountMinor,budget.currency)} · reserved {money(budget.reservedMinor,budget.currency)} · committed {money(budget.committedMinor,budget.currency)} · recorded actual {money(budget.actualMinor,budget.currency)} · available {money(budget.availableMinor,budget.currency)}.</p></div>)}
        <p>Recorded actual includes invoice, imported-deposit and approved travel report evidence. <a href="/app?tab=Reports">View financial budget sources</a></p>
    </section>;
}
