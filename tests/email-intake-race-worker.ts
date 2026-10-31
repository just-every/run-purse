import worker from './purse-worker';

// Hold both atomic capture batches after their state/authority reads. All SQL
// still reaches real D1, so one capture must roll back and reload its state.
const pairs = new Map<string, { arrived: number; wait: Promise<void>; release: () => void }>();
export default {
    ...worker,
    async fetch(request: Request, env: any, ctx: ExecutionContext) {
        const pair = request.headers.get('x-purse-test-intake-pair');
        if (!pair || new URL(request.url).pathname !== '/api/purse/email-intake/inbound') return worker.fetch(request, env, ctx);
        let gate = pairs.get(pair);
        if (!gate) {
            let release!: () => void;
            const wait = new Promise<void>(resolve => { release = resolve; });
            gate = { arrived: 0, wait, release };
            pairs.set(pair, gate);
        }
        const captureStatements = new WeakSet<D1PreparedStatement>();
        let attempts = 0;
        const db = new Proxy(env.DB, {
            get(target, name) {
                if (name === 'prepare') return (sql: string) => {
                    const statement = target.prepare(sql);
                    if (!sql.startsWith("UPDATE p_email_intake_receipts SET status='stored'")) return statement;
                    return new Proxy(statement, {
                        get(prepared, name) {
                            if (name === 'bind') return (...values: any[]) => {
                                const bound = prepared.bind(...values);
                                captureStatements.add(bound);
                                return bound;
                            };
                            const value = Reflect.get(prepared, name, prepared);
                            return typeof value === 'function' ? value.bind(prepared) : value;
                        },
                    });
                };
                if (name === 'batch') return async (statements: D1PreparedStatement[]) => {
                    if (statements.some(statement => captureStatements.has(statement)) && ++attempts === 1) {
                        if (++gate.arrived === 2) { pairs.delete(pair); gate.release(); }
                        await gate.wait;
                    }
                    return target.batch(statements);
                };
                const value = Reflect.get(target, name, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        const response = await worker.fetch(request, { ...env, DB: db }, ctx);
        const result = new Response(response.body, response);
        result.headers.set('x-purse-test-capture-attempts', String(attempts));
        return result;
    },
};
