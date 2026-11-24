/**
 * Business insights: deep-dive analysis across products, dealers, cash, suppliers and imports, and a
 * ranked list of decisions to take. Everything looks at a window of recent days ending today, and
 * compares it with the window just before it. Pure and cached per version of the books.
 */
import { addDays, addMonths, daysBetween, fmonth, monShort, todayISO } from '../format'
import type { Db, ISODate, MonthKey, ProductKind } from '../types'
import { byId, memo, purchaseIn, sum } from './common'
import { accountBalances, cashEntries } from './cashbook'
import { receivables } from './dealers'
import { payables } from './payables'
import { usageRate } from './products'
import { profitAndLoss } from './reports'
import { saleFacts, type SaleFact } from './sales'
import { shipmentCalc, stepKeys, stepLabel } from './shipments'

export type InsightWindow = 30 | 90 | 180 | 365
export const WINDOWS: InsightWindow[] = [30, 90, 180, 365]
const today = () => todayISO()
const between = (f: SaleFact, from: ISODate, to: ISODate) => f.date > from && f.date <= to
/** The window ending today, and the one of the same length just before it. */
export const windowDates = (days: number) => {
  const to = today()
  const from = addDays(to, -days)
  return { from, to, prevFrom: addDays(from, -days), prevTo: from }
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)
const growth = (now: number, before: number): number | null => (before > 0 ? (now - before) / before : now > 0 ? null : 0)

/* ---------- products ---------- */

export type AbcClass = 'A' | 'B' | 'C' | '-'
export type StockHealth = 'reorder' | 'low' | 'healthy' | 'overstock' | 'dead' | 'none'
export const STOCK_HEALTH: Record<StockHealth, string> = { reorder: 'Reorder now', low: 'Running low', healthy: 'Healthy', overstock: 'Too much stock', dead: 'Not moving', none: 'No stock' }

export interface ProductInsight {
  id: string
  name: string
  unit: string
  kind: ProductKind
  sales: number
  profit: number
  /** Profit as a share of sales, 0..1; null with no sales. */
  margin: number | null
  qty: number
  prevSales: number
  prevProfit: number
  prevQty: number
  /** Change in sales against the window before; null when there was nothing before. */
  growth: number | null
  /** A: the items making the first 80% of sales, B: the next 15%, C: the rest. */
  abc: AbcClass
  /** Running share of sales up to and including this item, for the Pareto curve. */
  cumShare: number
  stock: number
  stockValue: number
  /** Units going out per day (sold, used, handed to factories), over the window. */
  perDay: number
  /** Days the stock lasts at that pace; null when nothing moved. */
  daysCover: number | null
  /** Times the stock turns over in a year, at the window's pace. */
  turns: number | null
  health: StockHealth
  dealers: number
  /** Average selling price per unit in the window and the one before. */
  price: number
  prevPrice: number
  unitCost: number
  prevUnitCost: number
}

/** How long it takes to get more stock in, in days; below this much cover we should reorder. */
export const REORDER_DAYS = 21
export const OVERSTOCK_DAYS = 180

