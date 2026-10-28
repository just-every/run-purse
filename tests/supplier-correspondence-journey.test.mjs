import test from 'node:test';
import {order_sendFlow} from './order-send-flow.mjs';
import {order_threadFlow} from './order-thread-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("supplier correspondence through public purchasing doors", async()=>{
 await order_sendFlow();
 await order_threadFlow();
});
