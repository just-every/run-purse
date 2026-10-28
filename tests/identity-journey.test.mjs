import test from 'node:test';
import {accessFlow} from './access-flow.mjs';
import {identityFlow} from './identity-flow.mjs';
import {scimFlow} from './scim-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("identity through public purchasing doors", async()=>{
 await accessFlow();
 await identityFlow();
 await scimFlow();
});
