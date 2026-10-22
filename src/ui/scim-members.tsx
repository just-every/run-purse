import { Field, Form, Table, type D } from './shared';

/** Explicit native consent records an association; provider email never does. */
export function ScimMembers({ data, action }: {data: D; action: (body: D) => Promise<any>}) {
    return <section aria-label="Owner-confirmed identity links"><h4>Link an existing member</h4>
        <p>Confirm the exact issuer and external ID with your identity provider. The link activates on this member’s next matching OIDC sign-in. Linking or unlinking ends their current sessions. Existing purchasing history stays in place.</p>
        <Form label="Confirm member identity link" onSubmit={body => action({action:'link-member',operator:body.operator,externalId:body.externalId,consent:body.consent === 'on'})}>
            <Field name="operator" label="Existing native member" options={data.delegates.filter((d: D) => d.id !== data.config?.consentBy).map((d: D) => ({value:d.id,label:d.name + ' · ' + d.email}))}/>
            <Field name="externalId" label="Exact provider external ID"/>
            <p>Issuer: <span style={{overflowWrap:'anywhere'}}>{data.config?.issuer}</span></p>
            <label><input type="checkbox" name="consent" required/> I confirm this member owns this exact provider identity.</label>
        </Form>
        {data.links?.length > 0 && <Table heads={['Member','External ID','State','Action']}>{data.links.map((link: D) => <tr key={link.operator_id}><td>{link.email}</td><td style={{overflowWrap:'anywhere'}}>{link.external_id}</td><td>{link.revoked_at ? 'Unlinked' : link.activated ? 'Active' : 'Awaiting matching sign-in'}</td><td>{!link.revoked_at && <Form label="Unlink member identity" onSubmit={async () => action({action:'unlink-member',operator:link.operator_id})}><label><input type="checkbox" required/> End this provider link and its sessions</label></Form>}</td></tr>)}</Table>}
        {data.reassignments?.length > 0 && <section aria-label="Needs reassignment"><h4>Needs reassignment</h4><p>These approvals are held because the native owner is also the requester. Choose another scoped approver. Departed members cannot decide them.</p>{data.reassignments.map((request: D) => <Form key={request.id} label="Reassign held approval" onSubmit={body => action({action:'reassign-approval',request:request.id,operator:body.operator})}><p>{request.title} · revision {request.revision}</p><Field name="operator" label="New approval holder" options={data.delegates.map((d: D) => ({value:d.id,label:d.name + ' · ' + d.email}))}/></Form>)}</section>}
    </section>;
}
