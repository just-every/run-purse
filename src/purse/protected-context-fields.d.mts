export function containsProtectedInput(value: unknown): boolean;
export function stripProtectedInput(value: unknown): { value: any; removedFields: number };
export const preparationActions: string[];
export function executablePreparationAction(action: unknown): boolean;
export function unavailableProtectedTarget(kind: string, record: Record<string, any>): boolean;
export function hasUnsafeProtectedContext(kind: string, record: Record<string, any>): boolean;
