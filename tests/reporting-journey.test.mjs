import test from 'node:test';
import {spend_reportFlow} from './spend-report-flow.mjs';
import {saved_reportsFlow} from './saved-reports-flow.mjs';
import {performance_reportFlow} from './performance-report-flow.mjs';
import {accrual_reportFlow} from './accrual-report-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("reporting through public purchasing doors", async()=>{
 await spend_reportFlow();
 await saved_reportsFlow();
 await performance_reportFlow();
 await accrual_reportFlow();
});
