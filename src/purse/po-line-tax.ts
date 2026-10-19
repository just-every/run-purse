import { requireThat, type Data } from './types';
export function allocateLineTax(lines: Data[], tax: number) {
    const specified = lines.filter(l => l.lineTaxMinor !== null);
    requireThat(!specified.length || specified.length === lines.length, 'Provide tax for every line or leave every line blank for proportional allocation');
    if (specified.length) { requireThat(lines.reduce((n, l) => n + l.lineTaxMinor, 0) === tax, 'Line tax must equal supplied tax'); return; }
    const base = lines.reduce((n, l) => n + BigInt(l.totalMinor), 0n), denominator = base || BigInt(lines.length);
    const shares = lines.map((l, i) => { const n = BigInt(tax) * (base ? BigInt(l.totalMinor) : 1n); return { i, amount: Number(n / denominator), remainder: n % denominator }; });
    let left = tax - shares.reduce((n, l) => n + l.amount, 0);
    for (const s of [...shares].sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1)) { if (!left) break; s.amount++; left--; }
    for (const s of shares) lines[s.i].lineTaxMinor = s.amount;
}
