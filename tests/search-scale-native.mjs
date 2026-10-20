import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Synthetic test data in native D1; the application's real projection triggers index every row. */
export async function seedNativeSearchScale(root) {
 const file=join(root,'exports/search-scale.sql');
 await writeFile(file,`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n+1<100000-(SELECT count(*) FROM p_records))
 INSERT INTO p_records(business,kind,id,revision,value)
 SELECT 'main','supplier',printf('scale-%06d',n),printf('scale-%06d',n),json_object('id',printf('scale-%06d',n),'name','Scale supplier '||n,'dba','','contacts',json('[]'),'status','pending_review','reason','Synthetic scale fixture','contractRef','','renewal','','documents',json('[]')) FROM seq;
 SELECT count(*) AS records FROM p_records;`);
 const {stdout}=await promisify(execFile)('pnpm',['exec','wrangler','d1','execute','foundation','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc','--file',file,'--json'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},maxBuffer:1024*1024});
 const results=JSON.parse(stdout);assert.equal(results.at(-1).results[0].records,100000,'SEARCH-001 native D1 has 100000 records');
}
