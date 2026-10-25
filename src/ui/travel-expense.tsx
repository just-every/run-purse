import { useState } from 'react';
import { travelExportColumns } from '../purse/travel-export-format.mjs';
import { Form, Field, Details, type D } from './shared';

const providerLabels: Record<string, string> = { coaster: 'Coaster', expensify: 'Expensify', navan: 'Navan', ramp: 'Ramp', brex: 'Brex' };
export const providerLabel = (provider?: string) => providerLabels[provider || 'coaster'] || provider;
export function TravelExpenseForm({ current, timedRelease, mutate }: { current: D; timedRelease: boolean; mutate: (op: string, input: D) => Promise<any> }) {
    const [provider, setProvider] = useState('coaster'), csv = provider !== 'coaster';
    return <Details label="Return final expense report"><Form label="Reconcile final travel expense report" tooltip="Reconcile expenses" initial={{ id: current.id, revision: current.revision }} onSubmit={async input => {
        const file = input.reportFile as File, bytes = new Uint8Array(await file.arrayBuffer());
        if (!bytes.length || bytes.length > 1000000) throw new Error('Upload a report original of up to 1 MB');
        let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
        return mutate('travel-expense-return', { id: current.id, revision: current.revision, provider, originalBase64: btoa(raw), sourceName: file.name, sourceUrl: input.sourceUrl, reason: input.reason,
            confirmed: input.confirmed === 'on', closed: input.closed === 'on', ...(csv ? { columns: Object.fromEntries(Object.keys(travelExportColumns[provider]).map(key => [key, input['column_' + key]])),
                sourceReview: { sourceAccount: input.sourceAccount, reportId: input.reportId, title: input.reportTitle, approvedBy: input.approvedBy, approvedAt: input.approvedAt, status: input.sourceStatus, totalAmount: input.totalAmount, final: input.closed === 'on', approvalReviewed: input.approvalReviewed === 'on' } } : {}) });
    }}><label className="field">Expense report source<select aria-label="Expense report source" name="provider" value={provider} onChange={event => setProvider(event.target.value)}>{['coaster', 'expensify', 'navan', 'ramp', 'brex'].map(value => <option value={value} key={value}>{providerLabel(value)}</option>)}</select></label>
        {csv ? <><p>Export one complete, independently approved trip report as UTF-8 CSV, with a header and one row per expense. Select the exact source columns below; defaults are starting selections for configurable exports. Navan and Brex column labels vary with your export template. Keep the original file unchanged.</p>
            <p>Each row must include the traveler’s exact email, this approval reference, currency, distinct expense ID, date in YYYY-MM-DD form, description and unsigned decimal amount. Use one currency and at most two decimal places. Enable these fields in your provider’s export settings or template. Ramp supports a custom accounting dimension for the Purse Reference. Exports missing the exact reference cannot close the trip.</p>
            <p>Review the final report in the source system. Enter its account, report identity, total, status, final approver email and approval date. The approver must differ from the traveler. These are your reviewed source declarations; Purse does not verify provider identity or fetch source URLs.</p>
            <label className="field">Original expense CSV<input aria-label="Original expense CSV" type="file" name="reportFile" accept="text/csv,.csv" required/></label>
            <Field label="Source workspace or account" name="sourceAccount"/><Field label="Source report ID" name="reportId"/><Field label="Source report title" name="reportTitle"/>
            <Field label="Reviewed report total" name="totalAmount"/><Field label="Independent final approver email" name="approvedBy" type="email"/><Field label="Final source approval date" name="approvedAt" type="date"/>
            <Field label="Source report status" name="sourceStatus" options={['approved', 'reimbursed', 'paid'].map(value => ({ value, label: value }))}/>
            <fieldset className="field-wide" style={{ minWidth: 0 }} key={provider}><legend>Exact CSV column headers</legend>{Object.entries(travelExportColumns[provider]).map(([key, header]) => <Field key={key} label={'CSV ' + key + ' column'} name={'column_' + key} defaultValue={header}/>)}</fieldset>
            <label className="field"><input type="checkbox" name="approvalReviewed" required/>I reviewed the independent final approval for this complete source report.</label>
        </> : <><p>Download the report JSON from the approved Coaster report’s native API. Every frozen item must carry this exact approval reference.</p><label className="field">Native Coaster report JSON<input aria-label="Native Coaster report JSON" type="file" name="reportFile" accept="application/json,.json" required/></label><Field label="Coaster report source URL" name="sourceUrl" type="url"/></>}
        <Field label="Expense return reason" name="reason"/><label className="field"><input type="checkbox" name="confirmed" required/>I reviewed the original report and its source.</label><label className="field"><input type="checkbox" name="closed" required/>{timedRelease ? 'This is the trip’s final expense report. Record actual without releasing funds again.' : 'This is the trip’s final expense report. Release the unspent reservation.'}</label>
    </Form></Details>;
}
