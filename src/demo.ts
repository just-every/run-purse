import { command } from './purse/api'
import { load } from './purse/store'
import type { Actor, Data } from './purse/types'
import type { Bindings } from './auth.server'

/** Demo data for `rer demo` and the hosted demo (Base modules/demo runs it once,
 * after the owner exists): Northside Studio's purchasing workspace, built by
 * Purse's own commands as its people would have made it over the last weeks:
 * suppliers, catalogue, policies the owner approves, and requests at every
 * stage from draft to received and invoiced. It never fetches. A workspace
 * that already has a business is left as it is, and every row is written
 * with ON CONFLICT DO NOTHING, so a repeat changes nothing. */
export async function seedDemo(env: Bindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  const row = await env.DB.prepare("SELECT id, version FROM oa_operators WHERE email = ? AND role = 'owner'").bind(ownerEmail.toLowerCase()).first<{ id: string; version: number }>()
  if (!row) throw new Error('The demo owner does not exist yet')
  const { state } = await load(env.DB)
  if (state.has('business:main')) return
  const before = new Map(state)
  const owner: Actor = { id: row.id, email: ownerEmail.toLowerCase(), session: '', version: row.version, owner: true, dev: false }
  const person = (name: string, email: string, roles: string[]) => ({ name, email, roles, actor: { id: `demo-${email.split('@')[0]}`, email, session: '', version: 1, owner: false, dev: false } as Actor })
  const maya = person('Maya Chen', 'maya.chen@northside-studio.example', ['requester', 'receiver'])
  const sam = person('Sam Ortiz', 'sam.ortiz@northside-studio.example', ['requester'])
  const tom = person('Tom Okafor', 'tom.okafor@northside-studio.example', ['buyer', 'receiver'])
  const priya = person('Priya Nair', 'priya.nair@northside-studio.example', ['approver'])
  const lena = person('Lena Fischer', 'lena.fischer@northside-studio.example', ['requester', 'receiver'])
  const day = 86_400_000, date = (days: number) => new Date(now.getTime() + days * day).toISOString().slice(0, 10)

  // Each step runs at "now" and is then moved back to when it happened.
  let tick = 0
  async function on(daysAgo: number, actor: Actor, op: string, body: Data): Promise<Data> {
    const start = new Date().toISOString(), seen = new Map([...state].map(([k, r]) => [k, r.revision]))
    const result = await command(state, actor, op, body)
    const when = new Date(now.getTime() - daysAgo * day + (tick += 7) * 60_000).toISOString()
    for (const [k, r] of state) if (seen.get(k) !== r.revision)
      for (const field of ['at', 'generatedAt', 'issuedAt']) if (typeof r.value[field] === 'string' && r.value[field] >= start) r.value[field] = when
    return result
  }

  await on(42, owner, 'business', { name: 'Northside Studio', currencies: ['AUD', 'USD'], locations: ['Sydney', 'Melbourne'], costCentres: ['Operations', 'Marketing', 'Studio'], projects: ['Fitout', 'Office', 'Brand refresh', 'Client events'] })
  for (const p of [maya, sam, tom, priya, lena]) await on(42, owner, 'member', { email: p.email, name: p.name, roles: p.roles, active: true })
  const supplier = async (name: string, status: string, reason: string, contact: [string, string], contractRef = '', renewal?: number) =>
    (await on(41, tom.actor, 'supplier', { name, status, reason, contacts: [{ name: contact[0], email: contact[1] }], contractRef, ...(renewal === undefined ? {} : { renewal: date(renewal) }) })).id as string
  const harbour = await supplier('Harbour Office Supply', 'preferred', 'Agreed studio pricing and next-day delivery', ['Grace Liu', 'orders@harbour-office.example'], 'NS-AG-014', 38)
  const kestrel = await supplier('Kestrel IT Solutions', 'preferred', 'Managed hardware and warranty partner', ['Dev Patel', 'accounts@kestrel-it.example'], 'NS-AG-019', 16)
  const bluegum = await supplier('Bluegum Joinery', 'active', 'Selected by tender for the Melbourne fitout', ['Ruth Byrne', 'quotes@bluegum-joinery.example'], 'NS-AG-021', 120)
  const paperbark = await supplier('Paperbark Print Co.', 'active', 'Print supplier for the brand refresh', ['Ollie Grant', 'studio@paperbark-print.example'])
  const arcwell = await supplier('Arcwell Lighting', 'active', 'Specified by the architect; invoices in USD', ['Jordan Reyes', 'trade@arcwell-lighting.example'], 'AW-2291', 210)
  const coastline = await supplier('Coastline Freight', 'active', 'Interstate freight and couriers', ['Mick Doyle', 'bookings@coastline-freight.example'])
  await supplier('Ridgeway Furniture', 'blocked', 'Two late deliveries in a row; on hold pending review', ['Anna Sato', 'sales@ridgeway-furniture.example'])

  const item = async (description: string, s: string, unitAmount: string, category: string, currency = 'AUD') => (await on(40, tom.actor, 'catalogue', { description, supplier: s, currency, unitAmount, category, approved: true })).id as string
  const chair = await item('Ergonomic task chair', harbour, '389.00', 'Furniture')
  const paper = await item('A4 copy paper, carton of 5 reams', harbour, '54.90', 'Supplies')
  const monitor = await item('27-inch USB-C monitor', kestrel, '429.00', 'Equipment')
  const dock = await item('Laptop docking station', kestrel, '289.00', 'Equipment')
  await item('Business cards, box of 500', paperbark, '89.00', 'Print')
  await item('Linear pendant light, 1200 mm', arcwell, '210.00', 'Lighting', 'USD')

  const policy = async (name: string, currency: string, category: string, project: string, limitAmount: string, budgetAmount: string) => (await on(40, owner, 'policy', { name, currency, category, project, limitAmount, budgetAmount, approver: owner.email })).id as string
  const furniture = await policy('Furniture and fitout', 'AUD', 'Furniture', '*', '15,000.00', '60,000.00')
  await policy('Joinery', 'AUD', 'Joinery', 'Fitout', '40,000.00', '90,000.00')
  await policy('Studio equipment', 'AUD', 'Equipment', '*', '10,000.00', '40,000.00')
  await policy('Office supplies', 'AUD', 'Supplies', '*', '2,000.00', '12,000.00')
  await policy('Brand refresh print', 'AUD', 'Print', 'Brand refresh', '5,000.00', '15,000.00')
  await policy('Event logistics', 'AUD', 'Freight', 'Client events', '3,000.00', '10,000.00')
  await policy('Architect lighting (USD)', 'USD', 'Lighting', 'Fitout', '12,000.00', '25,000.00')
  await on(9, owner, 'delegation', { policy: furniture, delegate: priya.email, expires: new Date(now.getTime() + 12 * day).toISOString(), reason: 'Covering approvals while I am at the Melbourne site' })

  type Line = { description?: string; catalogue?: string; quantity: string; unitAmount?: string; category?: string; project: string }
  const request = (daysAgo: number, by: Actor, title: string, s: string, need: number, location: string, costCentre: string, lines: Line[], extra: Data = {}) =>
    on(daysAgo, by, 'request', { title, supplier: s, currency: 'AUD', needDate: date(need), location, costCentre, lines, freightAmount: '0', taxAmount: '0', terms: 'Supplier quote, 30 days from invoice', ...extra })
  const submit = (daysAgo: number, by: Actor, r: Data) => on(daysAgo, by, 'submit', { id: r.id, revision: r.revision })
  const decide = (daysAgo: number, r: Data, decision: string, reason: string) => on(daysAgo, owner, 'decision', { id: r.id, revision: r.revision, decision, reason })
  async function approved(daysAgo: number, by: Actor, r: Data) { await submit(daysAgo, by, r); return decide(daysAgo - 1, r, 'approved', 'Within budget and matches the quote') }
  async function issued(daysAgo: number, r: Data) { const o = await on(daysAgo, tom.actor, 'convert', { id: r.id, revision: r.revision }); return on(daysAgo, tom.actor, 'issue', { id: o.id, revision: o.revision, reason: 'Emailed to supplier and acknowledged' }) }
  const receive = (daysAgo: number, by: Actor, o: Data, line: number, quantity: string, event = 'receive', reason = 'Delivered and checked') => on(daysAgo, by, 'receipt', { order: o.id, line: o.lines[line].id, event, quantity, reason })
  const invoice = (daysAgo: number, o: Data, reference: string, amounts: [number, string, string][]) => on(daysAgo, tom.actor, 'invoice', { order: o.id, reference, source: 'Supplier invoice emailed to accounts', allocations: amounts.map(([line, quantity, amount]) => ({ line: o.lines[line].id, quantity, amount })) })

  // Received and invoiced in full.
  const chairs = await request(36, maya.actor, 'Task chairs for the Sydney studio', harbour, -20, 'Sydney', 'Studio', [{ catalogue: chair, quantity: '8', project: 'Office' }], { freightAmount: '45.00', taxAmount: '315.70' })
  await approved(36, maya.actor, chairs)
  const chairOrder = await issued(34, chairs)
  await receive(27, maya.actor, chairOrder, 0, '8')
  await invoice(25, chairOrder, 'HOS-88412', [[0, '8', '3,112.00']])
  // Received, invoice still to come.
  const supplies = await request(15, lena.actor, 'Paper and stationery restock', harbour, -6, 'Melbourne', 'Operations', [{ catalogue: paper, quantity: '6', project: 'Office' }, { description: 'Whiteboard markers, assorted 12-pack', quantity: '4', unitAmount: '18.50', category: 'Supplies', project: 'Office' }])
  await approved(15, lena.actor, supplies)
  const suppliesOrder = await issued(13, supplies)
  await receive(8, lena.actor, suppliesOrder, 0, '6')
  await receive(8, lena.actor, suppliesOrder, 1, '4')
  // Joinery: half delivered, one panel rejected, and an invoice above the agreed price.
  const joinery = await request(30, maya.actor, 'Melbourne reception joinery', bluegum, 10, 'Melbourne', 'Studio', [
    { description: 'Reception desk, oak veneer', quantity: '1', unitAmount: '8,400.00', category: 'Joinery', project: 'Fitout' },
    { description: 'Wall shelving unit, 2.4 m', quantity: '3', unitAmount: '1,850.00', category: 'Joinery', project: 'Fitout' },
    { description: 'Acoustic wall panel', quantity: '12', unitAmount: '240.00', category: 'Joinery', project: 'Fitout' },
  ], { freightAmount: '380.00', taxAmount: '1,701.80', terms: 'Bluegum quote BJ-2291: 40% deposit, balance on installation' })
  await on(30, maya.actor, 'attachment', { kind: 'request', record: joinery.id, name: 'bluegum-quote-BJ-2291.txt', mediaType: 'text/plain', base64: btoa('Bluegum Joinery quote BJ-2291\nReception desk, oak veneer: 1 x 8,400.00\nWall shelving unit, 2.4 m: 3 x 1,850.00\nAcoustic wall panel: 12 x 240.00\nFreight 380.00, GST 1,701.80\n') })
  await approved(29, maya.actor, joinery)
  const joineryOrder = await issued(26, joinery)
  await receive(6, lena.actor, joineryOrder, 0, '1', 'receive', 'Installed by Bluegum')
  await receive(6, lena.actor, joineryOrder, 2, '6', 'receive', 'First batch fitted')
  await receive(6, lena.actor, joineryOrder, 2, '1', 'reject', 'Panel arrived with a split edge')
  await invoice(4, joineryOrder, 'BJ-INV-3307', [[0, '1', '8,650.00'], [2, '6', '1,440.00']])
  // Issued and now overdue: nothing has arrived.
  const screens = await request(24, sam.actor, 'Monitors and docks for the design team', kestrel, -4, 'Sydney', 'Studio', [{ catalogue: monitor, quantity: '6', project: 'Office' }, { catalogue: dock, quantity: '6', project: 'Office' }], { taxAmount: '431.80' })
  await approved(24, sam.actor, screens)
  await issued(22, screens)
  // Approved and prepared as a PO, ready to issue.
  const cards = await request(5, sam.actor, 'Business cards and brochures for the brand refresh', paperbark, 21, 'Sydney', 'Marketing', [
    { description: 'Business cards, box of 500', quantity: '6', unitAmount: '89.00', category: 'Print', project: 'Brand refresh' },
    { description: 'Tri-fold brochure, 1,000 copies', quantity: '2', unitAmount: '640.00', category: 'Print', project: 'Brand refresh' },
  ], { taxAmount: '181.40' })
  await approved(5, sam.actor, cards)
  await on(3, tom.actor, 'convert', { id: cards.id, revision: cards.revision })
  // Approved in USD, waiting for a buyer to raise the PO.
  const lights = await request(7, maya.actor, 'Pendant lights for the Melbourne studio', arcwell, 35, 'Melbourne', 'Studio', [{ description: 'Linear pendant light, 1200 mm', quantity: '10', unitAmount: '210.00', category: 'Lighting', project: 'Fitout' }], { currency: 'USD', freightAmount: '160.00', terms: 'Arcwell trade quote AW-Q-5518, prepaid' })
  await approved(6, maya.actor, lights)
  // Awaiting the owner's approval.
  const freight = await request(3, lena.actor, 'Exhibition stand freight to Brisbane', coastline, 12, 'Melbourne', 'Marketing', [{ description: 'Return freight, exhibition stand (2 pallets)', quantity: '1', unitAmount: '1,180.00', category: 'Freight', project: 'Client events' }], { taxAmount: '118.00' })
  await submit(2, lena.actor, freight)
  await on(2, lena.actor, 'quote', { request: freight.id, supplier: coastline, currency: 'AUD', lines: [{ description: 'Return freight, exhibition stand (2 pallets)', quantity: '1', unitAmount: '1,180.00', category: 'Freight', project: 'Client events' }], freightAmount: null, taxAmount: '118.00', delivery: date(11), conditions: null, source: 'Coastline quote CF-20417 by email' })
  const chairsMelb = await request(2, lena.actor, 'Task chairs for the Melbourne studio', harbour, 18, 'Melbourne', 'Studio', [{ catalogue: chair, quantity: '6', project: 'Fitout' }], { freightAmount: '60.00', taxAmount: '239.40' })
  await submit(1, lena.actor, chairsMelb)
  // Returned for a change, still a draft, and declined.
  const kitchen = await request(10, sam.actor, 'Coffee machine for the Sydney kitchen', harbour, 14, 'Sydney', 'Operations', [{ description: 'Bean-to-cup coffee machine', quantity: '1', unitAmount: '1,490.00', category: 'Equipment', project: 'Office' }])
  await submit(10, sam.actor, kitchen)
  await decide(9, kitchen, 'returned', 'Please attach a second quote and include servicing')
  await request(1, maya.actor, 'Plants and planters for reception', harbour, 25, 'Melbourne', 'Studio', [{ description: 'Indoor plant with planter, large', quantity: '5', unitAmount: '165.00', category: 'Furniture', project: 'Fitout' }])
  const desks = await request(19, maya.actor, 'Standing desks for the project room', harbour, 30, 'Sydney', 'Studio', [{ description: 'Electric standing desk, 1600 mm', quantity: '4', unitAmount: '1,120.00', category: 'Furniture', project: 'Office' }], { freightAmount: '120.00' })
  await submit(19, maya.actor, desks)
  await decide(18, desks, 'rejected', 'Holding furniture spend until the Melbourne fitout is invoiced')
  await on(11, tom.actor, 'prepare', { workflow: 'renewal', fields: { agreement: 'NS-AG-019', 'usage evidence': '14 devices supplied this year', 'notice date': date(9), 'keep/change/cancel options': 'Keep current pricing; request a two-year monitor warranty before renewal' }, draft: 'Kestrel IT agreement NS-AG-019 renews soon. Usage is steady; ask for the same hardware pricing and a two-year warranty on new monitors before we decide to keep, change or cancel.', references: [{ kind: 'supplier', id: kestrel }] })

  const written = [...state.values()].filter(r => before.get(`${r.kind}:${r.id}`)?.revision !== r.revision)
  await env.DB.batch([
    ...written.map(r => env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO NOTHING').bind(r.business, r.kind, r.id, r.revision, JSON.stringify(r.value))),
    env.DB.prepare('INSERT INTO oa_first_run (singleton, completed_by, completed_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime() - 42 * day),
  ])
}
