import { Table, money, type D } from './shared';

const categories: Record<string,string> = { airfareMinor: 'Airfare', lodgingMinor: 'Lodging', groundTransportMinor: 'Ground transport', mealsIncidentalsMinor: 'Meals and incidentals', registrationMinor: 'Registration fees', otherMinor: 'Other' };
export function TravelReferences({ references = [] }: { references?: D[] }) {
    if (!references.length) return null;
    return <section className="panel" aria-label="Your travel booking references"><h2>Your travel booking references</h2>
        {references.map(reference => <section key={reference.approvalReference} aria-label="Approved booking terms"><p><strong>{reference.approvalReference}</strong> · revision {reference.revision} · {reference.status}</p>
            <p>{reference.destinations.map((destination:D) => [destination.city,destination.state,destination.country].filter(Boolean).join(', ')).join(' → ')}</p>
            <p>Departure {reference.departureDate} · return {reference.returnDate}</p>
            <Table heads={['Cost category','Approved cap']} figures={['Approved cap']} stack={false}>{Object.entries(reference.costs).map(([category,value])=><tr key={category}><td>{categories[category]}</td><td className="figure">{money(Number(value),reference.currency)}</td></tr>)}</Table>
        </section>)}
        <p>Use your approved reference in your booking tool and expense report’s <code>purse_reference</code> field.</p>
    </section>;
}
