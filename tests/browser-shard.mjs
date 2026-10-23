import assert from 'node:assert/strict';

// Each shard retains the real purchase/import fixture and the complete archive
// refusal, equality and continuation checks in browser.mjs. Invoice reading is
// their one shared domain prerequisite: the restored search check must resolve
// a real reviewed source, including in the dedicated archive shard.
export const browserJourneys = Object.freeze(["archive", "supplier-performance", "catalogue", "order-chasing", "supplier-documents", "supplier-duplicates", "payables", "audit-log", "spend-report", "po-documents", "performance-report", "invoice-risk", "receipt-routing", "quote-reading", "rfq", "invoice-reading", "invoice-inbox", "email-intake", "search", "agreements", "integration-tokens", "agent-value", "quote-agent", "order-adoption", "protected-storage", "protected-preparation"]);

export function browserShard(args) {
 const selectors=args.filter(arg=>arg.startsWith('--journey='));
 assert.ok(selectors.length<=1,'Select one browser journey per shard');
 const name=selectors[0]?.slice('--journey='.length)??'all';
 assert.ok(name==='all'||browserJourneys.includes(name),'Unknown browser journey: '+name);
 assert.ok(name==='all'||!args.includes('--archive-only'),'Journey selection requires the real fresh fixture');
 return {name,includes:journey=>name==='all'||name===journey||journey==='invoice-reading'};
}