export const productInsights = (db: Db, days: InsightWindow): ProductInsight[] =>
  memo(db, 'ins:products:' + days, () => {
    const w = windowDates(days)
    const facts = saleFacts(db)
    const agg = (from: ISODate, to: ISODate) => {
      const m = new Map<string, { sales: number; cost: number; qty: number; dealers: Set<string> }>()
      for (const f of facts) {
        if (!between(f, from, to)) continue
        for (const l of f.lines) {
          const r = m.get(l.productId) || { sales: 0, cost: 0, qty: 0, dealers: new Set<string>() }
          r.sales += l.amount
          r.cost += l.cost
          r.qty += l.qty
          r.dealers.add(f.dealerId)
          m.set(l.productId, r)
        }
      }
      return m
    }
    const cur = agg(w.from, w.to)
    const prev = agg(w.prevFrom, w.prevTo)
    const rows: ProductInsight[] = db.products.filter((p) => !p.archived || cur.has(p.id)).map((p) => {
      const c = cur.get(p.id)
      const b = prev.get(p.id)
      const u = usageRate(db, p.id, days)
      const stockValue = Math.max(p.stock, 0) * p.cost
      const daysCover = u.perDay > 0 ? Math.floor(Math.max(p.stock, 0) / u.perDay) : null
      let health: StockHealth = 'healthy'
      if (p.stock <= 0) health = u.perDay > 0 ? 'reorder' : 'none'
      else if (u.perDay <= 0) health = 'dead'
      else if (daysCover !== null && daysCover < REORDER_DAYS) health = 'reorder'
      else if (p.lowAt > 0 && p.stock <= p.lowAt) health = 'low'
      else if (daysCover !== null && daysCover > OVERSTOCK_DAYS) health = 'overstock'
      const sales = c?.sales || 0
      const cost = c?.cost || 0
      return {
        id: p.id, name: p.name, unit: p.unit, kind: p.kind, sales, profit: sales - cost, margin: sales > 0 ? (sales - cost) / sales : null, qty: c?.qty || 0,
        prevSales: b?.sales || 0, prevProfit: (b?.sales || 0) - (b?.cost || 0), prevQty: b?.qty || 0, growth: growth(sales, b?.sales || 0),
        abc: '-', cumShare: 0, stock: p.stock, stockValue, perDay: u.perDay, daysCover,
        turns: stockValue > 0 && u.perDay > 0 ? (u.perDay * 365 * p.cost) / stockValue : null, health, dealers: c?.dealers.size || 0,
        price: ratio(sales, c?.qty || 0), prevPrice: ratio(b?.sales || 0, b?.qty || 0), unitCost: ratio(cost, c?.qty || 0), prevUnitCost: ratio(b?.cost || 0, b?.qty || 0),
      }
    })
    // ABC: rank by sales, then cut at 80% and 95% of the total
    const total = sum(rows, (r) => r.sales)
    let run = 0
    for (const r of [...rows].filter((x) => x.sales > 0).sort((a, b) => b.sales - a.sales)) {
      const before = run
      run += r.sales
      r.cumShare = total > 0 ? run / total : 0
      r.abc = before / total < 0.8 ? 'A' : before / total < 0.95 ? 'B' : 'C'
    }
    return rows.sort((a, b) => b.sales - a.sales || b.stockValue - a.stockValue)
  })

/** Twelve months of one product's sales, profit and quantity, oldest first. */
export const productMonths = (db: Db, productId: string, months = 12) =>
  memo(db, `ins:pm:${productId}:${months}`, () => {
    const keys = lastMonths(months)
    const m = new Map(keys.map((k) => [k, { sales: 0, profit: 0, qty: 0 }]))
    const buyers = new Map<string, { id: string; sales: number; qty: number }>()
    const from = keys[0] + '-01'
    for (const f of saleFacts(db)) {
      if (f.date < from) continue
      for (const l of f.lines) {
        if (l.productId !== productId) continue
        const r = m.get(f.date.slice(0, 7) as MonthKey)
        if (r) { r.sales += l.amount; r.profit += l.amount - l.cost; r.qty += l.qty }
        const d = buyers.get(f.dealerId) || { id: f.dealerId, sales: 0, qty: 0 }
        d.sales += l.amount
        d.qty += l.qty
        buyers.set(f.dealerId, d)
      }
    }
    return {
      months: keys.map((k) => ({ key: k, short: monShort(k), long: fmonth(k), ...m.get(k)! })),
      buyers: [...buyers.values()].map((b) => ({ ...b, name: byId(db.dealers, b.id)?.name || 'Removed dealer' })).sort((a, b) => b.sales - a.sales),
    }
  })

