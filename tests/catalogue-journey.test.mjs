import test from 'node:test';
import {catalogueFlow} from './catalogue-flow.mjs';
import {catalogue_importFlow} from './catalogue-import-flow.mjs';
import {stockroomFlow} from './stockroom-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("catalogue through public purchasing doors", async()=>{
 await catalogueFlow();
 await catalogue_importFlow();
 await stockroomFlow();
});
