import {readFile} from 'node:fs/promises';
export const records=async path=>(await readFile(path,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
export const rows=archive=>archive.filter(r=>r.kind==='part').flatMap(r=>r.items);