function lastMonths(n: number): MonthKey[] {
  const now = today().slice(0, 7) as MonthKey
  return Array.from({ length: n }, (_, i) => addMonths(now, i - n + 1))
}

/* ---------- dealers ---------- */

export type Segment = 'champion' | 'loyal' | 'new' | 'promising' | 'at-risk' | 'lost' | 'never'
export const SEGMENTS: Record<Segment, { label: string; hint: string }> = {
  champion: { label: 'Champions', hint: 'Buy often, recently and the most' },
  loyal: { label: 'Loyal', hint: 'Steady buyers' },
  new: { label: 'New', hint: 'First bill within the window' },
  promising: { label: 'Occasional', hint: 'Buy now and then' },
  'at-risk': { label: 'At risk', hint: 'Used to buy regularly, gone quiet' },
  lost: { label: 'Lost', hint: 'Nothing for over 90 days' },
  never: { label: 'Never bought', hint: 'On the list, no bill yet' },
}

export interface DealerInsight {
  id: string
  name: string
  area: string
  sales: number
  profit: number
  prevSales: number
  growth: number | null
  /** Bills in the last 365 days. */
  frequency: number
  /** Days since the last bill; null when never. */
  recency: number | null
  firstDate: ISODate | null
  lastDate: ISODate | null
  /** Usual days between bills over the last year. */
  gap: number | null
  segment: Segment
  due: number
  /** Days the oldest unpaid bill is past its due date (0 when not overdue). */
  overdueDays: number
  /** Unpaid money by how late it is. */
  aging: AgingBuckets
  /** Share of all sales in the window. */
  share: number
  /** Monthly average bought over the last year, for "what we lose if they stop". */
  monthly: number
}
export interface AgingBuckets { current: number; d30: number; d60: number; d90: number; over90: number }
const emptyAging = (): AgingBuckets => ({ current: 0, d30: 0, d60: 0, d90: 0, over90: 0 })
export const AGING_LABELS: [keyof AgingBuckets, string][] = [['current', 'Not yet due'], ['d30', '1–30 days late'], ['d60', '31–60 days'], ['d90', '61–90 days'], ['over90', 'Over 90 days']]

export const dealerInsights = (db: Db, days: InsightWindow): DealerInsight[] =>
  memo(db, 'ins:dealers:' + days, () => {
    const w = windowDates(days)
    const t = today()
    const yearAgo = addDays(t, -365)
    const facts = saleFacts(db)
    const ledgers = new Map(receivables(db).rows.map((l) => [l.dealer.id, l]))
    const total = sum(facts.filter((f) => between(f, w.from, w.to)), (f) => f.total)
    const rows = db.dealers.filter((d) => !d.sample).map((d): DealerInsight => {
      const mine = facts.filter((f) => f.dealerId === d.id)
      const cur = mine.filter((f) => between(f, w.from, w.to))
      const prev = mine.filter((f) => between(f, w.prevFrom, w.prevTo))
      const year = mine.filter((f) => f.date > yearAgo)
      const last = mine[mine.length - 1]
      const recency = last ? daysBetween(last.date, t) : null
      const dates = year.map((f) => f.date)
      const gap = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1) : null
      const led = ledgers.get(d.id)
      const aging = emptyAging()
      let overdueDays = 0
      for (const x of led?.open || []) {
        const late = x.dueDate ? daysBetween(x.dueDate, t) : 0
        overdueDays = Math.max(overdueDays, late)
        aging[late <= 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'over90'] += x.out
      }
      const sales = sum(cur, (f) => f.total)
      return {
        id: d.id, name: d.name, area: d.area, sales, profit: sum(cur, (f) => f.profit), prevSales: sum(prev, (f) => f.total), growth: growth(sales, sum(prev, (f) => f.total)),
        frequency: year.length, recency, firstDate: mine[0]?.date || null, lastDate: last?.date || null, gap, segment: 'never',
        due: led?.due || 0, overdueDays, aging, share: ratio(sales, total), monthly: sum(year, (f) => f.total) / 12,
      }
    })
    // money cut-off from the dealers who bought this year: the top 30% are big buyers
    const bought = rows.filter((r) => r.frequency > 0).map((r) => r.monthly).sort((a, b) => b - a)
    const top = bought[Math.max(Math.ceil(bought.length * 0.3) - 1, 0)] ?? Infinity
    for (const r of rows) r.segment = segmentOf(r, days, top)
    return rows.sort((a, b) => b.sales - a.sales || b.due - a.due)
  })

