export const permissions = [
    'access.manage', 'procurement.manage', 'request.create', 'request.read', 'request.edit', 'request.approve',
    'po.read', 'po.convert', 'po.issue', 'receive', 'invoice.read', 'invoice.capture', 'invoice.review',
    'payable.terms', 'payable.approve', 'cash.read', 'report.read', 'performance.read',
    'audit.read', 'audit.export', 'rfq.manage', 'rfq.read', 'intake.admin',
] as const;
export type Permission = typeof permissions[number];
const reads: Permission[] = ['request.read', 'po.read', 'invoice.read', 'cash.read', 'report.read', 'performance.read', 'rfq.read'];
export const builtinPermissions: Record<string, readonly Permission[]> = {
    owner: permissions,
    admin: ['access.manage', 'intake.admin', ...reads],
    requester: ['request.create', 'request.read', 'request.edit', 'po.read', 'report.read'],
    approver: ['request.read', 'request.approve', 'po.read', 'report.read'],
    buyer: ['procurement.manage', 'request.create', 'request.read', 'request.edit', 'po.read', 'po.convert', 'po.issue', 'receive', 'invoice.read', 'invoice.capture', 'invoice.review', 'payable.terms', 'payable.approve', 'cash.read', 'report.read', 'performance.read', 'rfq.manage', 'rfq.read'],
    receiver: ['request.read', 'po.read', 'receive'],
    'ap-clerk': ['request.read', 'po.read', 'invoice.read', 'invoice.capture', 'invoice.review', 'payable.terms', 'payable.approve', 'cash.read', 'report.read', 'performance.read', 'rfq.read'],
    'finance-viewer': reads,
    auditor: [...reads, 'audit.read', 'audit.export'],
};
export const builtinRoles = Object.keys(builtinPermissions);
export const rolePermission: Record<string, Permission> = {
    admin: 'access.manage', buyer: 'procurement.manage', requester: 'request.create', approver: 'request.approve', receiver: 'receive',
    'ap-clerk': 'invoice.capture', 'finance-viewer': 'cash.read', auditor: 'audit.read',
};
export const scopeDimensions = ['departments', 'locations', 'projects', 'entities'] as const;
export type AccessScope = Partial<Record<typeof scopeDimensions[number], string[]>>;
export type BuyerLimit = { absoluteMinor?: number; percent?: number; quantityPercent?: number; unlimited?: boolean };
export type AccessGrant = { role: string; permissions: string[]; scope: AccessScope; departmentRead?: boolean; limits?: BuyerLimit; roleScope?: AccessScope };
