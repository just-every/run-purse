import type { D } from './shared';

export function TravelReferences({ references = [] }: { references?: D[] }) {
    if (!references.length) return null;
    return <section className="panel" aria-label="Your travel booking references"><h2>Your travel booking references</h2>
        {references.map(reference => <p key={reference.approvalReference}><strong>{reference.approvalReference}</strong> · revision {reference.revision} · {reference.status}</p>)}
        <p>Use your approved reference in your booking tool and Coaster expense items’ <code>purse_reference</code> field.</p>
    </section>;
}
