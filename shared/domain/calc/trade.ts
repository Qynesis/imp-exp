/**
 * The morning view for an importer and exporter: the order book, LCs and shipments by stage,
 * what lands this week, what customs will cost, and export money still to come in.
 */
import { addDays, daysBetween, todayISO } from '../format'
import type { Db, ISODate, Shipment } from '../types'
import { memo, sum } from './common'
import { customsCalc } from './customs'
import { pendingDeliveries } from './delivery'
import { totalsBetween } from './sales'
import { shipmentCalc, stepLabel } from './shipments'
import { trips } from './transport'

export type ImportStage = 'lc' | 'sea' | 'port' | 'cleared'
export const IMPORT_STAGES: Record<ImportStage, string> = { lc: 'LC opened', sea: 'On the water', port: 'At port, in customs', cleared: 'Cleared, coming in' }

export interface PipelineRow {
  s: Shipment
  name: string
  stageText: string
  done: number
  total: number
  /** The next step and when it is expected. */
  next: string
  expected: ISODate | ''
  /** Days until expected; negative when late. */
  daysTo: number | null
  usd: number
  tk: number
}

const row = (db: Db, s: Shipment): PipelineRow => {
  const c = shipmentCalc(db, s)
  const done = c.keys.filter((k) => s.steps[k]?.date).length
  // the first date still expected among the steps not done yet
  const expected = c.keys.filter((k) => !s.steps[k]?.date).map((k) => s.steps[k]?.expected).find(Boolean) || ''
  return {
    s, name: c.productName, stageText: c.status, done, total: c.keys.length, next: c.next ? stepLabel(c.next, s) : 'Done', expected,
    daysTo: expected ? daysBetween(todayISO(), expected) : null, usd: s.usd, tk: c.invoiceTk,
  }
}

const importStage = (s: Shipment): ImportStage =>
  s.steps.customs?.date ? 'cleared' : s.steps.port?.date ? 'port' : s.steps.shipped?.date ? 'sea' : 'lc'

export interface TradeOverview {
  imports: PipelineRow[]
  importsByStage: Record<ImportStage, number>
  importUsd: number
  importTk: number
  /** Imports whose next step is due within a week (or already late). */
  arriving: PipelineRow[]
  exports: PipelineRow[]
  exportUsd: number
  /** Shipped but the money has not been realised at the bank yet. */
  awaitingPayment: PipelineRow[]
  awaitingUsd: number
  dutyDue: number
  demurrage: number
  docsMissing: number
  /** Latest exchange rate used on a shipment. */
  usdRate: number | null
}

export const tradeOverview = (db: Db): TradeOverview =>
  memo(db, 'trade', () => {
    const imp = db.imports.filter((s) => s.direction !== 'export' && !s.steps.warehouse?.date)
    const exp = db.imports.filter((s) => s.direction === 'export' && !s.steps.paid?.date)
    const imports = imp.map((s) => row(db, s)).sort((a, b) => (a.expected || '9') < (b.expected || '9') ? -1 : 1)
    const exports = exp.map((s) => row(db, s)).sort((a, b) => (a.expected || '9') < (b.expected || '9') ? -1 : 1)
    const byStage: Record<ImportStage, number> = { lc: 0, sea: 0, port: 0, cleared: 0 }
    for (const s of imp) byStage[importStage(s)]++
    const inCustoms = imp.map((s) => customsCalc(db, s)).filter((c) => !c.released)
    const awaiting = exports.filter((r) => r.s.steps.shipped?.date)
    const latest = [...db.imports].sort((a, b) => b.ts - a.ts)[0]
    return {
      imports, importsByStage: byStage, importUsd: sum(imports, (r) => r.usd), importTk: sum(imports, (r) => r.tk),
      arriving: imports.filter((r) => r.daysTo != null && r.daysTo <= 7),
      exports, exportUsd: sum(exports, (r) => r.usd), awaitingPayment: awaiting, awaitingUsd: sum(awaiting, (r) => r.usd),
      dutyDue: sum(inCustoms.filter((c) => !c.dates.duty), (c) => c.dutyTotal), demurrage: sum(inCustoms, (c) => c.demurrage),
      docsMissing: sum(inCustoms, (c) => c.docs.length - c.docsOk), usdRate: latest?.rate || null,
    }
  })

export interface OrderBook {
  today: { orders: number; value: number }
  yesterday: { orders: number; value: number }
  month: { orders: number; value: number; profit: number }
  target: number
  /** Bills with goods still to deliver, oldest first. */
  toDeliver: { id: string; dealerId: string; date: ISODate; total: number; units: number; partial: boolean }[]
  onTheRoad: number
}

export const orderBook = (db: Db): OrderBook =>
  memo(db, 'orderBook', () => {
    const t = todayISO()
    const y = addDays(t, -1)
    const m = totalsBetween(db, `${t.slice(0, 7)}-01`, t)
    const day = (d: ISODate) => {
      const x = totalsBetween(db, d, d)
      return { orders: x.invoices, value: x.sales }
    }
    // bills whose goods have not all gone yet, from the delivery section
    const toDeliver = pendingDeliveries(db).map((x) => ({ id: x.inv.id, dealerId: x.inv.dealerId, date: x.inv.date, total: sum(x.inv.lines, (l) => l.qty * l.price) - (x.inv.discount || 0), units: x.d.remainingUnits, partial: x.d.status === 'partial' }))
    return {
      today: day(t), yesterday: day(y), month: { orders: m.invoices, value: m.sales, profit: m.profit }, target: db.company.salesTarget || 0,
      toDeliver, onTheRoad: trips(db).filter((x) => x.status === 'on-the-way').length,
    }
  })