function segmentOf(r: DealerInsight, days: number, topMonthly: number): Segment {
  if (r.recency === null) return 'never'
  if (r.recency > 90) return 'lost'
  // gone quiet: much longer than their usual gap between bills
  if (r.gap !== null && r.frequency >= 3 && r.recency > Math.max(r.gap * 2, 30)) return 'at-risk'
  if (r.firstDate && daysBetween(r.firstDate, today()) <= days) return 'new'
  if (r.recency <= 30 && r.frequency >= 6 && r.monthly >= topMonthly) return 'champion'
  if (r.frequency >= 4) return 'loyal'
  return 'promising'
}

/** One dealer's last twelve months: what they bought each month, their product mix. */
export const dealerMonths = (db: Db, dealerId: string, months = 12) =>
  memo(db, `ins:dm:${dealerId}:${months}`, () => {
    const keys = lastMonths(months)
    const m = new Map(keys.map((k) => [k, { sales: 0, profit: 0, bills: 0 }]))
    const mix = new Map<string, { id: string; name: string; sales: number; qty: number; unit: string }>()
    for (const f of saleFacts(db)) {
      if (f.dealerId !== dealerId || f.date < keys[0] + '-01') continue
      const r = m.get(f.date.slice(0, 7) as MonthKey)
      if (r) { r.sales += f.total; r.profit += f.profit; r.bills++ }
      for (const l of f.lines) {
        const x = mix.get(l.productId) || { id: l.productId, name: l.name, sales: 0, qty: 0, unit: l.unit }
        x.sales += l.amount
        x.qty += l.qty
        mix.set(l.productId, x)
      }
    }
    return { months: keys.map((k) => ({ key: k, short: monShort(k), long: fmonth(k), ...m.get(k)! })), mix: [...mix.values()].sort((a, b) => b.sales - a.sales) }
  })

/* ---------- concentration ---------- */

/** How much of the window's sales come from the biggest buyers. Over half from the top 5 is risky. */
export const concentration = (db: Db, days: InsightWindow) =>
  memo(db, 'ins:conc:' + days, () => {
    const rows = dealerInsights(db, days).filter((r) => r.sales > 0)
    const total = sum(rows, (r) => r.sales)
    const top = (n: number) => ratio(sum(rows.slice(0, n), (r) => r.sales), total)
    // Herfindahl index on shares: 1 = one buyer takes everything, near 0 = spread wide
    const hhi = sum(rows, (r) => (r.sales / (total || 1)) ** 2)
    return { top1: top(1), top5: top(5), top10: top(10), hhi, buyers: rows.length, biggest: rows[0] || null }
  })

/* ---------- cash ---------- */

export interface CashForecastPoint { key: string; label: string; inflow: number; outflow: number; balance: number }

/**
 * Working capital: days to collect from dealers (DSO), days goods sit in stock (DIO), days we take
 * to pay suppliers (DPO), and the cash cycle between them; and a 90-day forecast of the cash balance.
 */
