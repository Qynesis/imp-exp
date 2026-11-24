/**
 * Analytics that learn from the company's own history: a sales forecast with trend and season, days
 * that broke the usual pattern, what drove a change, and a compact digest of the whole business for
 * the AI analyst to read. Pure and cached; no data leaves the books here.
 */
import { addDays, addMonths, daysBetween, fmonth, monShort, parse, todayISO } from '../format'
import type { Db, ISODate, MonthKey } from '../types'
import { byId, memo, sum } from './common'
import { cashInsights, concentration, dealerInsights, decisions, productInsights, profitBridge, supplierInsights, tradeLeadTimes, windowDates, type InsightWindow } from './insights'
import { saleFacts } from './sales'

const today = () => todayISO()
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/* ---------- forecast ---------- */

export interface ForecastPoint {
  key: MonthKey
  short: string
  long: string
  /** What was sold; for the current month, so far. */
  actual: number | null
  /** The model's expected value; null for months before the forecast. */
  forecast: number | null
  /** 80% range around the forecast. */
  low: number | null
  high: number | null
}

/**
 * Monthly sales for the last 18 months and the next three, from a straight-line trend through the
 * finished months, adjusted by each calendar month's usual high or low once two years of history exist.
 * The range covers 80% of how far past months fell from the model.
 */
export const salesForecast = (db: Db, ahead = 3) =>
  memo(db, 'ai:forecast:' + ahead, () => {
    const now = today().slice(0, 7) as MonthKey
    const totals = new Map<string, number>()
    for (const f of saleFacts(db)) totals.set(f.date.slice(0, 7), (totals.get(f.date.slice(0, 7)) || 0) + f.total)
    // finished months only, from the first month with a sale, at most 36
    const first = [...totals.keys()].sort()[0]
    const done: MonthKey[] = []
    for (let k = addMonths(now, -36); k < now; k = addMonths(k, 1)) if (first && k >= first) done.push(k)
    const ys = done.map((k) => totals.get(k) || 0)
    const n = ys.length
    let slope = 0, icpt = n ? sum(ys, (y) => y) / n : 0
    if (n >= 3) {
      const xm = (n - 1) / 2
      const ym = icpt
      let sxx = 0, sxy = 0
      ys.forEach((y, i) => { sxx += (i - xm) ** 2; sxy += (i - xm) * (y - ym) })
      slope = sxx ? sxy / sxx : 0
      icpt = ym - slope * xm
    }
    const trend = (i: number) => Math.max(icpt + slope * i, 0)
    // seasonal index per calendar month: how far that month usually sits above or below the trend
    const season = new Map<number, number>()
    if (n >= 24) {
      const by = new Map<number, number[]>()
      done.forEach((k, i) => {
        const t = trend(i)
        if (t > 0) by.set(parse(k + '-01').getMonth(), [...(by.get(parse(k + '-01').getMonth()) || []), ys[i] / t])
      })
      for (const [m, r] of by) season.set(m, Math.min(Math.max(sum(r, (x) => x) / r.length, 0.6), 1.6))
    }
    const model = (i: number, k: MonthKey) => trend(i) * (season.get(parse(k + '-01').getMonth()) ?? 1)
    const resid = ys.map((y, i) => y - model(i, done[i]))
    const sd = n > 2 ? Math.sqrt(sum(resid, (r) => r * r) / (n - 2)) : 0
    const z = 1.28
    const points: ForecastPoint[] = []
    for (const k of done.slice(-18)) points.push({ key: k, short: monShort(k), long: fmonth(k), actual: totals.get(k) || 0, forecast: null, low: null, high: null })
    for (let j = 0; j < ahead; j++) {
      const k = addMonths(now, j)
      const v = n >= 3 ? model(n + j, k) : null
      // the range widens the further ahead we look
      const w = v === null ? 0 : z * sd * Math.sqrt(1 + j * 0.5)
      points.push({ key: k, short: monShort(k), long: fmonth(k), actual: j === 0 ? totals.get(k) || 0 : null, forecast: v, low: v === null ? null : Math.max(v - w, 0), high: v === null ? null : v + w })
    }
    const last12 = sum(ys.slice(-12), (y) => y)
    const prev12 = sum(ys.slice(-24, -12), (y) => y)
    return {
      points, months: n, seasonal: season.size > 0,
      /** Growth per month the trend line shows, as a share of the average month. */
      trendPerMonth: icpt > 0 && n ? slope / (sum(ys, (y) => y) / n) : 0,
      yearOnYear: prev12 > 0 ? (last12 - prev12) / prev12 : null,
      next: points.filter((p) => p.forecast !== null),
      reliable: n >= 6,
    }
  })

