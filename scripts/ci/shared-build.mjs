// Reuse an emitted build only when both its source and bytes still match.
// A normal owner build continues to use Vite; CI supplies an explicit build root.
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const receipt='.ci-build.json';
async function tree(directory,base=directory){
 const result={};
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name),name=relative(base,path);
  if(name===receipt)continue;
  if(entry.isDirectory())Object.assign(result,await tree(path,base));
  else if(entry.isFile())result[name]=await digest(path);
  else throw Error('Shared build contains a non-file: '+name);
 }
 return result;
}
if(process.argv[2]==='record'){
 const names=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),source={};
 for(const name of names)source[name]=await digest(name);
 await writeFile(join('dist',receipt),JSON.stringify({source,artifact:await tree('dist')})+'\n');
 console.log('Recorded exact source and emitted build for the recovery journey');
}else{
 const root=resolve(process.env.PURSE_PREBUILT_ROOT??'');
 if(!process.env.PURSE_PREBUILT_ROOT||root===process.cwd())throw Error('Shared build requires a separate explicit source root');
 const expected=JSON.parse(await readFile(join(root,'dist',receipt),'utf8'));
 for(const[name,hash]of Object.entries(expected.source))if(await digest(name)!==hash)throw Error('Shared build source changed: '+name);
 const actual=await tree(join(root,'dist'));
 if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(expected.artifact).sort()))throw Error('Shared emitted build changed');
 await cp(join(root,'dist'),'dist',{recursive:true});
 console.log('Reused the exact-source emitted build');
}
