import {prepareNativeSchedule} from './initialize-agent-door-owner.mjs'
export default async function(context) {
 return {values:{scheduledChase:await prepareNativeSchedule(context)}}
}
