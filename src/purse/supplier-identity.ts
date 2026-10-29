import { createHmac } from 'node:crypto';
import { get, key, put, requireThat, type Data, type State } from './types';

export function initializeSupplierMatching(s: State) {
    if (!s.has(key('supplierMatchingKey', 'main'))) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        put(s, 'supplierMatchingKey', 'main', { secret: [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') });
    }
}
export function matchingInputs(s: State, input: unknown, previous: Data = {}): Data {
    if (input === undefined) return previous;
    requireThat(input !== null && typeof input === 'object' && !Array.isArray(input), 'Matching-only identity must be an object');
    const values = input as Data, result = { ...previous };
    const digits = (value: unknown, label: string) => {
        requireThat(typeof value === 'string' && value.length <= 100 && /^[\d\s()-]*$/.test(value), label + ' must contain digits');
        return value.replace(/\D/g, '');
    };
    const secret = s.get(key('supplierMatchingKey', 'main'))?.value.secret;
    const digest = (kind: string, value: string) => {
        requireThat(secret, 'Matching key not restored – restore the owner include archive or recover matching', 503);
        return createHmac('sha256', Buffer.from(secret, 'hex')).update(kind + ':' + value).digest('hex');
    };
    if (values.tin) {
        const tin = digits(values.tin, 'Matching-only TIN');
        requireThat(tin.length === 9, 'Matching-only TIN must have nine digits');
        result.tin = digest('tin', tin);
    }
    if (values.bankRouting || values.bankAccount) {
        const routing = digits(values.bankRouting, 'Matching-only routing number'), account = digits(values.bankAccount, 'Matching-only bank account');
        requireThat(routing.length === 9 && account.length >= 4 && account.length <= 17, 'Matching-only bank identity needs a nine-digit routing number and a 4–17 digit account');
        result.bank = digest('bank', routing + ':' + account);
    }
    return result;
}
export function supplierPublicValue(supplier: Data, protectedView?: Data | number): Data {
    const { matching, matchingNotRestored, sourceRedaction, protectedOnFile, ...value } = supplier;
    return { ...value, ...(matchingNotRestored?{matchingStatus:'Not restored – re-enter'}:{}), ...(protectedView && typeof protectedView === 'object' && Object.keys(protectedView).length ? { protectedData: protectedView } : {}), ...(sourceRedaction ? { sourceRedaction: { redactedColumns: sourceRedaction.redactedColumns } } : {}), matchingOnly: { tin: Boolean(matching?.tin), bank: Boolean(matching?.bank) } };
}
export function canonicalSupplier(s: State, id: string) {
    const seen = new Set<string>();
    let supplier = get(s, 'supplier', id);
    while (supplier.mergedInto) {
        requireThat(!seen.has(supplier.id), 'Supplier merge cycle', 409);
        seen.add(supplier.id); supplier = get(s, 'supplier', supplier.mergedInto);
    }
    return supplier.id as string;
}

/** Standalone reviews and rejected or erased proposal history never confer purchasing authority. */
export function hasSupplierReviewHold(s: State, id: string) {
    const proposal = s.get('supplierProposal:' + id)?.value;
    return Boolean(proposal && (proposal.source === 'standalone' || proposal.status !== 'pending' || proposal.erasure));
}
