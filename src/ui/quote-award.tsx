import { Form, Field, Details, money, type D } from './shared';
export function QuoteAward({ data, current, actor, mutate }: { data: D; current: D; actor: D; mutate: (op: string, b: D) => Promise<any> }) {
    const awards = data.quoteAward.filter((a: D) => a.request === current.id);
    const quotes = data.quote.filter((q: D) => q.request === current.id && q.revision === current.revision && q.supplier === current.supplier && q.currency === current.currency);
    return <section><h3>Recorded quote awards</h3><p className="quiet">A buyer records the first offer and winning quote before submission. Purchasing approval remains separate. Line prices must match this draft; freight and tax do not count as savings.</p>
        {awards.map((a: D) => <p key={a.id}>Revision {a.revision} · {a.reason} · {a.at}</p>)}
        {actor.roles.includes('buyer') && current.status === 'draft' && !awards.some((a: D) => a.revision === current.revision) && <Details label="Record quote award"><Form label="Record award" initial={{ request: current.id, revision: current.revision }} onSubmit={async b => {
            const first = quotes.find((q: D) => q.id === b.firstQuote), winner = quotes.find((q: D) => q.id === b.awardedQuote);
            const lines = current.lines.map((l: D, i: number) => ({ requestLine: l.id, firstLine: b['first-'+i], awardedLine: b['won-'+i] }));
            return mutate('quote-award', { request: b.request, revision: b.revision, firstQuote: first?.id, awardedQuote: winner?.id, reason: b.reason, lines });
        }}>
            <Field label="First offer" name="firstQuote" options={quotes.map((q: D) => ({ value: q.id, label: q.sequence + ' · ' + q.source }))}/>
            <Field label="Winning quote" name="awardedQuote" options={quotes.map((q: D) => ({ value: q.id, label: q.sequence + ' · ' + q.source }))}/>
            {current.lines.map((l: D, i: number) => <div className="field field-wide" key={l.id}><strong>{l.description} · {l.quantity} · {money(l.unitMinor, current.currency)} each</strong>
                <Field label={`First-offer line ${i+1}`} name={'first-'+i} options={quotes.flatMap((q: D) => q.lines.map((x: D) => ({ value: x.id, label: q.source + ' · ' + x.description + ' · ' + money(x.unitMinor, q.currency) })))}/>
                <Field label={`Winning line ${i+1}`} name={'won-'+i} options={quotes.flatMap((q: D) => q.lines.map((x: D) => ({ value: x.id, label: q.source + ' · ' + x.description + ' · ' + money(x.unitMinor, q.currency) })))}/>
            </div>)}<Field label="Award reason" name="reason"/>
        </Form></Details>}
    </section>;
}
