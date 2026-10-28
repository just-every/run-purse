import worker from './purse-worker';
// Pin only this journey's Worker clock; production entry points are unchanged.
const SystemDate = Date;
let clock = 0;
globalThis.Date = class extends SystemDate {
    constructor(value?: string | number) { super(value === undefined ? clock : value); }
    static now() { return clock; }
} as DateConstructor;
export default { ...worker, fetch(request: Request, env: any, context: ExecutionContext) {
    clock = SystemDate.parse(env.PURSE_TEST_CLOCK);
    // D1's SQL clock must agree with the pinned Worker clock for the unchanged session fences.
    const db = new Proxy(env.DB, {get(target,key) {
        if(key === 'prepare') return (sql: string) => target.prepare(sql.replaceAll('unixepoch()',String(Math.floor(clock/1000))));
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    }});
    return worker.fetch(request,{...env,DB:db},context);
} };
