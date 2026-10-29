import test from 'node:test';
import {agreementsFlow} from './agreements-flow.mjs';
import {agreement_readingFlow} from './agreement-reading-flow.mjs';
import {agreement_savingsFlow} from './agreement-savings-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("agreements through public purchasing doors", async()=>{
 await agreementsFlow();
 await agreement_readingFlow();
 await agreement_savingsFlow();
});
