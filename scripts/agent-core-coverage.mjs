import {readFile} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'

// The Purchasing core section is the seed's published job inventory. Later
// target clauses retain their own implementation and qualification boundaries.
export function missingCoreJobs(contract,surface) {
 const section=contract.split('## Purchasing core (existing guarantees)')[1]?.split('\n## ')[0]
 if(!section)throw Error('Missing Purchasing core inventory in CONTRACT.md')
 const jobs=[...section.matchAll(/^- \*\*([A-Z][A-Z0-9-]+) —/gm)].map(match=>match[1])
 if(!jobs.length)throw Error('Empty Purchasing core inventory in CONTRACT.md')
 const covered=new Set((surface.tools??[]).flatMap(tool=>tool.clauses??[]))
 for(const item of surface.notTools??[])if(['device','screen','connector','import-door','installation'].includes(item.reason))for(const id of item.clauses??[])covered.add(id)
 return jobs.filter(id=>!covered.has(id))
}

export async function requireCoreCoverage(root=new URL('../',import.meta.url)) {
 const [contract,source]=await Promise.all([readFile(new URL('CONTRACT.md',root),'utf8'),readFile(new URL('agent-surface.json',root),'utf8')])
 const missing=missingCoreJobs(contract,JSON.parse(source))
 if(missing.length) {
  const message='Agent surface omits Core jobs: '+missing.join(', ')+'. Declare their native tools or a supported not-a-tool reason.'
  console.error(message)
  throw Error(message)
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await requireCoreCoverage()
