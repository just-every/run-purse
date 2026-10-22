import { redactionStatements, invalidateTransfersStatements } from '@runeditrun/rer/internal/modules/portability/journal.mjs';
/** Adapt Base's prepared-statement API to import-kit's transaction descriptors.
 * Reads still use the real database; no private statement internals are read. */
export async function erasureCheckpoint(db) {
 const adapter={prepare(sql){let params=[];return {sql,get params(){return params},bind(...values){params=values;return this},first(...args){return db.prepare(sql).bind(...params).first(...args)},all(...args){return db.prepare(sql).bind(...params).all(...args)},run(...args){return db.prepare(sql).bind(...params).run(...args)}}};
 const statements=[...await invalidateTransfersStatements(adapter),...await redactionStatements(adapter)];
 return statements.map(({sql,params})=>({sql,params}));
}