export const cashInsights = (db: Db) =>
  memo(db, 'ins:cash', () => {
    const t = today()
    const from90 = addDays(t, -90)
    const facts = saleFacts(db).filter((f) => f.date > from90)
    const creditSales = sum(facts.filter((f) => f.terms === 'credit'), (f) => f.total) || sum(facts, (f) => f.total)
    const cogs = sum(facts, (f) => f.cost)
    const purchases = sum(db.purchases.filter((p) => p.date > from90), (p) => p.qty * p.rate + (p.tax || 0))
    const rec = receivables(db)
    const pay = payables(db)
    const stockValue = sum(db.products.filter((p) => !p.archived), (p) => Math.max(p.stock, 0) * p.cost)
    const dso = creditSales > 0 ? (rec.total / creditSales) * 90 : null
    const dio = cogs > 0 ? (stockValue / cogs) * 90 : null
    const dpo = purchases > 0 ? (pay.total / purchases) * 90 : null
    const cycle = dso !== null && dio !== null ? dso + dio - (dpo || 0) : null

    // regular running costs: the average of the last three full months' expenses and payroll
    const now = t.slice(0, 7) as MonthKey
    const lastFull = [1, 2, 3].map((i) => addMonths(now, -i))
    const monthlyCosts = sum(lastFull, (m) => sum(profitAndLoss(db, m).expenses, (e) => e.amount)) / 3
    // the next three months at the pace money actually moved over the last 90 days (from the cashbook),
    // so new sales and new bills are counted as well as dues already on the books
    const moves = cashEntries(db).filter((e) => e.date > from90 && e.date <= t)
    const runIn = sum(moves, (e) => e.in) / 3
    const runOut = sum(moves, (e) => e.out) / 3
    // overdue dues we expect to collect on top of the usual pace, counted at half
    const catchUp = sum(rec.rows.flatMap((l) => l.open), (d) => (d.dueDate && d.dueDate < t ? d.out : 0)) * 0.5
    const cashNow = sum(accountBalances(db, t), (a) => a.balance)
    let bal = cashNow
    const forecast: CashForecastPoint[] = [0, 1, 2].map((i) => {
      const inflow = runIn + (i === 0 ? catchUp : 0)
      const outflow = runOut
      bal += inflow - outflow
      return { key: String(i), label: i === 0 ? 'Next 30 days' : i === 1 ? '31–60 days' : '61–90 days', inflow, outflow, balance: bal }
    })
    const aging = emptyAging()
    for (const r of dealerInsights(db, 90)) for (const [k] of AGING_LABELS) aging[k] += r.aging[k]
    return { dso, dio, dpo, cycle, receivables: rec.total, payables: pay.total, stockValue, cashNow, monthlyCosts, runIn, runOut, forecast, aging, firstShort: forecast.find((f) => f.balance < 0) || null }
  })

/* ---------- suppliers ---------- */

export interface SupplierInsight {
  id: string
  name: string
  spend: number
  share: number
  bills: number
  /** Items whose latest price is more than 3% above their average before it. */
  priceRises: { productId: string; name: string; from: number; to: number; change: number }[]
  /** Short or damaged as a share of what was billed, over the bills counted in. */
  shortRate: number
  /** Average days late against the expected date, over bills counted in. */
  lateDays: number | null
  waiting: number
  due: number
}

