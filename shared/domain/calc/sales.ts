/**
 * Sales analytics: totals per day, month or year, comparisons with the period before, running
 * totals against targets, and who and what the sales came from. Only final invoices count.
 */
import { addDays, addMonths, daysInMonth, fday, fmonth, monShort, todayISO } from '../format'
import type { Db, DealerTerms, ISODate, MonthKey } from '../types'
import { byId, memo, sum } from './common'
import { invTotal } from './dealers'

export type Grain = 'day' | 'month' | 'year'

export interface SaleFact {
  id: string
  date: ISODate
  dealerId: string
  soldBy: string
  terms: DealerTerms
  total: number
  cost: number
  profit: number
  units: number
  lines: { productId: string; name: string; unit: string; qty: number; amount: number; cost: number }[]
}

/** One row per final invoice, oldest first. */
export const saleFacts = (db: Db): SaleFact[] =>
  memo(db, 'saleFacts', () =>
    db.invoices
      // sample bills only demonstrate the delivery section; they are not sales
      .filter((i) => i.status === 'final' && !i.sample)
      .map((i): SaleFact => {
        const sub = sum(i.lines, (l) => l.qty * l.price)
        // spread the discount over the lines in proportion, so product totals add up to the invoice
        const k = sub > 0 ? invTotal(i) / sub : 1
        const lines = i.lines.map((l) => {
          const p = byId(db.products, l.productId)
          return { productId: l.productId, name: l.name || p?.name || 'Product', unit: l.unit || p?.unit || '', qty: l.qty, amount: Math.round(l.qty * l.price * k), cost: l.qty * (l.cost ?? p?.cost ?? 0) }
        })
        const total = invTotal(i)
        const cost = sum(lines, (l) => l.cost)
        return { id: i.id, date: i.date, dealerId: i.dealerId, soldBy: i.soldBy, terms: i.terms, total, cost, profit: total - cost, units: sum(lines, (l) => l.qty), lines }
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  )

/** Money received from dealers by date: paid on the invoice, plus later collections. */
const receipts = (db: Db) =>
  memo(db, 'saleReceipts', () => [
    ...db.invoices.filter((i) => i.status === 'final' && !i.sample && i.received > 0).map((i) => ({ date: i.date, amount: i.received })),
    ...db.collections.map((c) => ({ date: c.date, amount: c.amount })),
  ])

export interface Totals {
  sales: number
  profit: number
  cost: number
  invoices: number
  units: number
  collected: number
}
const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to

export function totalsBetween(db: Db, from: ISODate, to: ISODate): Totals {
  return memo(db, `totals:${from}:${to}`, () => {
    const f = saleFacts(db).filter((x) => inRange(x.date, from, to))
    return {
      sales: sum(f, (x) => x.total), profit: sum(f, (x) => x.profit), cost: sum(f, (x) => x.cost), invoices: f.length, units: sum(f, (x) => x.units),
      collected: sum(receipts(db).filter((r) => inRange(r.date, from, to)), (r) => r.amount),
    }
  })
}

/* ---------- periods ---------- */

/** What the screen shows: a month of days, a year of months, or every year. */
export interface Period {
  grain: Grain
  /** 'YYYY-MM' for days, 'YYYY' for months, '' for years. */
  anchor: string
  from: ISODate
  to: ISODate
  label: string
}

export function firstSaleYear(db: Db): number {
  const f = saleFacts(db)[0]
  return f ? Number(f.date.slice(0, 4)) : Number(todayISO().slice(0, 4))
}

export function periodOf(db: Db, grain: Grain, anchor: string): Period {
  if (grain === 'day') return { grain, anchor, from: `${anchor}-01`, to: `${anchor}-${String(daysInMonth(anchor)).padStart(2, '0')}`, label: fmonth(anchor) }
  if (grain === 'month') return { grain, anchor, from: `${anchor}-01-01`, to: `${anchor}-12-31`, label: anchor }
  const first = Math.min(firstSaleYear(db), Number(todayISO().slice(0, 4)) - 2)
  const last = todayISO().slice(0, 4)
  return { grain, anchor: '', from: `${first}-01-01`, to: `${last}-12-31`, label: `${first} to ${last}` }
}

/** The period before, for comparison. The "all years" view has none. */
export function previousPeriod(db: Db, p: Period): Period | null {
  if (p.grain === 'day') return periodOf(db, 'day', addMonths(p.anchor, -1))
  if (p.grain === 'month') return periodOf(db, 'month', String(Number(p.anchor) - 1))
  return null
}
export function nextAnchor(p: Period, step: number): string {
  return p.grain === 'day' ? addMonths(p.anchor, step) : p.grain === 'month' ? String(Number(p.anchor) + step) : ''
}
export const currentAnchor = (grain: Grain): string => (grain === 'day' ? todayISO().slice(0, 7) : grain === 'month' ? todayISO().slice(0, 4) : '')

/* ---------- series for the chart ---------- */

export interface Bucket extends Totals {
  key: string
  /** Axis label: "3", "Nov", "2026". */
  short: string
  /** Tooltip heading: "Tue 3 Nov", "November 2026", "2026". */
  long: string
  from: ISODate
  to: ISODate
  /** After today, so nothing could have been sold yet. */
  future: boolean
  /** Can open a finer view (a month's days, a year's months). */
  drill?: { grain: Grain; anchor: string }
}

export function salesSeries(db: Db, p: Period): Bucket[] {
  return memo(db, `series:${p.grain}:${p.anchor}`, () => {
    const today = todayISO()
    const make = (key: string, short: string, long: string, from: ISODate, to: ISODate, drill?: Bucket['drill']): Bucket =>
      ({ key, short, long, from, to, future: from > today, drill, ...totalsBetween(db, from, to) })
    if (p.grain === 'day') {
      return Array.from({ length: daysInMonth(p.anchor) }, (_, i) => {
        const day = `${p.anchor}-${String(i + 1).padStart(2, '0')}`
        return make(day, String(i + 1), fday(day), day, day)
      })
    }
    if (p.grain === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const m: MonthKey = `${p.anchor}-${String(i + 1).padStart(2, '0')}`
        return make(m, monShort(i), fmonth(m), `${m}-01`, `${m}-${String(daysInMonth(m)).padStart(2, '0')}`, { grain: 'day', anchor: m })
      })
    }
    const first = Number(p.from.slice(0, 4))
    const last = Number(p.to.slice(0, 4))
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const y = String(first + i)
      return make(y, y, y, `${y}-01-01`, `${y}-12-31`, { grain: 'month', anchor: y })
    })
  })
}

