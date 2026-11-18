/**
 * The delivery section: what each invoice still has to hand over, what went and what came back.
 * Invoices saved before this existed (no `stockOnDelivery`) count as fully delivered on their date.
 */
import { addDays, daysBetween, todayISO } from '../format'
import type { Db, Invoice, ISODate, Product } from '../types'
import { byId, memo, sum } from './common'

export const tracksDelivery = (inv: Pick<Invoice, 'status' | 'stockOnDelivery'>): boolean => inv.status === 'final' && !!inv.stockOnDelivery

export interface DeliveryLine {
  productId: string
  name: string
  unit: string
  price: number
  ordered: number
  delivered: number
  returned: number
  /** Still to hand over. */
  remaining: number
  /** Can still come back: delivered less what already did. */
  returnable: number
}
export type DeliveryStatus = 'pending' | 'partial' | 'delivered'

export interface InvoiceDelivery {
  lines: DeliveryLine[]
  status: DeliveryStatus
  remainingUnits: number
  lastDelivery: ISODate | ''
  /** Days the invoice has been waiting for its first or last goods. */
  waitingDays: number
}

export const invoiceDelivery = (db: Db, inv: Invoice): InvoiceDelivery =>
  memo(db, 'delivery:' + inv.id, () => {
    const dels = (db.deliveries || []).filter((d) => d.invoiceId === inv.id)
    const rets = (db.returns || []).filter((r) => r.invoiceId === inv.id)
    const tracked = tracksDelivery(inv)
    const lines = inv.lines.map((l): DeliveryLine => {
      const p = byId(db.products, l.productId)
      const delivered = tracked ? sum(dels, (d) => sum(d.lines.filter((x) => x.productId === l.productId), (x) => x.qty)) : l.qty
      const returned = sum(rets, (r) => sum(r.lines.filter((x) => x.productId === l.productId), (x) => x.qty))
      return {
        productId: l.productId, name: l.name || p?.name || 'Product', unit: l.unit || p?.unit || '', price: l.price,
        ordered: l.qty, delivered, returned, remaining: Math.max(l.qty - delivered, 0), returnable: Math.max(delivered - returned, 0),
      }
    })
    const remainingUnits = sum(lines, (l) => l.remaining)
    const deliveredUnits = sum(lines, (l) => l.delivered)
    const last = dels.map((d) => d.date).sort().at(-1) || ''
    return {
      lines, remainingUnits, lastDelivery: last,
      status: remainingUnits <= 0 ? 'delivered' : deliveredUnits > 0 ? 'partial' : 'pending',
      waitingDays: remainingUnits > 0 ? Math.max(daysBetween(inv.date, todayISO()), 0) : 0,
    }
  })

/** Final invoices with goods still to hand over, oldest first. */
export const pendingDeliveries = (db: Db): { inv: Invoice; d: InvoiceDelivery }[] =>
  memo(db, 'pendingDeliveries', () =>
    db.invoices
      .filter(tracksDelivery)
      .map((inv) => ({ inv, d: invoiceDelivery(db, inv) }))
      .filter((x) => x.d.remainingUnits > 0)
      .sort((a, b) => (a.inv.date < b.inv.date ? -1 : 1)),
  )

/** Billed but not yet handed over: in the warehouse, but already promised. */
export const reservedQty = (db: Db, productId: string): number =>
  memo(db, 'reserved:' + productId, () => sum(pendingDeliveries(db), (x) => sum(x.d.lines.filter((l) => l.productId === productId), (l) => l.remaining)))

/** What can still be sold: stock less what invoices are waiting for. */
export const availableQty = (db: Db, p: Product): number => p.stock - reservedQty(db, p.id)

export interface ReturnsSummary {
  count: number
  credit: number
  units: number
  byDealer: { id: string; name: string; credit: number; units: number; count: number }[]
  byProduct: { id: string; name: string; unit: string; units: number; credit: number }[]
  byReason: { reason: string; count: number }[]
}

export const returnsBetween = (db: Db, from: ISODate, to: ISODate): ReturnsSummary =>
  memo(db, `returns:${from}:${to}`, () => {
    const rs = (db.returns || []).filter((r) => r.date >= from && r.date <= to)
    const dealers = new Map<string, ReturnsSummary['byDealer'][number]>()
    const products = new Map<string, ReturnsSummary['byProduct'][number]>()
    const reasons = new Map<string, number>()
    for (const r of rs) {
      const d = dealers.get(r.dealerId) || { id: r.dealerId, name: byId(db.dealers, r.dealerId)?.name || 'Dealer', credit: 0, units: 0, count: 0 }
      d.credit += r.credit
      d.count++
      for (const l of r.lines) {
        d.units += l.qty
        const p = byId(db.products, l.productId)
        const x = products.get(l.productId) || { id: l.productId, name: p?.name || 'Product', unit: p?.unit || '', units: 0, credit: 0 }
        x.units += l.qty
        x.credit += l.qty * l.price
        products.set(l.productId, x)
      }
      dealers.set(r.dealerId, d)
      reasons.set(r.reason || 'Other', (reasons.get(r.reason || 'Other') || 0) + 1)
    }
    return {
      count: rs.length, credit: sum(rs, (r) => r.credit), units: sum(rs, (r) => sum(r.lines, (l) => l.qty)),
      byDealer: [...dealers.values()].sort((a, b) => b.credit - a.credit),
      byProduct: [...products.values()].sort((a, b) => b.units - a.units),
      byReason: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    }
  })

export const lastNDays = (n: number): [ISODate, ISODate] => [addDays(todayISO(), -n), todayISO()]