export const supplierInsights = (db: Db, days: InsightWindow): SupplierInsight[] =>
  memo(db, 'ins:sup:' + days, () => {
    const w = windowDates(days)
    const dues = new Map(payables(db).rows.filter((r) => r.kind === 'supplier').map((r) => [r.key, r.due]))
    const inWindow = db.purchases.filter((p) => p.date > w.from)
    const total = sum(inWindow, (p) => p.qty * p.rate)
    return db.suppliers.map((s) => {
      const all = db.purchases.filter((p) => p.supplierId === s.id).sort((a, b) => (a.date < b.date ? -1 : 1))
      const mine = all.filter((p) => p.date > w.from)
      const spend = sum(mine, (p) => p.qty * p.rate)
      const priceRises: SupplierInsight['priceRises'] = []
      for (const pid of new Set(all.map((p) => p.productId))) {
        const list = all.filter((p) => p.productId === pid)
        if (list.length < 2) continue
        const last = list[list.length - 1]
        const earlier = list.slice(0, -1)
        const avg = sum(earlier, (p) => p.rate * p.qty) / (sum(earlier, (p) => p.qty) || 1)
        const change = ratio(last.rate - avg, avg)
        if (change > 0.03) priceRises.push({ productId: pid, name: byId(db.products, pid)?.name || 'Item', from: avg, to: last.rate, change })
      }
      const counted = all.filter((p) => !p.pending)
      const billed = sum(counted, (p) => p.qty)
      const late = counted.filter((p) => p.recv && p.expected).map((p) => Math.max(daysBetween(p.expected!, p.recv!.date), 0))
      return {
        id: s.id, name: s.name, spend, share: ratio(spend, total), bills: mine.length, priceRises,
        shortRate: billed > 0 ? ratio(billed - sum(counted, purchaseIn), billed) : 0,
        lateDays: late.length ? sum(late, (x) => x) / late.length : null,
        waiting: all.filter((p) => p.pending).length, due: dues.get(s.id) || 0,
      }
    }).sort((a, b) => b.spend - a.spend || b.due - a.due)
  })

/* ---------- imports and exports: how long each step takes ---------- */

export interface StepTime { key: string; label: string; avg: number; max: number; count: number }
export const tradeLeadTimes = (db: Db) =>
  memo(db, 'ins:lead', () => {
    const out: { import: StepTime[]; export: StepTime[]; landedShare: { label: string; value: number }[]; late: { id: string; step: string; expected: ISODate; days: number }[] } = { import: [], export: [], landedShare: [], late: [] }
    const t = today()
    for (const dir of ['import', 'export'] as const) {
      const ships = db.imports.filter((s) => (s.direction === 'export') === (dir === 'export'))
      if (!ships.length) continue
      const keys = stepKeys(ships[0])
      for (let i = 1; i < keys.length; i++) {
        const gaps: number[] = []
        for (const s of ships) {
          const a = s.steps[keys[i - 1]]?.date
          const b = s.steps[keys[i]]?.date
          if (a && b) gaps.push(Math.max(daysBetween(a, b), 0))
        }
        if (gaps.length) out[dir].push({ key: keys[i], label: `${stepLabel(keys[i - 1], ships[0])} → ${stepLabel(keys[i], ships[0])}`, avg: sum(gaps, (x) => x) / gaps.length, max: Math.max(...gaps), count: gaps.length })
      }
    }
    // what imports cost beyond the goods: the invoice against freight, duty and the rest
    const imps = db.imports.filter((s) => s.direction !== 'export' && s.steps.warehouse?.date)
    const invoice = sum(imps, (s) => shipmentCalc(db, s).invoiceTk)
    const types = new Map<string, number>()
    for (const s of imps) for (const c of s.costs) if (!c.recoverable) types.set(c.type, (types.get(c.type) || 0) + c.amount)
    out.landedShare = [{ label: 'Goods (invoice)', value: invoice }, ...[...types.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))]
    for (const s of db.imports) {
      const c = shipmentCalc(db, s)
      const next = c.next
      const exp = next ? s.steps[next]?.expected : undefined
      if (next && exp && exp < t) out.late.push({ id: s.id, step: stepLabel(next, s), expected: exp, days: daysBetween(exp, t) })
    }
    out.late.sort((a, b) => b.days - a.days)
    return out
  })

/* ---------- decisions ---------- */

export type Priority = 'high' | 'medium' | 'low'
export type DecisionArea = 'stock' | 'dealers' | 'cash' | 'pricing' | 'suppliers' | 'trade'
export const AREAS: Record<DecisionArea, string> = { stock: 'Stock', dealers: 'Dealers', cash: 'Cash', pricing: 'Pricing and margin', suppliers: 'Suppliers', trade: 'Imports and exports' }
export interface Decision {
  key: string
  area: DecisionArea
  priority: Priority
  title: string
  why: string
  action: string
  /** Money at stake, in Tk, to rank by; 0 when it cannot be put in money. */
  impact: number
  /** Where to act: a route like "dealers/d3". */
  href: string
  /** Needs the cost or profit permission to show its money. */
  money?: 'cost' | 'profit'
}

