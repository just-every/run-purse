import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const groups=JSON.parse(readFileSync(new URL('./shards.json',import.meta.url),'utf8'));
const group=process.argv[2];
if(!Object.hasOwn(groups,group))throw Error(`Unknown CI group: ${group}`);
const started=Date.now();let failed=false;
for(const [index,command]of groups[group].entries()){
 const {args,journeys}=command;
 console.log(`::group::node ${args.join(' ')}`);
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,...(journeys?{PURSE_JOURNEYS:journeys.join(',')}:{}),PURSE_EVIDENCE:join(process.env.PURSE_EVIDENCE??'.cache/purse-proof',group,String(index+1))}});
 console.log('::endgroup::');if(result.error)console.error(result.error.message);if(result.status!==0)failed=true;
}
console.log(`SHARD_SECONDS group=${group} seconds=${((Date.now()-started)/1000).toFixed(1)}`);
process.exitCode=failed?1:0;
