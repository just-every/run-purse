import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('the demo seeds its sample workspace on the first request without fetching the screening list', async t => {
 let fetched=0
 const h=await harness({worker:'tests/demo-worker.ts',ofac:()=>{fetched++;throw new Error('The demo seed must not fetch the live screening list')}})
 t.after(()=>h.close())
 await h.configureMail({RER_DEMO:'1'})
 const {data}=await h.state()
 assert.equal(fetched,0)
 assert.ok(data.supplier.length&&data.supplier.every(supplier=>supplier.screenings.length),'every seeded supplier keeps a screening result')
 assert.ok(data.order.length,'seeded orders were raised against those suppliers')
})
