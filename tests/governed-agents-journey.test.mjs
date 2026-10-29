import test from 'node:test';
import {agent_valueFlow} from './agent-value-flow.mjs';
import {agent_value_checkinsFlow} from './agent-value-checkins-flow.mjs';
import {coding_agentFlow} from './coding-agent-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("governed agents through public purchasing doors", async()=>{
 await agent_valueFlow();
 await agent_value_checkinsFlow();
 await coding_agentFlow();
});