/** Running total through the period, point by point, with the same points of the period before. */
export function runningTotals(db: Db, p: Period): { key: string; short: string; long: string; now: number | null; before: number | null }[] {
  const prev = previousPeriod(db, p)
  const cur = salesSeries(db, p)
  const old = prev ? salesSeries(db, prev) : []
  let a = 0
  let b = 0
  return cur.map((c, i) => {
    a += c.sales
    if (old[i]) b += old[i].sales
    return { key: c.key, short: c.short, long: c.long, now: c.future ? null : a, before: old[i] ? b : null }
  })
}

/* ---------- pace: today, this month, this year ---------- */

export interface Pace {
  label: string
  value: number
  compareLabel: string
  compare: number
}

/** Today against yesterday, and month and year to date against the same stretch before. */
export function salesPace(db: Db): Pace[] {
  return memo(db, 'pace', () => {
    const t = todayISO()
    const day = Number(t.slice(8, 10))
    const month = t.slice(0, 7)
    const lastMonth = addMonths(month, -1)
    const sameDayLastMonth = `${lastMonth}-${String(Math.min(day, daysInMonth(lastMonth))).padStart(2, '0')}`
    const year = Number(t.slice(0, 4))
    const s = (from: ISODate, to: ISODate) => totalsBetween(db, from, to).sales
    return [
      { label: 'Today', value: s(t, t), compareLabel: 'yesterday', compare: s(addDays(t, -1), addDays(t, -1)) },
      { label: 'This month so far', value: s(`${month}-01`, t), compareLabel: `same days of ${fmonth(lastMonth).split(' ')[0]}`, compare: s(`${lastMonth}-01`, sameDayLastMonth) },
      { label: 'This year so far', value: s(`${year}-01-01`, t), compareLabel: `same time in ${year - 1}`, compare: s(`${year - 1}-01-01`, `${year - 1}${t.slice(4)}`) },
    ]
  })
}

