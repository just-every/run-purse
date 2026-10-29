import test from 'node:test';
import {supplier_screeningFlow} from './supplier-screening-flow.mjs';
import {supplier_duplicatesFlow} from './supplier-duplicates-flow.mjs';
import {supplier_documentsFlow} from './supplier-documents-flow.mjs';
import {supplier_performanceFlow} from './supplier-performance-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("supplier trust through public purchasing doors", async()=>{
 await supplier_screeningFlow();
 await supplier_duplicatesFlow();
 await supplier_documentsFlow();
 await supplier_performanceFlow();
});