/* ---------- unusual days ---------- */

export interface Anomaly {
  date: ISODate
  kind: 'spike' | 'drop'
  value: number
  /** What a usual day like this one brings: the median of the same weekday over the 8 weeks before. */
  expected: number
  /** How unusual, in robust standard deviations. */
  score: number
  why: string
}

/** Days in the window whose sales were far above or below the usual for that weekday. */
export const salesAnomalies = (db: Db, days: InsightWindow) =>
  memo(db, 'ai:anom:' + days, () => {
    const t = today()
    const byDay = new Map<string, number>()
    const facts = saleFacts(db)
    for (const f of facts) byDay.set(f.date, (byDay.get(f.date) || 0) + f.total)
    const out: Anomaly[] = []
    for (let d = addDays(t, -Math.min(days, 120)); d < t; d = addDays(d, 1)) {
      const base = Array.from({ length: 8 }, (_, i) => byDay.get(addDays(d, -7 * (i + 1))) || 0)
      if (base.filter((x) => x > 0).length < 4) continue // a weekday we do not usually sell on
      const med = median(base)
      const mad = median(base.map((x) => Math.abs(x - med))) * 1.4826
      const spread = Math.max(mad, med * 0.15, 1)
      const v = byDay.get(d) || 0
      const score = (v - med) / spread
      if (Math.abs(score) < 3 || Math.abs(v - med) < med * 0.3) continue
      const dayFacts = facts.filter((f) => f.date === d)
      let why: string
      if (score > 0) {
        const top = [...dayFacts].sort((a, b) => b.total - a.total)[0]
        why = top ? `${byId(db.dealers, top.dealerId)?.name || 'A dealer'} bought ${Math.round(top.total).toLocaleString('en-IN')} on one bill` : 'More bills than usual'
      } else {
        // dealers who usually buy on this weekday and did not
        const usual = new Map<string, number>()
        for (let i = 1; i <= 8; i++) for (const f of facts.filter((x) => x.date === addDays(d, -7 * i))) usual.set(f.dealerId, (usual.get(f.dealerId) || 0) + 1)
        const missing = [...usual.entries()].filter(([id, c]) => c >= 4 && !dayFacts.some((f) => f.dealerId === id)).map(([id]) => byId(db.dealers, id)?.name || 'a dealer')
        why = v === 0 ? 'No sales at all' : missing.length ? `${missing.slice(0, 2).join(' and ')} did not buy as usual` : 'Fewer and smaller bills than usual'
      }
      out.push({ date: d, kind: score > 0 ? 'spike' : 'drop', value: v, expected: med, score, why })
    }
    return out.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 8)
  })

/* ---------- what drove the change ---------- */

export interface Driver { id: string; name: string; now: number; before: number; delta: number }

