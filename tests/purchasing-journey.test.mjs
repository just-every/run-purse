import test from 'node:test';
import {customFieldsFlow} from './custom-fields-flow.mjs';
import {purseFlow} from './purse-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("purchasing through public purchasing doors", async()=>{
 await purseFlow();
 await customFieldsFlow();
});
