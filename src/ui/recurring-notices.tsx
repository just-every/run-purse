import { useState } from 'react';
import { Details, Field, Form, when, type D } from './shared';

type Mutate = (op: string, body: D) => Promise<any>;
const deliveryLabels: Record<string, string> = {
    accepted: 'Mail provider accepted this notice. Mailbox delivery is not confirmed.',
    uncertain: 'The send outcome is uncertain. Investigate before taking further action; this attempt is not retried.',
    rejected: 'The mail provider rejected this notice.',
    rate_limited: 'The mail provider rate limited this attempt.',
    unavailable: 'The mail sender was unavailable.',
    claimed: 'The send attempt was recorded; its outcome is pending.',
};
const agreementName = (scenario: D, id: string) => scenario.snapshot.sources.find((source: D) => source.kind === 'agreement' && source.id === id)?.value.name ?? id;

export function RecurringDiscoveryNotices({ data }: { data: D }) {
    const notices: D[] = data.recurringDiscoveryNotice ?? [];
    if (!notices.length) return null;
    return <Details label="Scheduled recurring review notices">{notices.map((notice: D, index: number) => <article key={notice.id ?? notice.run + ':' + index} className="record">
        <h3>Recurring spend needs review</h3><p>{when(notice.at)} · {notice.role === 'finance' ? 'Finance review' : notice.role === 'budget' ? 'Budget owner review' : 'Agreement owner review'}</p>
        <p>Scheduled discovery recorded a proposal for review. No approval, supplier send or cancellation was made.</p>{notice.proposalSummary&&<><p>{notice.proposalSummary.kind}: {notice.proposalSummary.reason}</p><p>Operational risk: {notice.proposalSummary.operationalRisk}</p></>}
        <ul>{notice.noticeDeadlines.map((deadline: D) => <li key={deadline.agreement}>{deadline.name ?? deadline.agreement} · notice deadline {deadline.date}</li>)}</ul>
        <p className="quiet" style={{overflowWrap: 'anywhere'}}>Discovery run {notice.run} · proposal {notice.proposal}</p>
    </article>)}</Details>;
}

export function RecurringNotices({ scenario, draft, data, owner, mutate }: { scenario: D; draft: D; data: D; owner: boolean; mutate: Mutate }) {
    const [attempt, setAttempt] = useState<D>();
    const recorded: D[] = (data.recurringNoticeSend ?? []).filter((row: D) => row.scenario === scenario.id && row.hash === scenario.hash && row.draftHash === draft.draftHash);
    const attempts = attempt && !recorded.some(row => row.id === attempt.id) ? [...recorded, attempt] : recorded;
    const dispositionAgreements: D[] = (data.agreement ?? []).filter((agreement: D) => !agreement.imported && scenario.choices.agreementIds.includes(agreement.id));
    return <section aria-label="Recurring brief and notice"><h4>Nonbinding {draft.kind.replace(/-/g, ' ')}</h4>
        <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{draft.text}</pre>
        <p>Verify the notice method your agreement requires. A recorded send does not establish that a notice is legally effective.</p>
        <Details label="Send approved brief or notice">
            <p className="quiet" style={{overflowWrap: 'anywhere'}}>Exact approved draft: {draft.draftHash}</p>
            {attempts.map((send: D, index: number) => <article key={send.id ?? index} aria-label="Recorded notice send"><p>{send.recipient} · {when(send.at)}</p>
                {send.status !== 'suppressed' && <p>{deliveryLabels[send.status] ?? 'Send status: ' + send.status}</p>}
                <p>Notice attempt recorded against the agreement deadlines. Notice effectiveness is unverified.</p>
                <ul>{send.noticeDeadlines.map((deadline: D) => <li key={deadline.agreement}>{deadline.name ?? agreementName(scenario, deadline.agreement)} · notice deadline {deadline.date}</li>)}</ul>
                <p>Mailbox delivery is unknown. Email opens are not tracked.</p>
            </article>)}
            {scenario.maySend && !attempts.length && <Form label="Send exact approved notice" onSubmit={async input => {
                const response = await fetch('/api/purse/order-send/recurring-notice', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: scenario.id, hash: scenario.hash, draftHash: draft.draftHash, recipient: input.recipient, reason: input.reason, consent: input.consent === 'yes'})});
                const result:D = await response.json();
                if (!response.ok) throw new Error(result.error || 'Notice send failed');
                setAttempt(result.event ?? result);
            }}>
                <Field label="Notice recipient" name="recipient" type="email"/><Field label="Notice send reason" name="reason"/>
                <label><input type="checkbox" name="consent" value="yes" required/> I authorize sending this exact approved draft to the recipient above.</label>
            </Form>}
        </Details>
        {owner && scenario.choices.kind === 'cancel' && attempts.some(send=>['accepted','suppressed'].includes(send.status)) && <Details label="Record agreement disposition">
            <p>Record the approved agreement decision separately after checking the required notice method. Manage recurring series and approved PO cancellation in the linked order controls.</p>
            {dispositionAgreements.map((agreement: D) => <Form key={agreement.id + ':' + agreement.version} label={'Record disposition for ' + agreement.name} onSubmit={input => mutate('agreement-disposition', {agreement: agreement.id, version: agreement.version, scenario: scenario.id, hash: scenario.hash, disposition: input.disposition, confirmed: input.confirmed === 'yes', reason: input.reason})}>
                <Field label={'Agreement decision for ' + agreement.name} name="disposition" options={[{value: 'non-renewal', label: 'Non-renewal'}, {value: 'cancellation', label: 'Cancellation'}]}/>
                <Field label="Agreement disposition reason" name="reason"/>
                <label><input type="checkbox" name="confirmed" value="yes" required/> I approve recording this agreement decision after verifying its notice requirements.</label>
            </Form>)}
            <ul>{scenario.choices.assumptions.filter((row: D) => row.order).map((row: D) => <li key={row.order}><a href={'/app?receipt=' + encodeURIComponent(row.order)}>Open recurring series and approved PO cancellation controls</a></li>)}</ul>
        </Details>}
    </section>;
}
