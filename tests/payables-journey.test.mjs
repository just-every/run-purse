import test from 'node:test';
import {supplier_invoiceFlow} from './supplier-invoice-flow.mjs';
import {payablesFlow} from './payables-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("payables through public purchasing doors", async()=>{
 await supplier_invoiceFlow();
 await payablesFlow();
});
