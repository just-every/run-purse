import { Details, Field, Form, money, when, type D } from './shared';

export function TravelRelease({ data, current, owner, mutate }: { data: D; current: D; owner: boolean; mutate: (op: string, input: D) => Promise<any> }) {
    const policy = (data.travelReleasePolicy ?? []).find((row: D) => row.request === current.id), released = (data.travelRelease ?? []).find((row: D) => row.request === current.id && row.revision === current.revision);
    return <section aria-label="Travel reservation release"><h4>Reservation release</h4>
        {released ? <p>{money(released.amountMinor, released.currency)} reservation released on {when(released.at, released.timezone)} under the return-date policy. {current.travel.closedAt ? 'The final expense report is now recorded.' : 'The trip remains approved and awaits its final expense report.'}</p>
            : policy?.status === 'armed' && policy.revision === current.revision ? <p>Timed release is enabled for revision {policy.revision}: {policy.days} calendar days after return, on or after {policy.dueDate} in {policy.timezone}. {policy.source === 'rule' ? `Business release rule v${policy.ruleVersion} applies. ` : 'A trip override applies. '}The scheduled check releases funds once; it does not close the expense report.</p>
            : <p>Timed release is {policy?.status === 'paused' ? 'paused' : 'off'}. The reservation stays until final expense closure{policy?.pauseReason ? `: ${policy.pauseReason}` : '.'}</p>}
        {owner && !current.travel.closedAt && current.status === 'approved' && !released && <Details label="Configure timed reservation release"><Form key={current.revision + ':' + (policy?.version ?? 0)} label="Save travel release policy" tooltip="Trip release" onSubmit={input => mutate('travel-release-policy', { id: current.id, revision: current.revision, version: policy?.version ?? 0, enabled: input.enabled === 'enabled', days: Number(input.days), timezone: input.timezone, confirmed: input.confirmed === 'on', acceptLateActual: input.acceptLateActual === 'on', reason: input.reason })}>
            <Field label="Timed release" name="enabled" options={[{ value: 'off', label: 'Off — wait for final expense closure' }, { value: 'enabled', label: 'Enable for this approved revision' }]} defaultValue={policy?.status === 'armed' && policy.revision === current.revision ? 'enabled' : 'off'}/>
            <Field label="Calendar days after return" name="days" type="number" required={false} defaultValue={policy?.days ?? ''}/>
            <Field label="Release timezone" name="timezone" required={false} defaultValue={policy?.timezone ?? data.business?.[0]?.timezone ?? ''}/>
            <Field label="Release policy reason" name="reason"/>
            <label className="field"><input type="checkbox" name="confirmed"/>I confirm timed release for this exact approved trip revision.</label>
            <label className="field"><input type="checkbox" name="acceptLateActual"/>A late final expense report can consume budget after these funds have been freed, even if they have since been used.</label>
            <p>Enabling requires both confirmations. Days follow the business calendar. This overrides the business rule for this revision. Amendments or a change of release rule, native owner or business timezone require renewed consent. Choose a timezone when the business has none. This releases the reservation only; the trip remains approved awaiting its expense report.</p>
        </Form></Details>}
    </section>;
}
