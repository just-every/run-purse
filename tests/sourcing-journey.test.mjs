import test from 'node:test';
import {rfqFlow} from './rfq-flow.mjs';
import {quote_readingFlow} from './quote-reading-flow.mjs';
import {quote_agentFlow} from './quote-agent-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("sourcing through public purchasing doors", async()=>{
 await rfqFlow();
 await quote_readingFlow();
 await quote_agentFlow();
});
