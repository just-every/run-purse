import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {nativeMigrationPreflight} from '/workspace/run-purse/node_modules/@runeditrun/rer/cli/portability-migrations.mjs';
const root=process.cwd(),directory=join(root,'.wrangler/state/v3/d1');
const files=readdirSync(directory,{recursive:true}).filter(name=>name.endsWith('.sqlite'));
let selected;
for(const file of files){const db=new DatabaseSync(join(directory,file),{readOnly:true});if(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='p_records'").get().n){assert.equal(selected,undefined);selected=db}else db.close()}
assert.ok(selected,'One local native database required');
try {
 const adapter={prepare(sql){let params=[];return {bind(...values){params=values;return this},async all(){return {results:selected.prepare(sql).all(...params)}},async first(){return selected.prepare(sql).get(...params)??null}}}};
 const result=await nativeMigrationPreflight({root,db:adapter,binding:'DB'});
 assert.equal(result.nativeApply,false);
 assert.equal(selected.prepare("SELECT count(*) AS n FROM d1_migrations WHERE name='0048_agent_artifact_erasure.sql'").get().n,1);
 console.log('Migration ledger preflight passed on local native installation; 0048 applied once; no pending migrations');
}finally{selected.close()}
