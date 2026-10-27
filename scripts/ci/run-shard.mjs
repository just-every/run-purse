import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const groups = JSON.parse(readFileSync(new URL('./shards.json', import.meta.url), 'utf8'));
const group = process.argv[2];
if (!Object.hasOwn(groups, group)) throw new Error(`Unknown CI group: ${group}`);

let failed = false;
for (const [index, args] of groups[group].entries()) {
  console.log(`::group::node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Each old job keeps its own archives, result.json and screenshots.
      PURSE_EVIDENCE: join(process.env.PURSE_EVIDENCE, group, String(index + 1)),
    },
  });
  console.log('::endgroup::');
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
