import test from 'node:test';
import {travelFlow} from './travel-purchasing-flow.mjs';
import {travel_routingFlow} from './travel-routing-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("travel through public purchasing doors", async()=>{
 await travelFlow();
 await travel_routingFlow();
});