/** Signed change as a share of the earlier figure; null when there is nothing to compare with. */
export const change = (now: number, before: number): number | null => (before > 0 ? (now - before) / before : null)

/* ---------- who and what ---------- */

export interface Share {
  id: string
  name: string
  sub: string
  sales: number
  profit: number
  qty: number
  invoices: number
}

export interface Breakdown {
  products: Share[]
  dealers: Share[]
  staff: Share[]
  areas: Share[]
  terms: { cash: number; credit: number }
}

export function breakdown(db: Db, from: ISODate, to: ISODate): Breakdown {
  return memo(db, `breakdown:${from}:${to}`, () => {
    const facts = saleFacts(db).filter((x) => inRange(x.date, from, to))
    const group = (keyOf: (f: SaleFact) => string, nameOf: (id: string) => [string, string]) => {
      const m = new Map<string, Share>()
      for (const f of facts) {
        const id = keyOf(f)
        const s = m.get(id) || { id, name: nameOf(id)[0], sub: nameOf(id)[1], sales: 0, profit: 0, qty: 0, invoices: 0 }
        s.sales += f.total
        s.profit += f.profit
        s.qty += f.units
        s.invoices++
        m.set(id, s)
      }
      return [...m.values()].sort((a, b) => b.sales - a.sales)
    }
    const products = new Map<string, Share>()
    for (const f of facts)
      for (const l of f.lines) {
        const s = products.get(l.productId) || { id: l.productId, name: l.name, sub: l.unit, sales: 0, profit: 0, qty: 0, invoices: 0 }
        s.sales += l.amount
        s.profit += l.amount - l.cost
        s.qty += l.qty
        s.invoices++
        products.set(l.productId, s)
      }
    return {
      products: [...products.values()].sort((a, b) => b.sales - a.sales),
      dealers: group((f) => f.dealerId, (id) => [byId(db.dealers, id)?.name || 'Removed dealer', byId(db.dealers, id)?.area || '']),
      staff: group((f) => f.soldBy || '', (id) => (id ? [byId(db.employees, id)?.name || 'Former staff', byId(db.employees, id)?.role || ''] : ['Office sale', 'No salesperson'])),
      areas: group((f) => byId(db.dealers, f.dealerId)?.area || 'No area', (id) => [id, '']),
      terms: { cash: sum(facts.filter((f) => f.terms !== 'credit'), (f) => f.total), credit: sum(facts.filter((f) => f.terms === 'credit'), (f) => f.total) },
    }
  })
}

/** Final invoices in the range, newest first. */
export const salesBetween = (db: Db, from: ISODate, to: ISODate): SaleFact[] =>
  memo(db, `salesBetween:${from}:${to}`, () => saleFacts(db).filter((x) => inRange(x.date, from, to)).reverse())

/* ---------- targets ---------- */

export interface TargetRow {
  id: string
  name: string
  target: number
  actual: number
}

/** Targets for a month (or twelve months for a year), with the sales made against each. */
export function targetsFor(db: Db, p: Period): { company: TargetRow | null; staff: TargetRow[] } {
  const months = p.grain === 'month' ? 12 : 1
  const bd = breakdown(db, p.from, p.to)
  const company = db.company.salesTarget ? { id: 'company', name: db.company.name || 'Company', target: db.company.salesTarget * months, actual: sum(bd.dealers, (d) => d.sales) } : null
  const staff = db.employees
    .filter((e) => e.payType === 'sales' || e.salesTarget)
    .map((e) => ({ id: e.id, name: e.name, target: (e.salesTarget || 0) * months, actual: bd.staff.find((s) => s.id === e.id)?.sales || 0 }))
  return { company, staff }
}
