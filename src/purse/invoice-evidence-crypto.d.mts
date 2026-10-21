export function digest(value: any): string;
export function mac(secret: string, domain: string, value: any): string;
export function retainedEvidence(invoice: any): any;
export function legacyHash(secret: string, invoice: any, bank: string | null): string;
export function v2Hash(secret: string, invoice: any, bankBinding?: string | null): string;
export function attestation(secret: string, invoice: any): string;
export function classifyLegacyEvidence(root: string, invoice: any, baseline?: string | null): string;
