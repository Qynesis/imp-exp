import type { AssetDepreciation, Db, FixedAsset, MonthKey } from '../types'
import { memo, sum } from './common'

const r2 = (n: number) => Math.round(n * 100) / 100

export const DEPRECIATION_METHODS: Record<FixedAsset['method'], string> = {
  straight: 'Straight line (same every month)',
  declining: 'Reducing balance (yearly rate)',
  none: 'No depreciation (land)',
}
export const ASSET_CATEGORIES = ['Machinery', 'Vehicle', 'Furniture', 'Computer and IT', 'Office equipment', 'Building', 'Land', 'Other'] as const

export const assets = (db: Db): FixedAsset[] => db.assets || []

export interface AssetCalc {
  accumulated: number
  /** Net book value: cost less depreciation booked so far. */
  nbv: number
  /** Depreciation for one month at today's value (0 when nothing is left to depreciate). */
  monthly: number
  /** Months booked so far. */
  months: number
  lastMonth: MonthKey | null
  fullyDepreciated: boolean
  /** On a disposed asset: sale price less book value. */
  gain: number | null
  statusText: string
}

/** Depreciation for one month, given the value left before it. Never takes the value below the scrap value. */
export function monthlyDepreciation(a: Pick<FixedAsset, 'cost' | 'salvage' | 'method' | 'lifeMonths' | 'rate'>, nbv: number): number {
  const room = Math.max(nbv - (a.salvage || 0), 0)
  if (room <= 0) return 0
  const raw = a.method === 'straight' ? (a.lifeMonths > 0 ? (a.cost - (a.salvage || 0)) / a.lifeMonths : 0) : a.method === 'declining' ? (nbv * (a.rate || 0)) / 1200 : 0
  return r2(Math.min(Math.max(raw, 0), room))
}

export const assetCalc = (a: FixedAsset): AssetCalc => {
  const accumulated = r2(sum(a.depreciation, (x) => x.amount))
  const nbv = r2(a.cost - accumulated)
  const monthly = a.status === 'active' ? monthlyDepreciation(a, nbv) : 0
  const sorted = [...a.depreciation].sort((x, y) => (x.month < y.month ? -1 : 1))
  const fullyDepreciated = a.method !== 'none' && nbv <= (a.salvage || 0) + 0.005
  const gain = a.status === 'disposed' ? r2((a.disposalAmount || 0) - nbv) : null
  return {
    accumulated, nbv, monthly, months: a.depreciation.length, lastMonth: sorted[sorted.length - 1]?.month || null, fullyDepreciated, gain,
    statusText: a.status === 'disposed' ? 'Disposed' : fullyDepreciated ? 'Fully depreciated' : 'Active',
  }
}

/** Active assets that still need depreciation booked for this month: bought in or before it and with value left. */
export function depreciationDue(db: Db, month: MonthKey): { asset: FixedAsset; amount: number }[] {
  return assets(db)
    .filter((a) => a.status === 'active' && a.method !== 'none' && a.date.slice(0, 7) <= month && !a.depreciation.some((x) => x.month === month))
    .map((asset) => ({ asset, amount: monthlyDepreciation(asset, assetCalc(asset).nbv) }))
    .filter((x) => x.amount > 0)
}

/** Depreciation booked for a month, for profit and loss. */
export const depreciationIn = (db: Db, month: MonthKey): number =>
  memo(db, 'dep:' + month, () => r2(sum(assets(db), (a) => sum(a.depreciation.filter((x) => x.month === month), (x) => x.amount))))

/** Profit (or loss, negative) on assets sold or scrapped in a month. */
export const assetGainIn = (db: Db, month: MonthKey): number =>
  memo(db, 'assetGain:' + month, () => r2(sum(assets(db).filter((a) => a.status === 'disposed' && a.disposedOn?.slice(0, 7) === month), (a) => assetCalc(a).gain || 0)))

export interface AssetSummary {
  count: number
  active: number
  cost: number
  accumulated: number
  nbv: number
  /** Depreciation of the active assets for one month at today's values. */
  monthly: number
  byCategory: { category: string; count: number; cost: number; nbv: number }[]
}

export const assetSummary = (db: Db): AssetSummary =>
  memo(db, 'assets', () => {
    const list = assets(db)
    const live = list.filter((a) => a.status === 'active')
    const calcs = live.map((a) => ({ a, c: assetCalc(a) }))
    const cats = new Map<string, { category: string; count: number; cost: number; nbv: number }>()
    for (const { a, c } of calcs) {
      const row = cats.get(a.category) || { category: a.category || 'Other', count: 0, cost: 0, nbv: 0 }
      row.count++
      row.cost += a.cost
      row.nbv += c.nbv
      cats.set(a.category, row)
    }
    return {
      count: list.length,
      active: live.length,
      cost: r2(sum(list, (a) => a.cost)),
      accumulated: r2(sum(list, (a) => assetCalc(a).accumulated)),
      nbv: r2(sum(calcs, (x) => x.c.nbv)),
      monthly: r2(sum(calcs, (x) => x.c.monthly)),
      byCategory: [...cats.values()].sort((x, y) => y.nbv - x.nbv),
    }
  })

/** Month by month: what each month takes off the value, until the asset reaches its scrap value. Booked months first. */
export function depreciationSchedule(a: FixedAsset, upTo = 120): (AssetDepreciation & { booked: boolean; nbv: number })[] {
  const booked = [...a.depreciation].sort((x, y) => (x.month < y.month ? -1 : 1))
  const out: (AssetDepreciation & { booked: boolean; nbv: number })[] = []
  let nbv = a.cost
  for (const x of booked) {
    nbv = r2(nbv - x.amount)
    out.push({ ...x, booked: true, nbv })
  }
  if (a.status !== 'active' || a.method === 'none') return out
  let month = booked.length ? nextMonth(booked[booked.length - 1].month) : a.date.slice(0, 7)
  for (let i = 0; i < upTo; i++) {
    const amount = monthlyDepreciation(a, nbv)
    if (amount <= 0) break
    nbv = r2(nbv - amount)
    out.push({ id: 'plan-' + month, month, date: month + '-28', amount, booked: false, nbv })
    month = nextMonth(month)
  }
  return out
}

const nextMonth = (m: MonthKey): MonthKey => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}
