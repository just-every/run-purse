import { Form, Field, Table, type D } from './shared';

export const commaList = (value: string) => value.split(',').map(s => s.trim()).filter(Boolean);
export const accessInput = (b: D) => Object.fromEntries(['departments', 'locations', 'entities', 'roles'].map(d => [d, commaList(b['access_' + d] ?? '')]));
export function CatalogueAccessFields({ access = {} }: { access?: D }) {
    return <fieldset className="wide"><legend>Catalogue access · blank means unrestricted</legend>
        <p className="quiet">Members must match each restricted dimension. Any listed value within a dimension matches. Bundles also require access to every item.</p>
        {['departments', 'locations', 'entities', 'roles'].map(d => <Field key={d} label={'Allowed ' + d + ' (comma separated)'} name={'access_' + d} required={false} defaultValue={access[d]?.join(', ')}/>) }
    </fieldset>;
}
export function CatalogueGrants({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    return <section className="panel"><h3>Member catalogue access</h3>
        <p className="quiet">Only the owner assigns these catalog memberships. Roles use the member's current purchasing capabilities. Missing scope does not match a restricted item. Entity labels control catalog access; legal entity accounting is separate.</p>
        <Table heads={['Member', 'Departments', 'Locations', 'Entities']}>{(data.catalogueGrant ?? []).map((g: D) => <tr key={g.id}><td className="email-cell">{g.email}</td><td>{g.departments.join(', ') || 'None'}</td><td>{g.locations.join(', ') || 'None'}</td><td>{g.entities.join(', ') || 'None'}</td></tr>)}</Table>
        <Form label="Save catalogue membership" onSubmit={b => mutate('catalogue-grant', { email: b.email, departments: commaList(b.departments), locations: commaList(b.locations), entities: commaList(b.entities) })}>
            <Field label="Catalogue member" name="email" options={data.member.filter((m: D) => m.active).map((m: D) => ({ value: m.email, label: m.name + ' · ' + m.email }))}/>
            {['departments', 'locations', 'entities'].map(d => <Field key={d} label={'Member ' + d + ' (comma separated)'} name={d} required={false}/>)}
        </Form>
    </section>;
}
