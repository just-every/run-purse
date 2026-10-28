import test from 'node:test';
import {blanket_ordersFlow} from './blanket-orders-flow.mjs';
import {order_closureFlow} from './order-closure-flow.mjs';
import {receipt_routingFlow} from './receipt-routing-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("service orders through public purchasing doors", async()=>{
 await blanket_ordersFlow();
 await order_closureFlow();
 await receipt_routingFlow();
});
