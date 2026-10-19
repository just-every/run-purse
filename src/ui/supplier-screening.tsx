import { Chip, Field, Form, when, type D } from './shared';

export function SupplierScreening({ supplier, owner, mutate }: { supplier: D; owner: boolean; mutate: (op: string, input: D) => Promise<any> }) {
    const screenings = supplier.screenings ?? [], latest = screenings.at(-1);
    return <section className="panel"><h3>OFAC screening</h3>
        {!latest ? <p>No retained screening. Screen this supplier before activating it.</p> : <>
            <p><Chip>{latest.status.replaceAll('_', ' ')}</Chip> · {when(latest.at)}</p>
            {latest.status === 'pending_review' && <p role="status">Activation is held pending compliance review. Only the owner can clear a possible match with a reason.</p>}
            {latest.matches.map((match: D) => <p key={match.id}>SDN {match.id}: <strong>{match.name}</strong> · {match.program} · matched {match.basis.join(' and ')}{match.names.length > 0 && <>: {match.names.join('; ')}</>}{match.addresses.length > 0 && <> · {match.addresses.join('; ')}</>}</p>)}
            <details><summary>Screening history and list versions ({screenings.length})</summary>{[...screenings].reverse().map((screen: D) => <div key={screen.id}><p>{screen.name} · {screen.address || 'No address supplied'} · {screen.status.replaceAll('_', ' ')} · {when(screen.at)}</p><ul>{screen.sources.map((source: D) => <li key={source.file}><a href={source.url}>{source.file}</a> · source {when(source.sourceDate)}<br/><small style={{ overflowWrap: 'anywhere' }}>SHA-256 {source.sha256}</small></li>)}</ul>{screen.review && <p>Review: {screen.review.decision} · {screen.review.reason} · {when(screen.review.at)}</p>}</div>)}</details>
            {owner && latest.status === 'pending_review' && <Form key={latest.id} label="Record compliance review" initial={{ id: supplier.id, screening: latest.id }} onSubmit={b => mutate('review-screening', b)}><Field label="Compliance decision" name="decision" options={[{ value: 'clear', label: 'False positive — clear' }, { value: 'confirmed', label: 'Confirmed match — block' }]}/><Field label="Compliance review reason" name="reason"/></Form>}
        </>}
        <Form label="Screen supplier again" initial={{ id: supplier.id }} onSubmit={b => mutate('screen-supplier', b)}><p>Fetch the current public SDN list and retain a new result.</p></Form>
    </section>;
}
