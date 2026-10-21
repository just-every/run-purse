import { useState } from 'react';
import { builtinPermissions, permissions } from '../purse/access-permissions';
import { Field, Form, Table, when, type D } from './shared';
import { dollarText, limitInput, limitSummary, memberGrants, permissionLabels, roleLabels, scopeLabels, scopeSummary } from './access-ui';
import { ZeroBuyerLimits } from './access-zero-limits';

type Mutate = (operation: string, input: D) => Promise<any>;
type Role = { id: string; name: string; permissions: readonly string[]; scope?: D; limits?: D; active?: boolean; custom?: boolean };
type EditorProps = { data: D; roles: Role[]; mutate: Mutate; saved: (message: string) => void };
function ScopeFields({ prefix, choices, value, change }: { prefix: string; choices: D; value: D; change: (scope: D) => void }) {
    return <fieldset className="wide" style={{ minWidth: 0 }}><legend>{prefix} scope</legend>
        <p className="quiet">Unrestricted dimensions allow all their values. Select a restriction to choose the permitted values. Every applicable restriction must match.</p>
        {Object.keys(scopeLabels).map(dimension => {
            const restricted = Object.hasOwn(value, dimension), label = scopeLabels[dimension as keyof typeof scopeLabels];
            return <div key={dimension}>
                <label><input type="checkbox" aria-label={'Restrict ' + prefix.toLowerCase() + ' ' + label} checked={restricted} disabled={!restricted && !choices[dimension].length} onChange={e => {
                    const next = { ...value }; if (e.target.checked) next[dimension] = []; else delete next[dimension]; change(next);
                }}/> Restrict {prefix.toLowerCase()} {label}</label>
                {!restricted && <p className="quiet">All {label} (unrestricted)</p>}
                {restricted && <label className="field">{prefix} {label}<select aria-label={prefix + ' ' + label} multiple required value={value[dimension]} size={Math.max(2, Math.min(4, choices[dimension].length))} onChange={e => change({ ...value, [dimension]: [...e.target.selectedOptions].map(option => option.value) })}>
                    {choices[dimension].map((option: string) => <option key={option} value={option}>{dimension === 'entities' && option === 'main' ? 'Main business' : option}</option>)}
                </select></label>}
            </div>;
        })}
    </fieldset>;
}
function choices(data: D) { const business = data.business[0] ?? {}; return { departments: business.costCentres ?? [], locations: business.locations ?? [], projects: business.projects ?? [], entities: ['main'] }; }
function LimitFields({ prefix, initial = {} }: { prefix: string; initial?: D }) {
    return <>
        <Field label={prefix + ' dollar increase limit'} name={prefix + 'absoluteMinor'} defaultValue={dollarText(initial.absoluteMinor)} required={false}/>
        <Field label={prefix + ' price increase percent'} name={prefix + 'percent'} defaultValue={initial.percent ?? ''} required={false}/>
        <Field label={prefix + ' quantity increase percent'} name={prefix + 'quantityPercent'} defaultValue={initial.quantityPercent ?? ''} required={false}/>
        <p className="quiet wide">{prefix === 'Person' ? 'Blank fields use the corresponding role default.' : 'A blank dollar or percentage field omits that price cap. With neither price cap configured, no price increase is allowed. A blank quantity field allows no quantity increase.'} Zero is explicit. When both price caps apply, both must be met and the lower governs. Decreases remain allowed.</p>
    </>;
}
function GrantEditor({ member, data, roles, mutate, saved }: EditorProps & { member: D }) {
    const grants = memberGrants(member), [target, setTarget] = useState('new'), [role, setRole] = useState('');
    const [scope, setScope] = useState<D>({}), [departmentRead, setDepartmentRead] = useState(false), [override, setOverride] = useState(false);
    const selected = target === 'new' ? undefined : grants[Number(target)], supportsLimits = roles.find(item => item.id === role)?.permissions.includes('po.convert');
    function choose(value: string) {
        const grant = value === 'new' ? undefined : grants[Number(value)];
        setTarget(value); setRole(grant?.role ?? ''); setScope(grant?.scope ?? {}); setDepartmentRead(grant?.departmentRead === true); setOverride(Boolean(grant?.limits));
    }
    return <>
        <label className="field">Grant to replace<select aria-label="Grant to replace" value={target} onChange={e => choose(e.target.value)}><option value="new">Add a role grant</option>{grants.map((grant, index) => <option key={index} value={index}>{roles.find(item => item.id === grant.role)?.name ?? 'Unavailable role'} · {scopeSummary(grant.scope)}</option>)}</select></label>
        <Form key={member.email + ':' + target} label="Save role grant" onSubmit={async input => {
            if (!role) throw new Error('Choose a role to grant.');
            const grant = { role, scope, ...(role === 'requester' ? { departmentRead: departmentRead && Boolean(scope.departments?.length) } : {}), ...(supportsLimits && override ? { limits: limitInput(input, 'Person') } : {}) };
            const next = target === 'new' ? [...grants, grant] : grants.map((current, index) => index === Number(target) ? grant : current);
            await mutate('member', { email: member.email, name: member.name, active: member.active, grants: next });
            if (target === 'new') setTarget(String(grants.length)); saved('Role grant saved. Other grants were retained; the change is recorded in audit history.');
        }}>
            <label className="field">Grant role<select aria-label="Grant role" required value={role} onChange={e => setRole(e.target.value)}><option value="">Choose…</option>{roles.filter(item => item.id !== 'owner' && item.active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <ScopeFields prefix="Grant" choices={choices(data)} value={scope} change={setScope}/>
            {role === 'requester' && <label className="wide"><input type="checkbox" checked={departmentRead && Boolean(scope.departments?.length)} disabled={!scope.departments?.length} onChange={e => setDepartmentRead(e.target.checked)}/> Include department purchases</label>}
            {role === 'requester' && <p className="quiet wide">Requesters otherwise see their own purchases. Department purchases require an explicit department restriction and do not grant editing of other people's requests.</p>}
            {supportsLimits && <><label className="wide"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}/> Use per-person buyer limits</label>{override && <LimitFields key={role + ':' + target} prefix="Person" initial={selected?.limits}/>}</>}
        </Form>
    </>;
}
function MemberGrants({ data, roles, mutate, saved }: EditorProps) {
    const [email, setEmail] = useState(''), member = (data.member ?? []).find((item: D) => item.email === email);
    return <section aria-label="Assign member roles"><h4>Assign member roles</h4>
        <p>Choose one grant to replace or add another. The member's remaining grants and active status are retained. Native owner authority is managed separately.</p>
        <label className="field">Grant member<select aria-label="Grant member" value={email} onChange={e => setEmail(e.target.value)}><option value="">Choose…</option>{(data.member ?? []).map((item: D) => <option key={item.email} value={item.email}>{item.name} · {item.email}</option>)}</select></label>
        {member && <GrantEditor key={member.email} member={member} data={data} roles={roles} mutate={mutate} saved={saved}/>}
    </section>;
}
function RoleLimits({ data, roles, mutate, saved }: EditorProps) {
    const [role, setRole] = useState('buyer'), configured = (data.buyerRoleLimit ?? []).find((row: D) => row.role === role && row.entity === 'main');
    return <section aria-label="Buyer role limits"><h4>Buyer role limits</h4><p>These defaults apply to conversion grants for the main business. A person's explicit fields override the corresponding role defaults.</p>
        <label className="field">Buyer limit role<select aria-label="Buyer limit role" value={role} onChange={e => setRole(e.target.value)}>{roles.filter(item => item.id !== 'owner' && item.active !== false && item.permissions.includes('po.convert')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Form key={role + ':' + JSON.stringify(configured?.limits)} label="Save buyer role limits" onSubmit={async input => { await mutate('buyer-role-limit', { role, entity: 'main', limits: limitInput(input, 'Role') }); saved('Buyer role limits saved and recorded in audit history.'); }}>
            <LimitFields prefix="Role" initial={configured?.limits ?? roles.find(item => item.id === role)?.limits}/>
        </Form>
    </section>;
}
function CustomRoles({ data, roles, owner, mutate, saved }: EditorProps & { owner: boolean }) {
    const [id, setId] = useState(''), [selectedPermissions, setPermissions] = useState<string[]>([]), [scope, setScope] = useState<D>({});
    const current = roles.find(role => role.id === id && role.custom);
    function choose(value: string) { const role = roles.find(item => item.id === value && item.custom); setId(value); setPermissions([...(role?.permissions ?? [])]); setScope(role?.scope ?? {}); }
    return <section aria-label="Custom role designer"><h4>Custom roles</h4><p>Choose explicit permissions. A role's restrictions apply in addition to each member grant's restrictions. Only the native owner assigns roles or raises buyer limits. Administrators can set eligible buyer limits to zero.</p>
        <label className="field">Custom role to edit<select aria-label="Custom role to edit" value={id} onChange={e => choose(e.target.value)}><option value="">New custom role</option>{roles.filter(role => role.custom && (owner || role.active !== false)).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <Form key={id} label="Save custom role" onSubmit={async input => {
            if (!selectedPermissions.length) throw new Error('Choose at least one role permission.');
            await mutate('access-role', { ...(id ? { id } : {}), name: input.name, permissions: selectedPermissions, scope, ...(owner ? { active: input.active === 'yes' } : {}) });
            saved('Custom role saved and recorded in audit history. Member assignments are unchanged.');
        }}>
            <Field label="Custom role name" name="name" defaultValue={current?.name}/>
            <fieldset className="wide" style={{ minWidth: 0 }}><legend>Role permissions</legend>{permissions.map(permission => <label key={permission} style={{ display: 'block' }}><input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={e => setPermissions(e.target.checked ? [...selectedPermissions, permission] : selectedPermissions.filter(item => item !== permission))}/> {permissionLabels[permission]}</label>)}</fieldset>
            <ScopeFields prefix="Role" choices={choices(data)} value={scope} change={setScope}/>
            {owner && <label className="wide"><input key={id} type="checkbox" name="active" value="yes" defaultChecked={current?.active !== false}/> Custom role active</label>}
        </Form>
    </section>;
}
export function AccessSettings({ data, actor, mutate }: { data: D; actor: D; mutate: Mutate }) {
    const owner = (actor.roles ?? []).includes('owner'), manager = owner || (actor.permissions ?? []).includes('access.manage'), [notice, setNotice] = useState('');
    if (!manager) return null;
    const roles: Role[] = [...Object.entries(builtinPermissions).map(([id, permissions]) => ({ id, name: roleLabels[id], permissions })), ...(data.accessRole ?? []).map((role: D) => ({ ...role, custom: true }))];
    const name = (id: string) => roles.find(role => role.id === id)?.name ?? 'Unavailable role', currency = data.business[0]?.currencies[0] ?? 'USD';
    const defaults = (role: Role) => (data.buyerRoleLimit ?? []).find((row: D) => row.role === role.id && row.entity === 'main')?.limits ?? role.limits;
    const rows = (data.member ?? []).flatMap((member: D) => memberGrants(member).map((grant, index) => ({ member, grant, index })));
    const history = (data.audit ?? []).filter((event: D) => ['member', 'access-role', 'buyer-role-limit'].includes(event.action)).slice().sort((left: D, right: D) => right.at.localeCompare(left.at)).slice(0, 20);
    const grantHistory = (value: D | null | undefined) => value === undefined ? 'Snapshot not recorded' : value === null ? 'No previous membership' : (value.active === false ? 'Inactive membership; ' : '') + memberGrants(value).map(grant => name(grant.role) + ' · ' + scopeSummary(grant.scope) + (grant.limits ? ' · ' + limitSummary(grant.limits, currency) : '') + (grant.departmentRead ? ' · Department purchases included' : '')).join('; ') || 'No role grants';
    return <section className="panel" aria-label="Access and buyer limits"><h3>Access and buyer limits</h3>
        <p>Grants combine a role with permitted departments, locations, projects and entities. Every role, grant, revocation and limit change is recorded in audit history.</p>
        {notice && <p role="status">{notice}</p>}
        <h4>Current member grants</h4><Table heads={['Member', 'Role', 'Scope', 'Buyer limits', 'Status', ...(owner ? [''] : [])]}>
            {rows.map(({ member, grant, index }: { member: D; grant: D; index: number }) => {
                const role = roles.find(item => item.id === grant.role), limit = { quantityPercent: 0, ...(role ? defaults(role) : {}), ...grant.limits };
                return <tr key={member.email + ':' + index}><td className="email-cell">{member.name}<br/>{member.email}</td><td>{name(grant.role)}</td><td>{scopeSummary(grant.scope)}{role?.scope && Object.keys(role.scope).length > 0 && <p>Role restriction: {scopeSummary(role.scope)}</p>}{grant.departmentRead && <p>Department purchases included</p>}</td><td>{role?.permissions.includes('po.convert') ? limitSummary(limit, currency) : '—'}</td><td>{member.active && role?.active !== false ? 'Active' : 'Inactive'}</td>{owner && <td><Form label="Revoke grant" onSubmit={async () => { await mutate('member', { email: member.email, name: member.name, active: member.active, grants: memberGrants(member).filter((_, grantIndex) => grantIndex !== index) }); setNotice('Role grant revoked. Remaining grants were retained; the change is recorded in audit history.'); }}>{null}</Form></td>}</tr>;
            })}
        </Table>{!rows.length && <p>No member grants are visible.</p>}
        <h4>Role definitions</h4><Table heads={['Role', 'Permissions', 'Scope', 'Buyer limits', 'Status']}>
            {roles.map(role => <tr key={role.id}><td>{role.name}{!role.custom && <p className="quiet">Built-in role</p>}</td><td>{role.permissions.map(permission => permissionLabels[permission] ?? 'Unavailable permission').join(', ')}</td><td>{scopeSummary(role.scope)}</td><td>{role.id === 'owner' ? 'Native owner authority' : role.permissions.includes('po.convert') ? limitSummary(defaults(role), currency) : '—'}</td><td>{role.active === false ? 'Inactive' : 'Active'}</td></tr>)}
        </Table>
        {owner && <><MemberGrants data={data} roles={roles} mutate={mutate} saved={setNotice}/><RoleLimits data={data} roles={roles} mutate={mutate} saved={setNotice}/></>}
        <ZeroBuyerLimits data={data} mutate={mutate} saved={setNotice}/>
        <CustomRoles data={data} roles={roles} owner={owner} mutate={mutate} saved={setNotice}/>
        {history.length > 0 && <section aria-label="Recent access changes"><h4>Recent access changes</h4><Table heads={['When', 'Changed by', 'Change', 'Before / after']}>
            {history.map((event: D) => <tr key={event.id}><td>{when(event.at)}</td><td className="email-cell">{event.email ?? 'Native operator'}</td><td>{event.action === 'member' ? 'Member grants: ' + event.record : event.action === 'access-role' ? 'Custom role: ' + (event.after?.name ?? event.before?.name ?? name(event.record)) : 'Buyer role limits: ' + name(event.after?.role ?? event.before?.role)}</td><td>{event.action === 'member' ? <><p>Before: {grantHistory(event.before)}</p><p>After: {grantHistory(event.after)}</p></> : event.action === 'buyer-role-limit' ? <><p>Before: {limitSummary(event.before?.limits, currency)}</p><p>After: {limitSummary(event.after?.limits, currency)}</p></> : <><p>Before: {event.before ? scopeSummary(event.before.scope) + ' · ' + (event.before.permissions ?? []).map((permission: string) => permissionLabels[permission] ?? 'Unavailable permission').join(', ') : 'New role'}</p><p>After: {scopeSummary(event.after?.scope)} · {(event.after?.permissions ?? []).map((permission: string) => permissionLabels[permission] ?? 'Unavailable permission').join(', ')}{event.after?.active === false ? ' · Inactive' : ''}</p></>}</td></tr>)}
        </Table></section>}
    </section>;
}