/** Who and what moved sales between the window before and this one, biggest moves first. */
export const salesDrivers = (db: Db, days: InsightWindow) =>
  memo(db, 'ai:drivers:' + days, () => {
    const w = windowDates(days)
    const dealers = new Map<string, Driver>()
    const products = new Map<string, Driver>()
    const areas = new Map<string, Driver>()
    const bump = (m: Map<string, Driver>, id: string, name: string, cur: boolean, v: number) => {
      const r = m.get(id) || { id, name, now: 0, before: 0, delta: 0 }
      if (cur) r.now += v
      else r.before += v
      r.delta = r.now - r.before
      m.set(id, r)
    }
    for (const f of saleFacts(db)) {
      const cur = f.date > w.from && f.date <= w.to
      if (!cur && !(f.date > w.prevFrom && f.date <= w.prevTo)) continue
      const d = byId(db.dealers, f.dealerId)
      bump(dealers, f.dealerId, d?.name || 'Removed dealer', cur, f.total)
      bump(areas, d?.area || 'No area', d?.area || 'No area', cur, f.total)
      for (const l of f.lines) bump(products, l.productId, l.name, cur, l.amount)
    }
    const rank = (m: Map<string, Driver>) => [...m.values()].filter((r) => Math.abs(r.delta) > 0.5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const total = sum([...dealers.values()], (r) => r.delta)
    return { dealers: rank(dealers), products: rank(products), areas: rank(areas), total }
  })

/* ---------- when we sell ---------- */

export const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
/** Sales per day for the last `weeks` weeks, as rows of weeks (oldest first) and columns Saturday to Friday. */
export const salesHeat = (db: Db, weeks = 12) =>
  memo(db, 'ai:heat:' + weeks, () => {
    const byDay = new Map<string, number>()
    for (const f of saleFacts(db)) byDay.set(f.date, (byDay.get(f.date) || 0) + f.total)
    const t = today()
    // the Saturday that starts this week (Bangladesh weeks run Saturday to Friday)
    const start = addDays(t, -((parse(t).getDay() + 1) % 7))
    const rows = Array.from({ length: weeks }, (_, i) => {
      const from = addDays(start, -7 * (weeks - 1 - i))
      return { week: from, days: WEEKDAYS.map((_, j) => { const d = addDays(from, j); return { date: d, value: d > t ? null : byDay.get(d) || 0 } }) }
    })
    const all = rows.flatMap((r) => r.days.map((d) => d.value || 0))
    const avg = WEEKDAYS.map((_, j) => { const v = rows.map((r) => r.days[j].value).filter((x): x is number => x !== null); return v.length ? sum(v, (x) => x) / v.length : 0 })
    return { rows, max: Math.max(...all, 0), weekdayAverage: avg, best: WEEKDAYS[avg.indexOf(Math.max(...avg))], worst: WEEKDAYS[avg.indexOf(Math.min(...avg.filter((a) => a > 0), Infinity))] }
  })

/* ---------- the digest the AI reads ---------- */

/**
 * Everything the analyst needs about the business in one compact, rounded object. Names and amounts
 * only; no phone numbers, addresses or people's details. `see` limits money the role may not see.
 */
export function businessDigest(db: Db, days: InsightWindow, see: { cost: boolean; profit: boolean }) {
  const r = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n))
  const p = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 10)
  const prods = productInsights(db, days)
  const dls = dealerInsights(db, days)
  const w = windowDates(days)
  const totalNow = sum(prods, (x) => x.sales)
  const totalBefore = sum(prods, (x) => x.prevSales)
  const cash = cashInsights(db)
  const fc = salesForecast(db)
  const drivers = salesDrivers(db, days)
  return {
    company: db.company.name || 'The company',
    period: { days, from: w.from, to: w.to, comparedWith: `${w.prevFrom} to ${w.prevTo}` },
    currency: 'Taka',
    sales: { now: r(totalNow), before: r(totalBefore), changePct: p(totalBefore ? (totalNow - totalBefore) / totalBefore : null), grossProfit: see.profit ? r(sum(prods, (x) => x.profit)) : 'hidden', profitBefore: see.profit ? r(sum(prods, (x) => x.prevProfit)) : 'hidden' },
    profitBridge: see.profit ? profitBridge(db, days).steps.map((s) => ({ reason: s.label, amount: r(s.value) })) : 'hidden',
    forecast: { reliable: fc.reliable, monthsOfHistory: fc.months, yearOnYearPct: p(fc.yearOnYear), trendPerMonthPct: p(fc.trendPerMonth), next: fc.next.map((x) => ({ month: x.long, expected: r(x.forecast), low: r(x.low), high: r(x.high), soFar: x.actual })) },
    topProducts: prods.filter((x) => x.sales > 0).slice(0, 8).map((x) => ({ name: x.name, abc: x.abc, sales: r(x.sales), changePct: p(x.growth), marginPct: see.profit ? p(x.margin) : 'hidden', daysOfStock: x.daysCover, health: x.health })),
    stockProblems: prods.filter((x) => x.health !== 'healthy' && x.health !== 'none').slice(0, 10).map((x) => ({ name: x.name, health: x.health, daysOfStock: x.daysCover, valueTied: see.cost ? r(x.stockValue) : 'hidden' })),
    dealers: {
      buying: dls.filter((x) => x.sales > 0).length, total: dls.length,
      segments: Object.fromEntries(['champion', 'loyal', 'new', 'promising', 'at-risk', 'lost', 'never'].map((s) => [s, dls.filter((x) => x.segment === s).length])),
      top: dls.slice(0, 8).map((x) => ({ name: x.name, area: x.area, segment: x.segment, sales: r(x.sales), changePct: p(x.growth), sharePct: p(x.share), owes: r(x.due), daysLate: x.overdueDays })),
      atRisk: dls.filter((x) => x.segment === 'at-risk').slice(0, 5).map((x) => ({ name: x.name, daysSinceLastBill: x.recency, usualGapDays: x.gap ? Math.round(x.gap) : null, monthlyAverage: r(x.monthly) })),
      concentration: (() => { const c = concentration(db, days); return { topDealerPct: p(c.top1), top5Pct: p(c.top5) } })(),
    },
    drivers: { dealers: drivers.dealers.slice(0, 5).map((x) => ({ name: x.name, change: r(x.delta) })), products: drivers.products.slice(0, 5).map((x) => ({ name: x.name, change: r(x.delta) })), areas: drivers.areas.slice(0, 5).map((x) => ({ name: x.name, change: r(x.delta) })) },
    unusualDays: salesAnomalies(db, days).slice(0, 5).map((a) => ({ date: a.date, kind: a.kind, sales: r(a.value), usual: r(a.expected), why: a.why })),
    cash: { now: r(cash.cashNow), owedToUs: r(cash.receivables), weOwe: see.cost ? r(cash.payables) : 'hidden', daysToCollect: r(cash.dso), daysInStock: r(cash.dio), daysToPay: r(cash.dpo), next90Days: cash.forecast.map((f) => ({ period: f.label, balance: r(f.balance) })), overdueByAge: Object.fromEntries(Object.entries(cash.aging).map(([k, v]) => [k, r(v)])) },
    suppliers: see.cost ? supplierInsights(db, days).slice(0, 5).map((s) => ({ name: s.name, spend: r(s.spend), priceRises: s.priceRises.map((x) => `${x.name} +${p(x.change)}%`), shortPct: p(s.shortRate), owed: r(s.due) })) : 'hidden',
    trade: (() => { const t = tradeLeadTimes(db); return { importDays: t.import.map((x) => ({ step: x.label, avgDays: Math.round(x.avg) })), lateShipments: t.late.slice(0, 5).map((x) => ({ id: x.id, waitingFor: x.step, daysLate: x.days })) } })(),
    flaggedDecisions: decisions(db, days).filter((d) => !d.money || see[d.money]).slice(0, 12).map((d) => ({ priority: d.priority, area: d.area, title: d.title, why: d.why, moneyAtStake: r(d.impact) })),
  }
}
export type BusinessDigest = ReturnType<typeof businessDigest>

