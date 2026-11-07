import type { D1Sql } from '../modules/import-kit/src/d1/types';
import type { ErasurePlan } from './erasure-plan';
import { diffValue } from './erasure-diff';
import { erasureDigest } from './erasure-journal.mjs';
import { requireThat, type Data } from './types';

// These are installation copies, not portable purchasing records. Retain the
// original claim digest and key: a scrubbed replay must never become a new call.
const stores = [
 {table:'agent_door_calls',key:['agent','key'],json:['outcome']},
 {table:'agent_door_approvals',key:['id'],json:['saved','approvals','result']},
 {table:'agent_door_reviews',key:['id'],json:['saved']},
 {table:'agent_door_audit',key:['id'],json:['row','evidence']},
 {table:'agent_door_events',key:['id'],json:['event']},
 {table:'agent_door_usage',key:['decision_id'],json:['classes']},
] as const;
export type AgentArtifactErasure = { revision:number; statements:D1Sql[]; inventory:Data };
const sql=(sql:string,...params:any[]):D1Sql=>({sql,params});

/** Bind retained inputs, outcomes and displays to the same owner-reviewed plan.
 * The epoch and all rows are read in one D1 snapshot; its first write guard
 * fences new calls, replays and human decisions as well as changed native data.
 */
export async function planAgentArtifactErasure(db:D1Database,plan:ErasurePlan) {
 const snapshot=await db.batch([
  db.prepare('SELECT revision FROM p_agent_artifact_revision WHERE id=1'),
  ...stores.map(store=>db.prepare(`SELECT * FROM ${store.table} ORDER BY rowid`)),
 ]);
 const revision=Number((snapshot[0].results[0] as Data).revision),fields:Data[]=[],statements:D1Sql[]=[];
 const idle="NOT EXISTS(SELECT 1 FROM agent_door_calls WHERE state='running') AND NOT EXISTS(SELECT 1 FROM agent_door_approvals WHERE state='executing') AND NOT EXISTS(SELECT 1 FROM agent_door_audit WHERE json_extract(row,'$.outcome')='running')";
 // Do not rewrite an in-flight execution's saved input underneath its worker.
 const settled=await db.prepare(`SELECT CASE WHEN ${idle} THEN 1 ELSE 0 END AS ok`).first<{ok:number}>();
 requireThat(settled?.ok===1,'Agent execution is in progress; review erasure after it settles',409);
 statements.push(sql(`INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_agent_artifact_revision WHERE id=1)=? AND ${idle} THEN 1 ELSE 0 END`,revision));
 // Free-form tool fields can use names such as action or status. They are
 // content here, so native structural-field exemptions must not hide a match.
 const scrub=(value:any):any=>typeof value==='string'?plan.scrub(value):Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([name,item])=>[plan.scrub(name),scrub(item)])):value;
 const counts:Data[]=[];
 for(const [index,store]of stores.entries()) {
  let count=0;
  for(const row of snapshot[index+1].results as Data[]) {
   const next={...row};
   for(const column of store.json)if(row[column]!==null)next[column]=JSON.stringify(scrub(JSON.parse(row[column])));
   const changed=store.json.some(column=>next[column]!==row[column]);
   if(!changed)continue;
   const id=String(row.id??row.decision_id);
   if(store.table==='agent_door_approvals') {
    const saved=JSON.parse(next.saved);
    saved.summary_sha256=erasureDigest(saved.summary);
    // Freshly reading an anonymous summary cannot revive old consent. Completed
    // decisions remain chronological facts; only unexecuted authority expires.
    if(row.state==='pending') {
     next.state='expired';next.version=row.version+1;
     next.result=JSON.stringify({...saved.result,outcome:'refused',code:'personal_data_erased'});
    }
    next.saved=JSON.stringify(saved);
   }
   if(store.table==='agent_door_calls'&&row.state==='pending') {
    next.state='refused';next.outcome=JSON.stringify({...JSON.parse(next.outcome),outcome:'refused',code:'personal_data_erased'});
   }
   if(store.table==='agent_door_reviews') {
    const saved=JSON.parse(next.saved);delete saved.undo;next.saved=JSON.stringify(saved);
   }
   for(const column of Object.keys(next))if(next[column]!==row[column]) {
    const decode=(v:any)=>store.json.some(name=>name===column)&&v!==null?JSON.parse(v):v;
    diffValue(decode(row[column]),decode(next[column]),[column],store.table,id,fields);
   }
   const columns=Object.keys(next).filter(column=>next[column]!==row[column]);
   statements.push(sql(`UPDATE ${store.table} SET ${columns.map(column=>column+'=?').join(',')} WHERE ${store.key.map(column=>column+'=?').join(' AND ')}`,...columns.map(column=>next[column]),...store.key.map(column=>row[column])));
   count++;
  }
  counts.push({kind:store.table,records:count});
 }
 plan.fields.push(...fields);
 plan.affected.push(...[...new Map(fields.map(field=>[field.kind+':'+field.id,{kind:field.kind,id:field.id}])).values()]);
 plan.fingerprint=erasureDigest({native:plan.fingerprint,agentArtifacts:{revision,fields}});
 plan.agentArtifacts={revision,statements,inventory:{store:'agent retained artifacts',fields:['matching saved inputs','matching replay outcomes','matching approval and review displays','matching audit and event copies','pending execution authority'],counts}};
}
