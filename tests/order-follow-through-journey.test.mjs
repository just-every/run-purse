import test from 'node:test';
import {order_chasingFlow} from './order-chasing-flow.mjs';
import {late_order_resolutionFlow} from './late-order-resolution-flow.mjs';
import {agent_governanceFlow} from './agent-governance-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("order follow through through public purchasing doors", async()=>{
 await order_chasingFlow();
 await late_order_resolutionFlow();
 await agent_governanceFlow();
});
