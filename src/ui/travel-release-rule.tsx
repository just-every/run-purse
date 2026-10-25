import { Details, Field, Form, type D } from './shared';

export function TravelReleaseRule({ data, mutate }: { data: D; mutate: (op: string, input: D) => Promise<any> }) {
    const rule = data.travelReleaseRule?.[0];
    return <section aria-label="Business travel release rule"><h3>Travel reservation release</h3>
        <p>Timed release is {rule?.status ?? 'off'}{rule ? ` · rule v${rule.version}` : ''}. {rule?.status === 'armed' ? `${rule.days} calendar days after return in ${rule.timezone}, for each approved trip revision unless it has a trip override.` : 'Reservations remain until final expense closure or explicit release consent.'}</p>
        {rule?.pauseReason && <p>{rule.pauseReason}</p>}
        <Details label="Configure business travel release rule"><Form key={rule?.version ?? 0} label="Save travel release rule" onSubmit={input => mutate('travel-release-rule', {
            version: rule?.version ?? 0, enabled: input.enabled === 'enabled', days: Number(input.days), timezone: input.timezone,
            consent: input.action === 'consent', confirmed: input.confirmed === 'on', acceptLateActual: input.acceptLateActual === 'on', reason: input.reason
        })}>
            <Field label="Business timed release" name="enabled" options={[{ value: 'off', label: 'Off — wait for final expense closure' }, { value: 'enabled', label: 'Use a business release rule' }]} defaultValue={rule && rule.status !== 'off' ? 'enabled' : 'off'}/>
            <Field label="Calendar days after return" name="days" type="number" required={false} defaultValue={rule?.days ?? ''}/>
            <Field label="Release timezone" name="timezone" required={false} defaultValue={rule?.timezone ?? data.business?.[0]?.timezone ?? ''}/>
            <Field label="Release rule action" name="action" options={[{ value: 'configure', label: 'Save configuration and pause releases' }, { value: 'consent', label: 'Consent and apply to approved trips' }]} defaultValue="configure"/>
            <Field label="Release rule reason" name="reason"/>
            <label className="field"><input type="checkbox" name="confirmed"/>I consent to this business rule for every approved trip revision, except an explicit trip override.</label>
            <label className="field"><input type="checkbox" name="acceptLateActual"/>A late final expense report can consume budget after these funds have been freed, even if they have since been used.</label>
            <p>Consent requires both confirmations. Choose a timezone when the business has none. Rule, native owner or business timezone changes pause unreleased trips until explicit renewed consent. A trip override requires its own renewed consent. Timed release frees the reservation once; it leaves the trip awaiting its final expense report.</p>
        </Form></Details>
    </section>;
}
