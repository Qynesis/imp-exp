/**
 * Sample bills, deliveries and returns for trying the delivery section, in any books. They belong to
 * a made-up dealer and are marked `sample`: they never move stock, never hold stock, and never count
 * in sales, profit, cash or dues. Removing them leaves the books exactly as they were.
 */
import { addDays } from './format'
import type { Db, Delivery, Invoice, ISODate, SalesReturn } from './types'

export const SAMPLE_DEALER_ID = 'sample-dealer'
export const hasSampleDelivery = (db: Db): boolean => db.invoices.some((i) => i.sample)

export function addSampleDelivery(d: Db, today: ISODate, next: () => number): void {
  const products = d.products.filter((p) => p.kind === 'finished' && !p.archived).slice(0, 3)
  if (!products.length) throw new Error('Add at least one finished product first')
  if (!d.dealers.some((x) => x.id === SAMPLE_DEALER_ID)) {
    d.dealers.push({ id: SAMPLE_DEALER_ID, name: 'Sample Dealer (test)', owner: 'Test Owner', phone: '01700-000001', area: 'Test area', address: 'Sample Road', opening: 0, terms: 'credit', limit: 10000000, days: 30, salesId: '', sample: true })
  }
  const [a, b = a, c = b] = products
  const day = (n: number) => addDays(today, -n)
  const line = (p: typeof a, qty: number) => ({ productId: p.id, qty, price: p.price || 100, name: p.name, unit: p.unit, cost: p.cost })
  const bill = (no: number, ago: number, lines: ReturnType<typeof line>[]): Invoice => ({
    id: `SMP-${no}`, ts: next(), status: 'final', dealerId: SAMPLE_DEALER_ID, soldBy: '', date: day(ago), terms: 'credit', lines, discount: 0, received: 0, method: 'Cash', stockOnDelivery: true, sample: true,
  })
  const del = (id: string, inv: Invoice, ago: number, lines: [typeof a, number][], extra: Partial<Delivery> = {}): Delivery => ({
    id, ts: next(), date: day(ago), invoiceId: inv.id, dealerId: SAMPLE_DEALER_ID, lines: lines.map(([p, qty]) => ({ productId: p.id, qty })), via: 'own', receivedBy: 'Test Owner', note: '', ...extra,
  })
  const ret = (id: string, inv: Invoice, ago: number, p: typeof a, qty: number, condition: SalesReturn['condition'], reason: string, note: string): SalesReturn => ({
    id, ts: next(), date: day(ago), invoiceId: inv.id, dealerId: SAMPLE_DEALER_ID, lines: [{ productId: p.id, qty, price: p.price || 100 }], condition, credit: qty * (p.price || 100), reason, note,
  })

  // 1: delivered in full over two trips, then part of it came back
  const b1 = bill(1, 12, [line(a, 50), line(b, 20)])
  // 2: 100 cartons billed, only 30 gone so far
  const b2 = bill(2, 8, [line(a, 100)])
  // 3: three items billed, two of them delivered
  const b3 = bill(3, 6, [line(a, 10), line(b, 15), line(c, 40)])
  // 4: waiting, nothing gone yet
  const b4 = bill(4, 4, [line(b, 25), line(c, 60)])
  // 5: part went, the dealer cancelled the rest
  const b5 = bill(5, 3, [line(a, 40)])
  // 6: billed today
  const b6 = bill(6, 0, [line(a, 15), line(c, 30)])
  d.invoices.push(b1, b2, b3, b4, b5, b6)
  ;(d.deliveries ??= []).push(
    del('SDL-1', b1, 11, [[a, 30], [b, 20]], { receivedBy: 'Test Owner', note: 'Truck 1' }),
    del('SDL-2', b1, 10, [[a, 20]], { via: 'courier', note: 'Rest sent by courier' }),
    del('SDL-3', b2, 7, [[a, 30]], { note: '30 of 100 cartons; rest when stock comes in' }),
    del('SDL-4', b3, 5, [[a, 10], [b, 15]], { via: 'pickup', receivedBy: 'Dealer’s man', note: 'Item 3 to follow' }),
    del('SDL-5', b5, 2, [[a, 25]]),
    del('SCL-1', b5, 1, [[a, 15]], { cancelled: true, credit: 15 * (a.price || 100), note: 'Dealer cancelled the last 15' }),
  )
  ;(d.returns ??= []).push(
    ret('SRT-1', b1, 9, a, 4, 'damaged', 'Damaged in transit', 'Cartons wet at the bottom'),
    ret('SRT-2', b1, 5, b, 3, 'restock', 'Dealer could not sell', 'Unopened, back on the shelf'),
    ret('SRT-3', b3, 2, a, 2, 'restock', 'Wrong item sent', 'Sent the wrong size'),
  )
  for (const x of d.deliveries.filter((y) => y.invoiceId.startsWith('SMP-'))) x.sample = true
  for (const r of d.returns.filter((y) => y.invoiceId.startsWith('SMP-'))) r.sample = true
}

export function removeSampleDelivery(d: Db): void {
  const ids = new Set(d.invoices.filter((i) => i.sample).map((i) => i.id))
  d.invoices = d.invoices.filter((i) => !i.sample)
  d.deliveries = (d.deliveries || []).filter((x) => !ids.has(x.invoiceId))
  d.returns = (d.returns || []).filter((x) => !ids.has(x.invoiceId))
  d.dealers = d.dealers.filter((x) => !x.sample)
}
