import test from 'node:test';
import {audit_logFlow} from './audit-log-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("erasure through public purchasing doors", async()=>{
 await audit_logFlow();
});
