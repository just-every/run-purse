import type { Data } from './types';

const orderKinds = ['shipmentReference', 'orderSend', 'orderAcknowledgment', 'orderSupplierResponse', 'orderThreadMessage'];
const stores: { store: string; covers: (field: Data) => boolean }[] = [
 { store: 'Supplier tax review actors, reasons and private W-9 bindings', covers: f => f.kind === 'supplierTaxReview' },
 { store: 'Cross-team review assignments, questions, decisions and files', covers: f => f.kind === 'crossTeamReview' },
 { store: 'Internal comment authors, mentions, versions and notices', covers: f => ['comment','commentNotice','notificationRequestHead','notificationMailEvent','notificationPreference','notificationDelivery','notification'].includes(f.kind) },
 { store: 'Order-send recipients, stated acknowledgment names and responses', covers: f => orderKinds.includes(f.kind) || (f.kind === 'order' && f.path.some((p: unknown) => /acknowledg/i.test(String(p)))) },
 { store: 'Traveler and assistant identities', covers: f => f.kind.startsWith('travel') || f.path.some((p: unknown) => /travel|assistant/i.test(String(p))) },
 { store: 'Pantry-held contact fields', covers: f => f.kind === 'pantrySync' || f.path.some((p: unknown) => /pantry/i.test(String(p))) },
 { store: 'Scenario and agreement consent actors and emails', covers: f => /^recurringScenario|^recurringNotice|^recurringDiscovery|^agreementDisposition/.test(f.kind) },
];
/** Value-free counts per reviewed personal store; a store with none still appears, so the owner sees it was checked. */
export const erasureCoverage = (fields: Data[]) => stores.map(({ store, covers }) => ({ store, fields: fields.filter(covers).length }));
