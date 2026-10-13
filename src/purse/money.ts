import { minor, requireThat, type Data } from './types';

/** Human currency text is parsed using integers before it enters stored money. */
function decimalMinor(value: unknown, label: string): number {
    requireThat(typeof value === 'string', `${label} must be currency text`);
    const input = value.trim();
    requireThat(input.length <= 100 && /^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input),
        `${label} must be a nonnegative amount with up to 2 decimal places, for example 1,250.50`);
    const [whole, fraction = ''] = input.replaceAll(',', '').split('.');
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    requireThat(result <= 1000000000000n, `${label} exceeds the supported amount`);
    return Number(result);
}

type Options = { fallback?: number; optional?: boolean };
export function moneyInput(input: Data, amountKey: string, minorKey: string, label: string, options: Options & { optional: true }): number | null;
export function moneyInput(input: Data, amountKey: string, minorKey: string, label: string, options?: Options): number;
export function moneyInput(input: Data, amountKey: string, minorKey: string, label: string, options: Options = {}): number | null {
    const human = Object.hasOwn(input, amountKey), legacy = Object.hasOwn(input, minorKey);
    requireThat(!(human && legacy), `Provide either ${amountKey} or ${minorKey}, not both`);
    if (human) {
        const value = input[amountKey];
        if (options.optional && (value === null || (typeof value === 'string' && value.trim() === ''))) return null;
        return decimalMinor(value, label);
    }
    if (options.optional && input[minorKey] === null) return null;
    return minor(input[minorKey] ?? options.fallback, label);
}
