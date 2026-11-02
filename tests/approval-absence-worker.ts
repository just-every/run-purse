import worker from './purse-worker';
// A deterministic clock at the Worker boundary leaves production time unchanged.
const SystemDate=Date;
let clock=0;
globalThis.Date=class extends SystemDate {constructor(value?:string|number){super(value===undefined?clock:value);}static now(){return clock;}} as DateConstructor;
function bindings(env:any){clock=SystemDate.parse(env.PURSE_TEST_CLOCK);return {...env,DB:new Proxy(env.DB,{get(target,key){if(key==='prepare')return (sql:string)=>target.prepare(sql.replaceAll('unixepoch()',String(Math.floor(clock/1000))));const value=target[key];return typeof value==='function'?value.bind(target):value;}})};}
export default {fetch(request:Request,env:any,ctx:ExecutionContext){return worker.fetch(request,bindings(env),ctx);},scheduled(event:ScheduledController,env:any,ctx:ExecutionContext){return worker.scheduled(event,bindings(env),ctx);}};
