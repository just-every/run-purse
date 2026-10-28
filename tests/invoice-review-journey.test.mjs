import test from 'node:test';
import {invoice_inboxFlow} from './invoice-inbox-flow.mjs';
import {invoice_readingFlow} from './invoice-reading-flow.mjs';
import {invoice_riskFlow} from './invoice-risk-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("invoice review through public purchasing doors", async()=>{
 await invoice_inboxFlow();
 await invoice_readingFlow();
 await invoice_riskFlow();
});
