// The seed's existing parser keeps the acceptance projections tied to CONTRACT.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseContract } from '../src/base/seed-contract.mjs';
const mode=process.argv[2];
if(!['write','check'].includes(mode))throw Error('Use contract-docs.mjs write or check');
let source=readFileSync('CONTRACT.md','utf8');
const rows=source.split('\n').filter(line=>/^\| `[^`]+` \|/.test(line)).map(line=>line.split(/(?<!\\)\|/).slice(1,-1).map(cell=>cell.trim()));
const count=list=>['done','partial','missing'].map(status=>list.filter(row=>row[3]===status).length).concat(list.length);
for(const [label,selected] of [['Published',rows.filter(row=>row[2]==='published')],['Target and push further',rows.filter(row=>row[2]!=='published')],['All',rows]])source=source.replace(new RegExp('^\\| '+label+' \\|.*$','m'),'| '+label+' | '+count(selected).join(' | ')+' |');
const contract=parseContract(source),byId=new Map(rows.map(row=>[row[0].replaceAll('`',''),row]));
const heading=`Current candidate counts: ${contract.counts.done} done, ${contract.counts.partial} partial, ${contract.counts.missing} missing; ${contract.counts.total} total.`;
const selected=process.argv.slice(3);
if(!selected.length||selected.some(id=>!byId.has(id)))throw Error('Name the contract clauses to regenerate');
let acceptance=readFileSync('ACCEPTANCE.md','utf8').replace(/Current candidate counts: [^.]+\./,heading);
for(const id of selected){
    const clause=contract.clauses.find(clause=>clause.id===id),row=byId.get(id);
    const entry=`- **${clause.id} — ${clause.title}. Status: ${clause.status}.** ${clause.text} Evidence by acceptance point: ${row[4]||'None recorded.'}${clause.gap?' Remaining Gap: '+clause.gap:''}`;
    const lines=acceptance.split('\n'),index=lines.findIndex(line=>line.startsWith('- **'+id+' — '));
    if(index<0){
        const preceding=contract.clauses.slice(0,contract.clauses.indexOf(clause)).reverse().find(other=>other.area===clause.area);
        const anchor=lines.findIndex(line=>line.startsWith('- **'+preceding?.id+' — '));
        if(anchor<0)throw Error('Acceptance insertion anchor not found: '+id);
        lines.splice(anchor+1,0,entry);
    }else lines[index]=entry;
    acceptance=lines.join('\n');
}
const claims='# Purse clause status\n\nGenerated from `CONTRACT.md` by `node scripts/contract-docs.mjs write <clause IDs>`. '+heading+'\n\n| Clause | Title | Status |\n| --- | --- | --- |\n'+contract.clauses.map(clause=>'| `'+clause.id+'` | '+clause.title+' | '+clause.status+' |').join('\n')+'\n';
for(const [path,value] of [['CONTRACT.md',source],['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]){
    if(mode==='write'){if(path.startsWith('docs/'))mkdirSync('docs',{recursive:true});writeFileSync(path,value);}
    else if(readFileSync(path,'utf8')!==value)throw Error('Stale generated contract documentation: '+path);
}
console.log('Contract documentation '+mode+' passed');