/* ---------- the briefing ---------- */

export interface BriefAction { title: string; why: string; impact?: string }
export interface Brief {
  headline: string
  summary: string
  wins: string[]
  risks: string[]
  actions: BriefAction[]
  /** 'ai' when Claude wrote it; 'rules' when it was put together from the numbers here. */
  source: 'ai' | 'rules'
  /** Answer to the person's question, when they asked one. */
  answer?: string
}

const money = (n: number | null) => (n == null ? '—' : 'Tk ' + Math.round(n).toLocaleString('en-IN'))
const pctTxt = (n: number | null) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${n}%`)

/** A briefing built from the numbers alone, for when no AI key is set up or the AI is unreachable. */
export function rulesBrief(d: BusinessDigest): Brief {
  const up = (d.sales.changePct ?? 0) >= 0
  const wins: string[] = []
  const risks: string[] = []
  if (d.sales.changePct !== null && d.sales.changePct > 0) wins.push(`Sales up ${pctTxt(d.sales.changePct)} to ${money(d.sales.now)} against the ${d.period.days} days before.`)
  const grew = d.drivers.dealers.filter((x) => (x.change ?? 0) > 0)[0]
  if (grew) wins.push(`${grew.name} added the most: ${money(grew.change)} more than before.`)
  const champs = d.dealers.segments.champion || 0
  if (champs) wins.push(`${champs} champion dealer${champs === 1 ? '' : 's'} buying often and recently.`)
  if (d.forecast.yearOnYearPct !== null && d.forecast.yearOnYearPct > 0) wins.push(`The last 12 months are ${pctTxt(d.forecast.yearOnYearPct)} on the 12 before.`)
  if (d.sales.changePct !== null && d.sales.changePct < 0) risks.push(`Sales down ${Math.abs(d.sales.changePct)}% to ${money(d.sales.now)}.`)
  const fell = d.drivers.dealers.filter((x) => (x.change ?? 0) < 0)[0]
  if (fell) risks.push(`${fell.name} bought ${money(-(fell.change ?? 0))} less than before.`)
  if (d.dealers.concentration.topDealerPct !== null && d.dealers.concentration.topDealerPct > 30) risks.push(`One dealer brings ${d.dealers.concentration.topDealerPct}% of sales.`)
  const late = d.cash.overdueByAge
  const lateSum = (late.d30 || 0) + (late.d60 || 0) + (late.d90 || 0) + (late.over90 || 0)
  if (lateSum > 0) risks.push(`${money(lateSum)} of dealer dues are past their due date.`)
  if (d.stockProblems.some((x) => x.health === 'reorder')) risks.push(`${d.stockProblems.filter((x) => x.health === 'reorder').length} item(s) will run out within three weeks.`)
  const short = d.cash.next90Days.find((x) => (x.balance ?? 0) < 0)
  if (short) risks.push(`Cash may go below zero in the ${short.period.toLowerCase()}.`)
  const next = d.forecast.next[1] || d.forecast.next[0]
  return {
    headline: `${up ? 'Sales are growing' : 'Sales are slowing'}${d.flaggedDecisions.some((x) => x.priority === 'high') ? `, with ${d.flaggedDecisions.filter((x) => x.priority === 'high').length} things to act on now` : ''}.`,
    summary: `${d.company} sold ${money(d.sales.now)} in the last ${d.period.days} days (${pctTxt(d.sales.changePct)}).${next?.expected ? ` ${next.month} is expected around ${money(next.expected)} (likely ${money(next.low)} to ${money(next.high)}).` : ''} Dealers owe ${money(d.cash.owedToUs)}; cash on hand ${money(d.cash.now)}.`,
    wins: wins.slice(0, 4),
    risks: risks.slice(0, 4),
    actions: d.flaggedDecisions.slice(0, 5).map((x) => ({ title: x.title, why: x.why, impact: x.moneyAtStake ? money(x.moneyAtStake) : undefined })),
    source: 'rules',
  }
}

/** How old a briefing may be before it is worth asking again, in days. */
export const BRIEF_FRESH_DAYS = 1
export const briefAge = (at: string) => daysBetween(at.slice(0, 10), today())
