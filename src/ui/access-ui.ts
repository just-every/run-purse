import { amountText, money, type D } from './shared';

export const roleLabels: Record<string, string> = {
    owner: 'Native owner', admin: 'Administrator', requester: 'Requester', approver: 'Approver', buyer: 'Buyer',
    receiver: 'Receiver', 'ap-clerk': 'AP clerk', 'finance-viewer': 'Finance viewer', auditor: 'Read-only auditor',
};
export const permissionLabels: Record<string, string> = {
    'access.manage': 'Manage custom roles', 'procurement.manage': 'Manage purchasing setup',
    'request.create': 'Create requests', 'request.read': 'View requests', 'request.edit': 'Edit requests', 'request.approve': 'Approve requests',
    'po.read': 'View purchase orders', 'po.convert': 'Convert approved requests', 'po.issue': 'Issue purchase orders', receive: 'Receive goods',
    'invoice.read': 'View invoices', 'invoice.capture': 'Record invoice evidence', 'invoice.review': 'Review invoice risks',
    'payable.terms': 'Record payable terms', 'payable.approve': 'Approve cash planning', 'cash.read': 'View cash planning',
    'report.read': 'View spend reports', 'performance.read': 'View supplier performance', 'audit.read': 'Read audit history',
    'audit.export': 'Export audit history', 'rfq.manage': 'Manage quote requests', 'rfq.read': 'View quote requests', 'intake.admin': 'Manage email intake',
};
export const scopeLabels = { departments: 'departments', locations: 'locations', projects: 'projects', entities: 'entities' };
export const memberGrants = (member: D): D[] => member.grants ?? (member.roles ?? []).map((role: string) => ({ role }));
export const scopeSummary = (scope: D = {}) => Object.entries(scope).map(([dimension, values]) => (scopeLabels[dimension as keyof typeof scopeLabels] ?? 'scope') + ': ' + (values as string[]).map(value => dimension === 'entities' && value === 'main' ? 'Main business' : value).join(', ')).join(' · ') || 'All departments, locations, projects and entities';
export function limitSummary(limit: D | undefined, currency: string) {
    if (!limit) return 'No configured increase allowance';
    const price = [limit.absoluteMinor !== undefined ? money(limit.absoluteMinor, currency) : undefined, limit.percent !== undefined ? limit.percent + '%' : undefined].filter(Boolean).join(' or ');
    return (price ? price + ' price increase' : 'No price increase allowance') + '; ' + (limit.quantityPercent ?? 0) + '% quantity increase';
}
export const dollarText = (value: number | undefined) => value === undefined ? '' : amountText(value);
function dollars(value: string) {
    if (value.length > 100 || !/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative dollar limit with up to two decimal places.');
    const [whole, fraction = ''] = value.replaceAll(',', '').split('.'), minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (minor > 1000000000000n) throw new Error('Dollar limit exceeds the supported amount.');
    return Number(minor);
}
export function limitInput(input: D, prefix: string) {
    const result: D = {};
    for (const field of ['absoluteMinor', 'percent', 'quantityPercent']) {
        const value = String(input[prefix + field] ?? '').trim(); if (!value) continue;
        if (field === 'absoluteMinor') result[field] = dollars(value);
        else {
            if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 10000) throw new Error('Enter a nonnegative percentage up to 10,000.');
            result[field] = Number(value);
        }
    }
    if (!Object.keys(result).length) throw new Error('Enter at least one buyer limit. Zero is an explicit limit.');
    return result;
}
