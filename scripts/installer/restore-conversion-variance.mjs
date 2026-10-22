import { check, same, lineAmounts, purchasing } from './restore-validation.mjs';
import { accessObject, accessShape, accessText, validateBuyerLimit } from './restore-access.mjs';

const face = record => ({ lines: record.lines.map(({ sourceLine, ...line }) => line), freightMinor: record.freightMinor, taxMinor: record.taxMinor, totalMinor: record.totalMinor });
const immutableLine = ({ quantity, q, unitMinor, totalMinor, allocations, ...line }) => ({...line,...(allocations ? {allocations:allocations.map(({amountMinor,...share})=>share)} : {})});
function percentage(before, after, limit = 0) {
    if (after <= before) return true;
    const [coefficient, exponent = '0'] = String(limit).split('e'), [whole, fraction = ''] = coefficient.split('.'), power = Number(exponent) - fraction.length;
    const numerator = BigInt(whole + fraction) * (power > 0 ? 10n ** BigInt(power) : 1n), denominator = power < 0 ? 10n ** BigInt(-power) : 1n;
    return BigInt(after - before) * 100n * denominator <= BigInt(before) * numerator;
}
function limitProof(limit, before, after) {
    if (accessShape(limit, ['unlimited']) && limit.unlimited === true) return;
    validateBuyerLimit(limit);
    const price = (before, after) => after <= before || (limit.absoluteMinor !== undefined || limit.percent !== undefined)
        && (limit.absoluteMinor === undefined || after - before <= limit.absoluteMinor)
        && (limit.percent === undefined || percentage(before, after, limit.percent));
    check(price(before.totalMinor, after.totalMinor) && before.lines.every((line, index) => price(line.unitMinor, after.lines[index].unitMinor) && price(line.totalMinor, after.lines[index].totalMinor) && percentage(line.q, after.lines[index].q, limit.quantityPercent)), 'conversion_limit');
}
/** A recorded limit is historical purchasing evidence, never restored authority.
 * Only quantity/price changes may differ from the exact approved revision.
 */
export function validateConversionVariance(order, revision, all) {
    const variance = order.conversionVariance;
    check(accessShape(variance, ['before','after','limit','actor','email','at','reason','sourceRevision','sourceRequest']), 'conversion_variance');
    check(variance.sourceRequest === order.request && variance.sourceRevision === order.revision && variance.sourceRevision === revision.revision && !revision.imported, 'conversion_source');
    check(accessText(variance.actor) && accessText(variance.email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(variance.email) && accessText(variance.reason) && Number.isFinite(Date.parse(variance.at)), 'conversion_actor');
    check([variance.before, variance.after].every(value => accessShape(value, ['lines','freightMinor','taxMinor','totalMinor'])), 'conversion_face');
    check(same(variance.before, face(revision)) && same(variance.after, face(order)) && !same(variance.before, variance.after), 'conversion_snapshot');
    lineAmounts(variance.before); lineAmounts(variance.after);
    check(variance.before.lines.length === variance.after.lines.length && variance.before.lines.every((line, index) => same(immutableLine(line), immutableLine(variance.after.lines[index]))), 'conversion_line_identity');
    check(same(purchasing({ ...order, lines: variance.before.lines, totalMinor: variance.before.totalMinor }), purchasing(revision)), 'conversion_purchase_identity');
    check(order.location === revision.location && order.costCentre === revision.costCentre && (order.entity ?? 'main') === (revision.entity ?? 'main'), 'conversion_scope_identity');
    limitProof(variance.limit, variance.before, variance.after);
    const audit = all('audit');
    check(audit.some(event => event.action === 'buyer-conversion-edit' && event.record === order.id && event.request === order.request && Object.keys(variance).every(field => Object.hasOwn(event,field) && same(event[field], variance[field]))), 'conversion_edit_audit');
    check(audit.some(event => event.action === 'convert' && event.record === order.id && event.request === order.request && event.revision === order.revision && event.actor === variance.actor && event.email === variance.email && Number.isFinite(Date.parse(event.at))), 'conversion_create_audit');
    if (order.issuedAt) {
        check(Number.isFinite(Date.parse(order.issuedAt)) && accessText(order.issuedBy) && accessText(order.issueReason), 'conversion_issue');
        const issue = audit.find(event => event.action === 'issue' && event.record === order.id && event.revision === order.revision && event.actor === order.issuedBy && event.conversionSourceRevision === variance.sourceRevision && Number.isFinite(Date.parse(event.at)));
        check(issue && accessObject(issue.conversionLimit), 'conversion_issue_audit');
        limitProof(issue.conversionLimit, variance.before, variance.after);
    }
}
