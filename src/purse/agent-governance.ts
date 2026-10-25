import { rejectProtectedInput } from './protected-input';
import { all, audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';

export const governedAgents = ['AGENT-002', 'AGENT-003', 'AGENT-006', 'AGENT-011', 'AGENT-008'];
export function purchaseTypes(subject: Data): string[] {
    const declared=subject.purchaseType??subject.intakeFormSnapshot?.purchaseType;
    if(typeof declared==='string'&&declared.trim())return [declared.trim().toLowerCase()];
    const types = [...new Set((subject.lines ?? []).map((line: Data) => typeof line.category === 'string' ? line.category.trim().toLowerCase() : '').filter(Boolean))] as string[];
    return types.length ? types : ['*'];
}
const identity = (agent: string, purchaseType: string) => JSON.stringify([agent, purchaseType]);

/** Exact type controls override the owner's explicit all-types control. */
export function agentPolicies(s: State, agent: string, types: string[]): Data[] | undefined {
    const selected = [...new Set(types.length ? types : ['*'])].map(type =>
        s.get('agentPolicy:' + identity(agent, type))?.value ?? s.get('agentPolicy:' + identity(agent, '*'))?.value);
    if (selected.some(policy => !policy?.enabled)) return;
    return [...new Map(selected.map(policy => [policy!.id, policy!])).values()];
}
export function requireAgentPolicies(s: State, agent: string, types: string[]): Data[] {
    const policies = agentPolicies(s, agent, types);
    requireThat(policies, `${agent} is paused or not enabled for this purchase type`, 409);
    return policies;
}
function write(s: State, a: Actor, input: Data) {
    const purchaseType = text(input.purchaseType, 'Purchase type', 200).toLowerCase(), id = identity(input.agent, purchaseType);
    const previous = s.get('agentPolicy:' + id)?.value;
    requireThat(input.version === (previous?.version ?? 0), 'Agent controls changed; reload', 409);
    requireThat(typeof input.enabled === 'boolean', 'Choose enabled or paused');
    requireThat(Number.isSafeInteger(input.cadenceDays) && input.cadenceDays >= 1 && input.cadenceDays <= 30, 'Choose 1–30 days between supplier chases');
    requireThat(Number.isSafeInteger(input.maxChases) && input.maxChases >= 1 && input.maxChases <= 20, 'Choose 1–20 supplier chase attempts');
    const entry = { id, agent: input.agent, purchaseType, enabled: input.enabled, cadenceDays: input.cadenceDays,
        maxChases: input.maxChases, version: (previous?.version ?? 0) + 1, actor: a.id, operatorVersion: a.version,
        at: new Date().toISOString(), reason: text(input.reason, 'Agent control reason') };
    put(s, 'agentPolicy', id, { ...entry, history: [...(previous?.history ?? []), entry] });
    audit(s, a, 'agent-policy', id, { agent: entry.agent, purchaseType, version: entry.version, enabled: entry.enabled, reason: entry.reason });
    return get(s, 'agentPolicy', id);
}
export function agentGovernance(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (!['agent-policy', 'agent-pause'].includes(op)) return;
    requireThat(a.owner, 'Current native owner required', 403);
    rejectProtectedInput(input);
    requireThat(governedAgents.includes(input.agent), 'This agent has no native executor');
    if (op === 'agent-policy') return write(s, a, input);
    const reason = text(input.reason, 'Pause reason'), policies = all(s, 'agentPolicy').filter(row => row.agent === input.agent);
    for (const policy of policies) write(s, a, { ...policy, enabled: false, reason });
    if (!policies.length) write(s, a, { agent: input.agent, purchaseType: '*', version: 0, enabled: false, cadenceDays: 1, maxChases: 2, reason });
    audit(s, a, 'agent-pause', input.agent, { reason });
    return { agent: input.agent, paused: true };
}
