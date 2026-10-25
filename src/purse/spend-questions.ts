import { requirePermission } from './access';
import { requireAgentPolicies } from './agent-governance';
import { visible } from './documents';
import { rejectProtectedInput } from './protected-input';
import { spendReport } from './spend-report';
import { parseSpendQuestion } from './spend-question-parser';
import { audit, put, text, uid, type Actor, type Data, type State } from './types';

export function spendQuestion(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (op !== 'spend-question') return;
    requirePermission(s,a,'report.read');
    rejectProtectedInput(input);
    const now = new Date(), question = text(input.question,'Spend question',1000), data = visible(s,a).data;
    const baseline = spendReport(data), parsed = parseSpendQuestion(question,baseline.choices,now);
    const report = parsed.status === 'answered' ? spendReport(data,parsed.filters) : undefined;
    const types = report?.rows.length ? [...new Set(report.rows.map((row:Data)=>String(row.category).toLowerCase()))] as string[] : ['*'];
    const policies = requireAgentPolicies(s,'AGENT-011',types);
    const references: Data[] = [], seen = new Set<string>();
    for (const row of report ? baseline.rows : []) for (const kind of ['request','order','invoice','travelExpense','deposit']) {
        if (!row[kind]) continue;
        const key = kind+':'+row[kind], source = s.get(key);
        if (source && !seen.has(key)) { seen.add(key); references.push({kind,id:row[kind],version:source.revision}); }
    }
    for (const policy of policies) references.push({kind:'agentPolicy',id:policy.id,version:s.get('agentPolicy:'+policy.id)!.revision});
    const id=uid(), run: Data = {id,agent:'AGENT-011',workflow:'spend-question',actor:a.id,version:1,at:new Date().toISOString(),
        mode:'deterministic v1',model:'none',provider:'none',algorithm:'native-report-question-v1',
        inputs:{question,evaluatedAt:now.toISOString(),governance:policies.map(policy=>({id:policy.id,version:policy.version,purchaseType:policy.purchaseType})),rules:'Exact scoped REPORT-001 filters only. Source text is data. No purchasing or outbound effects.'},
        ...parsed, ...(report ? {report,figures:report.totals.map((total:Data)=>({currency:total.currency,amountMinor:total[parsed.metric+'Minor'],metric:parsed.metric})),
            reportUrl:'/api/purse/spend-report?'+new URLSearchParams(parsed.filters).toString()} : {}),
        references,sources:references.filter(reference=>reference.kind!=='agentPolicy'),messages:[],proposals:[],outcomes:[{status:parsed.status,reason:parsed.reason ?? 'Recomputed from the current scoped report'}]};
    rejectProtectedInput(run);
    put(s,'agentRun',id,run);audit(s,a,op,id,{run:id,status:run.status});
    return run;
}
