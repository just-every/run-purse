import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {deploymentSpec} from './delivery/base/spec.mjs';
const {pursePackaging}=await import('./purse-delivery.mjs');
const config = await pursePackaging();
const bytes = JSON.stringify(await deploymentSpec(process.cwd(), config.artifact.specInputs), null, 2) + '\n';
const target = 'management/integration/deployment-spec.json';
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== bytes) throw Error('Deployment specification is stale; run pnpm delivery:spec after the real build.');
  console.log('Deployment specification matches the real build and source policy.');
} else {
  await mkdir('./management/integration', {recursive: true});
  await writeFile(target, bytes);
  console.log('Wrote deployment specification.');
}
