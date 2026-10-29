import test from 'node:test';
import {email_intakeFlow} from './email-intake-flow.mjs';
import {integration_tokensFlow} from './integration-tokens-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("intake through public purchasing doors", async()=>{
 await email_intakeFlow();
 await integration_tokensFlow();
});