/** What to do next, most valuable first: reorders, money to chase, stock to clear, prices to fix. */
export const decisions = (db: Db, days: InsightWindow = 90): Decision[] =>
  memo(db, 'ins:decide:' + days, () => {
    const out: Decision[] = []
    const prods = productInsights(db, days)
    for (const p of prods) {
      const prod = byId(db.products, p.id)
      const route = prod?.kind === 'finished' ? 'products' : 'raw-materials'
      if (p.health === 'reorder' && p.perDay > 0) {
        const lost = p.perDay * REORDER_DAYS * (prod?.price || prod?.cost || 0)
        out.push({ key: 'reorder:' + p.id, area: 'stock', priority: (p.daysCover ?? 0) < 7 ? 'high' : 'medium', title: `Reorder ${p.name}`,
          why: p.stock <= 0 ? `Out of stock, and ${round(p.perDay * 30)} ${p.unit} go out a month.` : `About ${p.daysCover} days of stock left at ${round(p.perDay * 30)} ${p.unit} a month.`,
          action: `Order about ${round(p.perDay * (REORDER_DAYS + 30))} ${p.unit} to cover the next ${REORDER_DAYS + 30} days.`, impact: lost, href: route })
      }
      if (p.health === 'dead' && p.stockValue > 0) out.push({ key: 'dead:' + p.id, area: 'stock', priority: p.stockValue > 100000 ? 'medium' : 'low', title: `Clear ${p.name}`,
        why: `${round(p.stock)} ${p.unit} have not moved in ${days} days, holding up money.`, action: 'Offer it to dealers at a discount, use it, or return it to the supplier.', impact: p.stockValue, href: route, money: 'cost' })
      if (p.health === 'overstock' && p.daysCover !== null) {
        const excess = Math.max(p.stock - p.perDay * 90, 0) * (prod?.cost || 0)
        out.push({ key: 'over:' + p.id, area: 'stock', priority: 'low', title: `Too much ${p.name}`, why: `Enough for about ${Math.round(p.daysCover / 30)} months at the current pace.`,
          action: 'Hold off on buying more; push it in the next dealer offers.', impact: excess, href: route, money: 'cost' })
      }
      if (p.sales > 0 && p.margin !== null && p.margin < 0.05) out.push({ key: 'margin:' + p.id, area: 'pricing', priority: p.margin < 0 ? 'high' : 'medium', title: `${p.name} ${p.margin < 0 ? 'sells at a loss' : 'barely makes money'}`,
        why: `Margin ${Math.round(p.margin * 100)}% on ${round(p.qty)} ${p.unit} sold in ${days} days.`, action: 'Raise the price, cut the cost, or stop discounting it.', impact: Math.max(p.sales * 0.1 - p.profit, 0), href: 'products', money: 'profit' })
      if (p.prevPrice > 0 && p.prevUnitCost > 0 && p.unitCost > p.prevUnitCost * 1.05 && p.price <= p.prevPrice * 1.01 && p.qty > 0) out.push({ key: 'squeeze:' + p.id, area: 'pricing', priority: 'medium', title: `Costs up, price flat: ${p.name}`,
        why: `Cost per ${p.unit} rose ${Math.round(ratio(p.unitCost - p.prevUnitCost, p.prevUnitCost) * 100)}% but the selling price did not.`, action: 'Review the price list for this item.', impact: p.qty * (p.unitCost - p.prevUnitCost), href: 'products', money: 'cost' })
    }
    for (const d of dealerInsights(db, days)) {
      if (d.due > 0 && d.overdueDays > 30) out.push({ key: 'chase:' + d.id, area: 'dealers', priority: d.overdueDays > 60 ? 'high' : 'medium', title: `Collect from ${d.name}`,
        why: `${d.overdueDays} days overdue on the oldest bill.`, action: 'Call them, agree a payment date, and hold new credit until it is paid.', impact: d.due, href: 'dealers/' + d.id })
      if (d.segment === 'at-risk' && d.monthly > 0) out.push({ key: 'winback:' + d.id, area: 'dealers', priority: d.monthly > 50000 ? 'high' : 'medium', title: `${d.name} has gone quiet`,
        why: `No bill for ${d.recency} days; they usually buy every ${Math.round(d.gap || 0)} days.`, action: 'Send the salesperson; ask what changed, offer a reason to come back.', impact: d.monthly * 3, href: 'dealers/' + d.id })
    }
    const conc = concentration(db, days)
    if (conc.biggest && conc.top1 > 0.3) out.push({ key: 'conc', area: 'dealers', priority: 'medium', title: 'Too much depends on one dealer',
      why: `${conc.biggest.name} brings ${Math.round(conc.top1 * 100)}% of sales.`, action: 'Grow other dealers and areas; watch this dealer’s dues closely.', impact: conc.biggest.sales * 0.25, href: 'dealers/' + conc.biggest.id })
    const cash = cashInsights(db)
    if (cash.firstShort) out.push({ key: 'cashgap', area: 'cash', priority: 'high', title: `Cash runs short in the ${cash.firstShort.label.toLowerCase()}`,
      why: `At the last 90 days’ pace (${Math.round(cash.runIn).toLocaleString('en-IN')} in, ${Math.round(cash.runOut).toLocaleString('en-IN')} out a month) the balance falls to ${Math.round(cash.firstShort.balance).toLocaleString('en-IN')}.`, action: 'Collect overdue dues first, slow purchases, or arrange a bank limit.', impact: -cash.firstShort.balance, href: 'cashbook' })
    if (cash.dso !== null && cash.dso > 45) out.push({ key: 'dso', area: 'cash', priority: 'medium', title: 'Dealers take long to pay', why: `On average ${Math.round(cash.dso)} days from sale to cash.`,
      action: 'Shorten credit days for slow payers; give a small cash discount for paying early.', impact: cash.receivables * 0.1, href: 'cashbook' })
    for (const s of supplierInsights(db, days)) {
      for (const r of s.priceRises) out.push({ key: `price:${s.id}:${r.productId}`, area: 'suppliers', priority: r.change > 0.1 ? 'medium' : 'low', title: `${s.name} raised the price of ${r.name}`,
        why: `Last bill ${Math.round(r.change * 100)}% above their earlier average.`, action: 'Ask for the old rate or get a quote from another supplier.', impact: 0, href: 'suppliers/' + s.id, money: 'cost' })
      if (s.shortRate > 0.02) out.push({ key: 'short:' + s.id, area: 'suppliers', priority: 'low', title: `Short deliveries from ${s.name}`, why: `${(s.shortRate * 100).toFixed(1)}% of goods billed came short or damaged.`,
        action: 'Claim a credit note for the short goods and tighten checks at receiving.', impact: 0, href: 'suppliers/' + s.id })
    }
    for (const l of tradeLeadTimes(db).late) out.push({ key: 'late:' + l.id, area: 'trade', priority: l.days > 7 ? 'high' : 'medium', title: `${l.id} is late: ${l.step}`,
      why: `Expected ${l.days} day${l.days === 1 ? '' : 's'} ago.`, action: 'Call the forwarder or C&F agent and update the expected date.', impact: 0, href: 'trade/' + l.id })
    const rank = { high: 0, medium: 1, low: 2 }
    return out.sort((a, b) => rank[a.priority] - rank[b.priority] || b.impact - a.impact)
  })

const round = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n))
