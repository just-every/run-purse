export type ImportJob = { id: string; principalId: string; mappingVersion: string; fingerprint: string };
export type RestoredImport = { id: string; metadata: string; part: number; sha256: string };
export function restoredImports(db: D1Database, jobs: ImportJob[]): Promise<Map<string, RestoredImport>>;

export function validateHistoricalImports(all: (kind: string) => any[], get: (kind: string, id: string) => any, check: (value: any, code: string) => void): void;
