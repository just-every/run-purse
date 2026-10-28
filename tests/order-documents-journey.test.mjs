import test from 'node:test';
import {po_generationFlow} from './po-generation-flow.mjs';
import {po_documentsFlow} from './po-documents-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("order documents through public purchasing doors", async()=>{
 await po_generationFlow();
 await po_documentsFlow();
});
