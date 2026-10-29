import test from 'node:test';
import {order_adoptionFlow} from './order-adoption-flow.mjs';
import {searchFlow} from './search-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("move in through public purchasing doors", async()=>{
 await order_adoptionFlow();
 await searchFlow();
});
