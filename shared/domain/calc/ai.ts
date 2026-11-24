/**
 * Analytics that learn from the company's own history: a sales forecast with trend and season, and
 * who and what drove a change in sales. Pure and cached.
 */
import { addMonths, fmonth, monShort, parse, todayISO } from '../format'
import type { Db, MonthKey } from '../types'
import { byId, memo, sum } from './common'
import { windowDates, type InsightWindow } from './insights'
import { saleFacts } from './sales'

const today = () => todayISO()

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

