import test from 'node:test';
import {budget_importFlow} from './budget-import-flow.mjs';
import {cross_team_reviewsFlow} from './cross-team-reviews-flow.mjs';
import {commentsFlow} from './comments-flow.mjs';

// Whole business flow through authenticated HTTP, real D1, original files and native archive/transport doors.
test("collaboration through public purchasing doors", async()=>{
 await budget_importFlow();
 await cross_team_reviewsFlow();
 await commentsFlow();
});
