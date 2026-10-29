import { Details, when, type D } from './shared';

export function ShipmentReferences({ entries }: { entries: D[] }) {
    const active = entries.filter(entry => !entries.some(next => next.correctionOf === entry.id));
    const reference = (entry: D) => <>{entry.erasure ? 'Shipment reference withdrawn by personal-data erasure' : <>{entry.carrier} · {entry.trackingNumber}</>} · Supplier-reported · Carrier status unknown · Approved revision {entry.revision} · {when(entry.at)}</>;
    return <section aria-label="Supplier shipment references"><h4>Supplier shipment references</h4>
        <p>These references do not confirm delivery or record receiving. Purchasing terms and receipt prompts are unchanged.</p>
        {active.length ? <ul className="ruled-list">{active.map(entry => <li key={entry.id}>{reference(entry)}</li>)}</ul> : <p>No supplier shipment references recorded.</p>}
        {entries.length > 0 && <Details label={`Shipment reference history (${entries.length})`}><ol>{entries.map(entry => <li key={entry.id}>{reference(entry)}{entry.correctionOf && <> · Corrects reference {entries.find(prior => prior.id === entry.correctionOf)?.version} · {entry.reason}</>} · Supplier response {entry.response.split(':').at(-1)}</li>)}</ol></Details>}
    </section>;
}
