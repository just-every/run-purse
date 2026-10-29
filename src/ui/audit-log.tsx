import './agent-record-controls.css';
import { AuditEvidence } from './audit-evidence';
import { useEffect, useState } from 'react';
import { call, Field, Form, Table, when, type D } from './shared';
const actorName = (event: D) => event.actorLabel || event.email || (event.actor === 'scim-service' ? 'SCIM provisioner' : '');
export function AuditLog({actor}:{actor:D}) {
    const [filters, setFilters] = useState<D>({}), [events, setEvents] = useState<D[]>([]), [error, setError] = useState(''), [selected, setSelected] = useState('');
    const query = new URLSearchParams(filters).toString();
    useEffect(() => { let current = true; call('audit?' + query).then(result => { if (current) { setEvents(result.events); setError(''); } }).catch(e => { if (current) setError(e.message); }); return () => { current = false; }; }, [query]);
    const selectedEvent = events.find(e => e.id === selected);
    return <><h2 className="page-title">Audit history</h2><p>Recorded actions and retained purchasing evidence. Dates are inclusive UTC calendar days. Future provider sends and payments appear when those capabilities exist.</p>
        <Form label="Filter audit history" onSubmit={async b => setFilters(b)}><Field label="Subject ID or PO number" name="subject" required={false}/><Field label="Exact action" name="action" required={false}/><Field label="From date (UTC)" name="from" type="date" required={false}/><Field label="Through date (UTC)" name="through" type="date" required={false}/></Form>
        {error && <p role="alert">{error}</p>}
        {actor.permissions.includes('audit.export')&&<p><a className="btn-secondary" href={'/api/purse/audit.csv?' + query}>Export filtered audit CSV</a></p>}
        <Table heads={['When', 'Actor', 'Action', 'Record', 'Reason', 'Evidence']}>{events.map(e => <tr key={e.id}><td>{when(e.at)}</td><td className="email-cell">{actorName(e)}</td><td>{e.action}</td><td>{e.record}</td><td>{e.reason ?? ''}</td><td><button onClick={() => setSelected(e.id)}>Recorded detail</button></td></tr>)}</Table>
        {selectedEvent && <section className="panel"><h3>Recorded detail · {selectedEvent.action}</h3><p>{actorName(selectedEvent)} · {when(selectedEvent.at)}</p><AuditEvidence event={selectedEvent}/></section>}
    </>;
}
