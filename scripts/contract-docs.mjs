import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseContract } from '@runeditrun/rer/internal/foundation/runtime/seed-contract.mjs';

// Regenerate the selected clauses without rewriting other campaigns' entries.
const [mode, ...ids] = process.argv.slice(2);
if (!['write', 'check'].includes(mode) || !ids.length) throw new Error('Use write or check followed by the changed clause IDs');
const source = readFileSync('CONTRACT.md', 'utf8');
const statuses = [...source.matchAll(/^\| `[^`]+` \| [^\n]*? \| (published|target|push-further) \| (done|partial|missing) \|/gm)].map(match => ({ kind: match[1], status: match[2] }));
const count = rows => ['done', 'partial', 'missing'].map(status => rows.filter(row => row.status === status).length).concat(rows.length);
let contract = source;
for (const [name, rows] of [['Published', statuses.filter(row => row.kind === 'published')], ['Target and push further', statuses.filter(row => row.kind !== 'published')], ['All', statuses]]) {
    contract = contract.replace(new RegExp('^\\| ' + name + ' \\|.*$', 'm'), '| ' + name + ' | ' + count(rows).join(' | ') + ' |');
}
const { clauses } = parseContract(contract, { file: 'CONTRACT.md' });
if (statuses.length !== clauses.length) throw new Error('Status summary extraction must retain every parsed clause');
let acceptance = readFileSync('ACCEPTANCE.md', 'utf8');
const [done, partial, missing, total] = count(clauses);
acceptance = acceptance.replace(/Current candidate counts: \d+ done, \d+ partial, \d+ missing; \d+ total\./, `Current candidate counts: ${done} done, ${partial} partial, ${missing} missing; ${total} total.`);
for (const id of ids) {
    const clause = clauses.find(clause => clause.id === id);
    if (!clause) throw new Error('Unknown clause: ' + id);
    const status = source.split('\n').find(line => line.startsWith('| `' + id + '` |'));
    const cells = status.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 6) throw new Error('Status cells require escaped separators: ' + id);
    const entry = `- **${id} — ${clause.title}. Status: ${clause.status}.** ${clause.text} Evidence by acceptance point: ${cells[4]}${clause.gap ? ' Remaining Gap: ' + clause.gap : ''}`;
    const expression = new RegExp('^- \\*\\*' + id + ' —[^\\n]*', 'm');
    if (!expression.test(acceptance)) throw new Error('Acceptance entry is missing: ' + id);
    acceptance = acceptance.replace(expression, () => entry);
}
const claims = '# Purse clause status\n\nGenerated from `CONTRACT.md`. Status describes the clause boundary and its cited proof, not provider or legal qualification beyond that boundary.\n\n| Clause | Status | Capability |\n| --- | --- | --- |\n' + clauses.map(clause => `| ${clause.id} | ${clause.status} | ${clause.title} |`).join('\n') + '\n';
for (const [path, expected] of [['CONTRACT.md', contract], ['ACCEPTANCE.md', acceptance], ['docs/CLAIMS.md', claims]]) {
    if (mode === 'write') { mkdirSync('docs', { recursive: true }); writeFileSync(path, expected); }
    else if (readFileSync(path, 'utf8') !== expected) throw new Error('Regenerate contract documents: ' + path);
}
console.log(`Contract documents ${mode}: ${done} done, ${partial} partial, ${missing} missing; ${total} clauses`);
