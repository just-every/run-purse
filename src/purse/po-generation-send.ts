import type { Bindings } from '../auth.server';
import { poGenerationAuthority } from './po-generation-authority';
import { sendOrderChange } from './order-send';
import { load } from './store';
import { all, Fault, get } from './types';

/** The durable native send claim precedes the provider call. A lost outcome
 * remains uncertain and is never claimed a second time by this scheduler. */
export async function sendGeneratedOrders(env: Bindings) {
    const initial=await load(env.DB);
    for (const candidate of all(initial.state,'order').filter(order=>order.generation && order.status==='issued')) {
        const {state}=await load(env.DB),order=get(state,'order',candidate.id);
        if (all(state,'orderSend').some(event=>event.order===order.id)) continue;
        const policy=state.get('poGenerationPolicy:'+order.generation.policy)?.value;
        if (!policy?.enabled || !policy.automaticSending || policy.version!==order.generation.policyVersion) continue;
        try {
            const {actor}=await poGenerationAuthority(env,state,policy,get(state,'request',order.request));
            const recipient=get(state,'supplier',order.supplier).contacts?.[0]?.email?.toLowerCase();
            if (!recipient) continue;
            await sendOrderChange(env,actor,{order:order.id,revision:order.revision,recipient,consent:true,
                reason:'Owner-consented automatic sending under standing rule version '+policy.version},
                {policy:policy.id,version:policy.version});
        } catch(error) {
            // Changed authority or source is a hold; no capability or mail claim
            // was created. Unexpected storage and provider-adapter errors surface.
            if (!(error instanceof Fault)) throw error;
        }
    }
}
