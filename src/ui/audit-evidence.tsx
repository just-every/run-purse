import { Table, money, type D } from './shared';
import { ScimAudit } from './scim-audit';
function Revision({ value, label }: { value: D; label: string }) {
    return <section><h4>{label} · revision {value.revision}</h4><p>{value.title} · {value.supplierSnapshot?.name} · {value.location} · {value.costCentre}</p>
        <Table heads={['Line', 'Quantity', 'Unit price', 'Amount']} figures={['Quantity', 'Unit price', 'Amount']}>{value.lines.map((line: D) => <tr key={line.id}><td>{line.description}</td><td className="figure">{line.quantity}</td><td className="figure">{money(line.unitMinor, value.currency)}</td><td className="figure">{money(line.totalMinor, value.currency)}</td></tr>)}</Table><p>Total {money(value.totalMinor, value.currency)} · {value.terms}</p>
    </section>;
}
export function AuditEvidence({ event }: { event: D }) {
    const evidence = event.evidence, approval = evidence.approval, policy = approval?.policySnapshot;
    return <div>
        <ScimAudit event={event}/>
        {approval && <section><h4>Policy at decision</h4>{policy ? <><p>{policy.name}</p><Table heads={['Approver', 'Scope', 'Authority limit', 'Budget']} figures={['Authority limit', 'Budget']}><tr><td className="email-cell">{policy.approver}</td><td>{policy.category} · {policy.project}</td><td className="figure">{money(policy.limitMinor, policy.currency)}</td><td className="figure">{money(policy.budgetMinor, policy.currency)}</td></tr></Table></> : <p>{approval.snapshotBasis}</p>}<p>Recorded policy version: <span style={{overflowWrap:'anywhere'}}>{approval.policyVersion}</span></p>{approval.delegation && <p>Delegated decision · {approval.delegation}</p>}</section>}
        {evidence.before && <Revision value={evidence.before} label="Before"/>}
        {evidence.revision && <Revision value={evidence.revision} label={evidence.before ? 'After' : 'Request'}/>}
        {event.roles && <p>Capabilities: {event.roles.join(', ')} · {event.active ? 'Active' : 'Inactive'}</p>}
        <p className="quiet">The CSV export includes the complete recorded event and retained evidence.</p>
    </div>;
}
