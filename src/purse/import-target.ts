import type { D1TargetAdapter, TargetRow } from '../modules/import-kit/src/d1/index';
const sql = (sql: string, ...params: any[]) => ({ sql, params });
export const targets: D1TargetAdapter = {
    async read(db, destination, kind, id) { const r = await db.prepare('SELECT * FROM p_records WHERE business=? AND kind=? AND id=?').bind(destination, kind, id).first(); return r ? { destination, targetKind: kind, targetId: id, revision: r.revision, value: JSON.parse(r.value) } : undefined; },
    matches(r, d, k, id) { return r ? sql('EXISTS(SELECT 1 FROM p_records WHERE business=? AND kind=? AND id=? AND revision=? AND value=?)', d, k, id, r.revision, JSON.stringify(r.value)) : sql('NOT EXISTS(SELECT 1 FROM p_records WHERE business=? AND kind=? AND id=?)', d, k, id); },
    matchesMany(rows,d){return [this.matchesCount!(rows.length,d),...rows.map(r=>this.matches(r,d,r.targetKind,r.targetId))]},
    async preparePreservedUndo(db,destination,effects){
      const rows=await this.list(db,destination), byKey=new Map(rows.map(r=>[r.targetKind+':'+r.targetId,r]));
      const strings=(v:any):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(strings):v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
      const effectByKey=new Map(effects.map(e=>[e.expected.targetKind+':'+e.expected.targetId,e.provenance.id]));
      const dependencies=effects.flatMap(e=>rows.filter(r=>(r.targetId!==e.expected.targetId||r.targetKind!==e.expected.targetKind)&&strings(r.value).includes(e.expected.targetId)).map(r=>({requiredEffectId:e.provenance.id,...(effectByKey.has(r.targetKind+':'+r.targetId)?{dependentEffectId:effectByKey.get(r.targetKind+':'+r.targetId)}:{}),cause:{table:'p_records',recordId:r.targetId,field:r.targetKind},evidence:{reason:'A downstream record still refers to this imported entity',kind:r.targetKind,id:r.targetId}})));
      return {observations:effects.map(e=>({effectId:e.provenance.id,current:byKey.get(e.expected.targetKind+':'+e.expected.targetId)??null,entity:{table:'p_records',recordId:e.expected.targetId,field:e.expected.targetKind},evidence:{reason:'Complete current native record snapshot'}})),nativeRows:rows,dependencies,guards:this.matchesMany!(rows,destination)};
    },
    matchesCount(n, d) { return sql('(SELECT COUNT(*) FROM p_records WHERE business=?)=?', d, n); },
    write(r) { return [sql('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value', r.destination, r.targetKind, r.targetId, r.revision, JSON.stringify(r.value))]; },
    remove(d,k,id){return [sql('DELETE FROM p_records WHERE business=? AND kind=? AND id=?',d,k,id)]},
    async list(db, d) { const { results } = await db.prepare('SELECT * FROM p_records WHERE business=?').bind(d).all(); return results.map((r: any) => ({ destination: d, targetKind: r.kind, targetId: r.id, revision: r.revision, value: JSON.parse(r.value) })) as TargetRow[]; }
};
