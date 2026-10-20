import { command } from './purse/api'
import { load } from './purse/store'
import { hashRfqToken } from './purse/rfq-links'
import { audit, type Actor, type Data } from './purse/types'
import type { Bindings } from './auth.server'

const zone = 'America/Chicago'
/** The UTC instant of a wall-clock time in Central time (CDT or CST as the date falls). */
function central(y: number, m: number, d: number, h: number, min: number) {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const offset = (t: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map(x => [x.type, Number(x.value)])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t }
  const first = guess - offset(guess)
  return guess - offset(first)
}
/** The demo's morning: the most recent Tuesday at 10:30 am Central at or before now, so the thread's weekdays stay true. */
function tuesdayMorning(now: Date) {
  for (let back = 0; back < 8; back++) {
    const day = new Date(now.getTime() - back * 86_400_000)
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(day).map(x => [x.type, x.value]))
    const at = central(Number(p.year), Number(p.month), Number(p.day), 10, 30)
    if (p.weekday === 'Tue' && at <= now.getTime()) return { y: Number(p.year), m: Number(p.month), d: Number(p.day) }
  }
  throw new Error('No Tuesday in the last week')
}

/** Demo data for `rer demo` and the hosted demo (Base modules/demo runs it once, after the owner exists):
 * Redbud Outdoor Co., 260 people in Austin TX and Columbus OH, buying for four teams, built by Purse's own
 * commands as its people would have made it: suppliers, catalog, a monthly budget per team, a few weeks of
 * received and invoiced orders, Monday's requests decided, and Tuesday morning's requests still open in the
 * thread, Marketing's two together over its October budget. It never fetches. A workspace that already has a
 * business is left as it is, and every row is written with ON CONFLICT DO NOTHING, so a repeat changes nothing. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  const row = await env.DB.prepare("SELECT id, version FROM oa_operators WHERE email = ? AND role = 'owner'").bind(ownerEmail.toLowerCase()).first<{ id: string; version: number }>()
  if (!row) throw new Error('The demo owner does not exist yet')
  const { state } = await load(env.DB)
  if (state.has('business:main')) return
  const before = new Map(state)
  const owner: Actor = { id: row.id, email: ownerEmail.toLowerCase(), session: '', version: row.version, owner: true, dev: false }
  const person = (name: string, local: string, roles: string[]) => { const email = `${local}@redbud-outdoor.example`; return { name, email, roles, actor: { id: `demo-${local}`, email, session: '', version: 1, owner: false, dev: false } as Actor } }
  const ray = person('Ray Dawson', 'ray.dawson', ['approver'])
  const carla = person('Carla Mendes', 'carla.mendes', ['approver'])
  const sam = person('Sam Okafor', 'sam.okafor', ['approver'])
  const priya = person('Priya Shah', 'priya.shah', ['buyer'])
  const tasha = person('Tasha Green', 'tasha.green', ['receiver'])
  const megan = person('Megan Foster', 'megan.foster', ['requester', 'receiver'])
  const luis = person('Luis Ortega', 'luis.ortega', ['requester', 'receiver'])
  const kim = person('Kim Nguyen', 'kim.nguyen', ['requester'])
  const jamal = person('Jamal Brooks', 'jamal.brooks', ['requester'])
  const nikhil = person('Nikhil Rao', 'nikhil.rao', ['requester'])
  const ana = person('Ana Ruiz', 'ana.ruiz', ['requester'])

  // Every step runs now and is then moved to its Central wall-clock time, `day` days from the demo's Tuesday.
  const tue = tuesdayMorning(now)
  const at = (day: number, time: string) => { const [h, min] = time.split(':').map(Number); return central(tue.y, tue.m, tue.d + day, h, min) }
  const date = (day: number) => new Date(Date.UTC(tue.y, tue.m - 1, tue.d + day)).toISOString().slice(0, 10)
  async function on(when: number, actor: Actor, op: string, body: Data): Promise<Data> {
    const start = new Date().toISOString(), seen = new Map([...state].map(([k, r]) => [k, r.revision]))
    const result = await command(state, actor, op, body)
    const iso = new Date(when).toISOString()
    for (const [k, r] of state) if (seen.get(k) !== r.revision)
      for (const field of ['at', 'generatedAt', 'issuedAt']) if (typeof r.value[field] === 'string' && r.value[field] >= start) r.value[field] = iso
    return result
  }

  const setup = at(-30, '9:00')
  await on(setup, owner, 'business', { name: 'Redbud Outdoor Co.', timezone: zone, currencies: ['USD'], locations: ['Austin, TX', 'Columbus, OH'], costCentres: ['Operations', 'Marketing', 'Engineering', 'Facilities'], projects: ['Operations', 'Marketing', 'Engineering', 'Facilities'] })
  for (const [location, street, dock] of [['Austin, TX', '1200 E 6th St, Austin, TX 78702', 'Front desk, Megan Foster'], ['Columbus, OH', '4300 Alum Creek Dr, Columbus, OH 43207', 'Dock 3, Tasha Green']])
    await on(setup, owner, 'po-profile', { version: 0, location, purchaseType: '*', legalName: 'Redbud Outdoor Co.', billTo: { name: 'Redbud Outdoor Co. Accounts Payable', address: '1200 E 6th St, Austin, TX 78702', label: 'Bill to' }, shipTo: { name: 'Redbud Outdoor Co.', address: street, attention: dock, label: 'Ship to' }, buyerContact: 'Priya Shah · priya.shah@redbud-outdoor.example', shippingTerms: 'FOB destination, freight prepaid', standardTerms: 'Ship only the quantities on this PO and tell the buyer of any delay before the need date. Invoice once per shipment and quote this PO number.' })
  await on(setup, owner, 'member', { email: owner.email, name: 'Renee Coleman', roles: ['requester', 'approver', 'buyer', 'receiver'], active: true })
  for (const p of [ray, carla, sam, priya, tasha, megan, luis, kim, jamal, nikhil, ana]) await on(setup, owner, 'member', { email: p.email, name: p.name, roles: p.roles, active: true })

  const supplier = async (name: string, status: string, reason: string, contact: [string, string], extra: Data = {}) =>
    (await on(at(-29, '10:00'), priya.actor, 'supplier', { name, status, reason, contacts: [{ name: contact[0], email: contact[1] }], ...extra })).id as string
  const cdw = await supplier('CDW', 'preferred', 'IT hardware under the Redbud account agreement', ['Account team', 'redbud@cdw-orders.example'], { contractRef: 'RB-AG-102', renewal: date(70) })
  const uline = await supplier('Uline', 'preferred', 'Shipping supplies for the Columbus dock', ['Customer service', 'orders@uline-orders.example'], { contractRef: 'RB-AG-087', renewal: date(41) })
  const amazon = await supplier('Amazon Business', 'preferred', 'Consumables and small equipment on the business account', ['Business account', 'redbud@amazon-business.example'])
  const grainger = await supplier('Grainger', 'active', 'Maintenance and HVAC parts for both sites', ['Branch desk', 'austin@grainger-orders.example'])
  const keystone = await supplier('Keystone Tech', 'active', 'Laptops and docks for Engineering', ['Dev Malhotra', 'sales@keystonetech.example'], { contractRef: 'RB-AG-115', renewal: date(16) })
  const hartwell = await supplier('Hartwell Supply', 'active', 'Wire shelving for the Columbus aisles', ['Order desk', 'orders@hartwellsupply.example'])
  const lonestar = await supplier('Lone Star Displays', 'active', 'Booth kit for the Gulf Coast Outdoor Expo; onboarded Mon with W-9 and COI', ['Rosa Vega', 'rosa@lonestardisplays.example'])
  const brazos = await supplier('Brazos Office Furniture', 'active', 'Standing desks for the Austin office', ['Trade desk', 'trade@brazosoffice.example'])
  const hillcountry = await supplier('Hill Country Print Co.', 'active', 'Banner stands and printed graphics', ['Studio', 'studio@hillcountryprint.example'])
  const freightways = await supplier('Texas Freightways', 'active', 'Freight between Austin, Houston and Columbus', ['Dispatch', 'dispatch@texasfreightways.example'])
  const gulfpromo = await supplier('Gulf Coast Promo Co.', 'active', 'Branded giveaways for events', ['Order desk', 'orders@gulfcoastpromo.example'])
  await supplier('Pinnacle Pallet Co.', 'blocked', 'Two short shipments in September; on hold pending review', ['Sales', 'sales@pinnaclepallet.example'])

  const item = async (description: string, s: string, unitAmount: string, category: string, unit: string, partNumber: string) => (await on(at(-28, '11:00'), priya.actor, 'catalogue', { description, supplier: s, currency: 'USD', unitAmount, category, unit, partNumber, approved: true })).id as string
  const dock = await item('Belkin USB-C dock', cdw, '179.00', 'IT equipment', 'each', 'INC004')
  const labels = await item('Pallet labels, 4 × 6 in, roll of 500', uline, '34.00', 'Shipping supplies', 'roll', 'S-5191')
  const wrap = await item('Stretch wrap, 18 in × 1,500 ft', uline, '34.50', 'Shipping supplies', 'roll', 'S-1957')
  const gloves = await item('Nitrile gloves, box of 100', amazon, '24.50', 'Safety supplies', 'box', 'B07NITRILE')
  const filter = await item('HVAC filter, MERV 13, 20 × 25 × 2 in', grainger, '26.50', 'Maintenance', 'each', '5W992')

  const policy = async (name: string, project: string, approver: string, limitAmount: string, budgetAmount: string) => (await on(at(-28, '12:00'), owner, 'policy', { name, currency: 'USD', category: '*', project, limitAmount, budgetAmount, approver })).id as string
  await policy('Operations · October', 'Operations', ray.email, '10,000.00', '48,000.00')
  await policy('Marketing · October', 'Marketing', owner.email, '10,000.00', '18,500.00')
  await policy('Engineering · October', 'Engineering', owner.email, '15,000.00', '32,000.00')
  await policy('Facilities · October', 'Facilities', owner.email, '10,000.00', '22,000.00')

  // Slack and Teams post requests through integration tokens, each bound to its requester.
  const tokens: Data[] = []
  const integration = (name: string, p: { email: string; actor: Actor }) => { const t = { id: crypto.randomUUID(), name, requester: p.actor.id, requesterEmail: p.email }; tokens.push(t); return t }
  const anaSlack = integration('Slack', ana), jamalSlack = integration('Slack', jamal), nikhilTeams = integration('Teams', nikhil)

  type Line = { description?: string; catalogue?: string; quantity: string; unitAmount?: string; category?: string; project: string }
  async function request(when: number, by: { actor: Actor }, title: string, s: string, need: number, location: string, team: string, lines: Line[], extra: Data = {}, via?: Data) {
    const r = await on(when, by.actor, 'request', { title, supplier: s, currency: 'USD', needDate: date(need), location, costCentre: team, lines: lines.map(l => ({ ...l, project: l.project || team })), freightAmount: '0', taxAmount: '0', terms: 'Supplier quote, net 30 from invoice', ...extra })
    if (!via) return r
    const key = `request:${r.id}`, value = { ...state.get(key)!.value, integration: via }
    state.set(key, { ...state.get(key)!, revision: crypto.randomUUID(), value })
    const revisionKey = `revision:${r.id}:${r.revision}`
    state.set(revisionKey, { ...state.get(revisionKey)!, revision: crypto.randomUUID(), value: { ...state.get(revisionKey)!.value, integration: via } })
    audit(state, { ...by.actor, id: `integration:${via.id}` }, 'integration-request-create', r.id, { integration: via.id, requester: via.requester })
    const iso = new Date(when).toISOString()
    for (const [k, row] of state) if (row.kind === 'audit' && row.value.action === 'integration-request-create' && row.value.record === r.id) state.set(k, { ...row, value: { ...row.value, at: iso } })
    return value
  }
  const submit = (when: number, by: { actor: Actor }, r: Data) => on(when, by.actor, 'submit', { id: r.id, revision: r.revision })
  const decide = (when: number, by: Actor, r: Data, decision: string, reason: string) => on(when, by, 'decision', { id: r.id, revision: r.revision, decision, reason })
  const raise = (when: number, r: Data) => on(when, priya.actor, 'convert', { id: r.id, revision: r.revision })
  const issue = (when: number, o: Data, channel: string) => on(when, priya.actor, 'issue', { id: o.id, revision: o.revision, reason: channel })
  const receive = (when: number, by: Actor, o: Data, line: number, quantity: string, event = 'receive', reason = 'Counted and checked in') => on(when, by, 'receipt', { order: o.id, line: o.lines[line].id, event, quantity, reason })
  const bill = (when: number, o: Data, reference: string, amounts: [number, string, string][]) => on(when, priya.actor, 'invoice', { order: o.id, reference, source: 'Supplier invoice emailed to ap@redbud-outdoor.example', allocations: amounts.map(([line, quantity, amount]) => ({ line: o.lines[line].id, quantity, amount })) })
  /** Asked, submitted, approved, raised and issued: an order on its way. */
  async function ordered(r: Data, approver: Actor, days: [number, string][], channel = 'Emailed to the supplier contact') {
    await submit(at(...days[0]), { actor: { ...owner, id: r.requester, email: r.requesterEmail, owner: false } }, r)
    await decide(at(...days[1]), approver, r, 'approved', 'In budget, known supplier and the quoted price')
    const o = await raise(at(...days[2]), r)
    return days[3] ? issue(at(...days[3]), o, channel) : o
  }

  // Weeks before: received and invoiced, one short shipment billed in full.
  const oldLabels = await request(at(-27, '8:40'), kim, 'Pallet labels for the Columbus dock, ten rolls.', uline, -20, 'Columbus, OH', 'Operations', [{ catalogue: labels, quantity: '10', project: 'Operations' }])
  const oldLabelsOrder = await ordered(oldLabels, ray.actor, [[-27, '8:42'], [-27, '9:10'], [-27, '9:30'], [-27, '9:34']])
  await receive(at(-22, '7:50'), tasha.actor, oldLabelsOrder, 0, '10')
  await bill(at(-21, '13:15'), oldLabelsOrder, 'UL-55120', [[0, '10', '340.00']])
  const monitors = await request(at(-20, '10:05'), nikhil, 'Monitors for the new Austin desks.', cdw, -12, 'Austin, TX', 'Engineering', [{ description: 'Dell 27 in USB-C monitor P2725HE', quantity: '6', unitAmount: '249.00', category: 'IT equipment', project: 'Engineering' }], {}, nikhilTeams)
  const monitorsOrder = await ordered(monitors, owner, [[-20, '10:07'], [-20, '11:30'], [-20, '11:45'], [-20, '11:50']])
  await receive(at(-14, '11:20'), megan.actor, monitorsOrder, 0, '6')
  await bill(at(-13, '9:05'), monitorsOrder, 'CDW-7731904', [[0, '6', '1,494.00']])
  const shelving = await request(at(-13, '14:10'), luis, 'Wire shelving for aisle 14 in Columbus.', hartwell, -6, 'Columbus, OH', 'Facilities', [{ description: 'Wire shelving unit, 48 × 24 × 74 in', quantity: '12', unitAmount: '389.00', category: 'Warehouse equipment', project: 'Facilities' }], { freightAmount: '180.00' })
  const shelvingOrder = await ordered(shelving, owner, [[-13, '14:12'], [-13, '16:40'], [-12, '9:15'], [-12, '9:20']])
  await receive(at(-6, '8:35'), tasha.actor, shelvingOrder, 0, '10', 'receive', '10 of 12 in; 2 back-ordered by Hartwell')
  await bill(at(-5, '10:40'), shelvingOrder, 'HS-88107', [[0, '12', '4,668.00']])

  // Marketing's Expo orders: three out with suppliers, not yet delivered ($11,262.00 on order).
  const banners = await request(at(-8, '9:20'), ana, 'Banner stands and graphics for the Expo booth.', hillcountry, 18, 'Austin, TX', 'Marketing', [{ description: 'Roll-up banner stand with printed graphic', quantity: '6', unitAmount: '879.00', category: 'Event materials', project: 'Marketing' }], {}, anaSlack)
  await ordered(banners, owner, [[-8, '9:22'], [-8, '11:05'], [-7, '9:00'], [-7, '9:04']])
  const freight = await request(at(-7, '15:30'), ana, 'Freight for the booth to Houston and back.', freightways, 21, 'Austin, TX', 'Marketing', [{ description: 'Booth freight Austin–Houston round trip, 2 pallets', quantity: '1', unitAmount: '1,988.00', category: 'Freight', project: 'Marketing' }], {}, anaSlack)
  await ordered(freight, owner, [[-7, '15:32'], [-6, '10:10'], [-6, '10:30'], [-6, '10:33']])
  const samples = await request(at(-6, '13:45'), ana, 'Sample kits to hand out at the Expo, 400 of them.', amazon, 17, 'Austin, TX', 'Marketing', [{ description: 'Trail sample kit, assembled', quantity: '400', unitAmount: '10.00', category: 'Event materials', project: 'Marketing' }], {}, anaSlack)
  await ordered(samples, owner, [[-6, '13:47'], [-5, '9:30'], [-5, '9:41'], [-5, '9:45']])

  // Monday: decided and on their way; they fold into "Earlier".
  const laptops = await request(at(-1, '9:16'), nikhil, 'Laptops for three new engineers.', keystone, 9, 'Austin, TX', 'Engineering', [{ description: 'ThinkPad T14s Gen 6, 32 GB', quantity: '3', unitAmount: '1,489.00', category: 'IT equipment', project: 'Engineering' }], {}, nikhilTeams)
  await ordered(laptops, owner, [[-1, '9:21'], [-1, '10:12'], [-1, '10:14'], [-1, '10:16']], 'Emailed to Keystone Tech; acknowledgment not yet received')
  const glovesReq = await request(at(-1, '9:05'), kim, 'Nitrile gloves for the dock, forty boxes.', amazon, 3, 'Columbus, OH', 'Operations', [{ catalogue: gloves, quantity: '40', project: 'Operations' }])
  await ordered(glovesReq, ray.actor, [[-1, '9:06'], [-1, '9:31'], [-1, '9:40'], [-1, '9:42']], 'Placed on the Amazon Business account')
  const wrapReq = await request(at(-1, '9:55'), jamal, 'Stretch wrap for the dock, 20 rolls.', uline, 4, 'Columbus, OH', 'Operations', [{ catalogue: wrap, quantity: '20', project: 'Operations' }], {}, jamalSlack)
  await ordered(wrapReq, ray.actor, [[-1, '9:56'], [-1, '9:58'], [-1, '10:20'], [-1, '10:22']])
  const booth = await request(at(-1, '9:32'), ana, 'Booth kit for the Gulf Coast Outdoor Expo.', lonestar, 16, 'Austin, TX', 'Marketing', [{ description: '10 × 10 ft booth kit with backwall and counter', quantity: '1', unitAmount: '3,940.00', category: 'Event materials', project: 'Marketing' }], {}, anaSlack)
  await ordered(booth, owner, [[-1, '9:34'], [-1, '11:02'], [-1, '11:20']])

  // Tuesday morning, as it comes in.
  const docks = await request(at(0, '9:48'), nikhil, 'Need a USB-C dock for the new hires, same as last time.', cdw, 10, 'Austin, TX', 'Engineering', [{ catalogue: dock, quantity: '3', project: 'Engineering' }], {}, nikhilTeams)
  await submit(at(0, '9:48'), nikhil, docks)
  const palletLabels = await request(at(0, '10:04'), kim, 'Pallet labels again please.', uline, 3, 'Columbus, OH', 'Operations', [{ catalogue: labels, quantity: '10', project: 'Operations' }])
  await submit(at(0, '10:05'), kim, palletLabels)
  await decide(at(0, '10:09'), ray.actor, palletLabels, 'approved', 'Repeat order at the catalog price')
  await raise(at(0, '10:15'), palletLabels)
  const giveaways = await request(at(0, '10:19'), ana, 'Giveaways for the Gulf Coast Outdoor Expo, 300 water bottles.', gulfpromo, 20, 'Austin, TX', 'Marketing', [{ description: 'Insulated water bottle, Redbud logo', quantity: '300', unitAmount: '6.54', category: 'Event materials', project: 'Marketing' }], { freightAmount: '100.00', terms: 'Gulf Coast Promo quote GCP-4471, net 30' }, anaSlack)
  await submit(at(0, '10:19'), ana, giveaways)
  const desks = await request(at(0, '10:23'), luis, "Eight standing desks for the Austin office; Marketing's half is these four.", brazos, 14, 'Austin, TX', 'Marketing', [{ description: 'Electric standing desk, 60 × 30 in', quantity: '4', unitAmount: '412.00', category: 'Furniture', project: 'Marketing' }], { terms: 'Brazos quote BOF-2208; delivery Tue ' + date(14) })
  await submit(at(0, '10:24'), luis, desks)
  const filters = await request(at(0, '10:27'), megan, 'Replacement filters for the Austin HVAC.', grainger, 3, 'Austin, TX', 'Facilities', [{ catalogue: filter, quantity: '12', project: 'Facilities' }])
  await submit(at(0, '10:27'), megan, filters)

  const written = [...state.values()].filter(r => before.get(`${r.kind}:${r.id}`)?.revision !== r.revision)
  const unusable = async () => hashRfqToken(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
  await env.DB.batch([
    ...written.map(r => env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO NOTHING').bind(r.business, r.kind, r.id, r.revision, JSON.stringify(r.value))),
    // The tokens' secrets are never shown; the owner rotates one in Settings to connect a workspace.
    ...await Promise.all(tokens.map(async t => env.DB.prepare('INSERT INTO p_integration_tokens(id,hash,name,requester,requester_email,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(t.id, await unusable(), t.name, t.requester, t.requesterEmail, new Date(setup).toISOString()))),
    env.DB.prepare('INSERT INTO oa_first_run (singleton, completed_by, completed_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, setup),
  ])
}
