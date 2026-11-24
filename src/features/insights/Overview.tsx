import { useState } from 'react'
import {
  dealerInsights, productInsights, salesDrivers, salesForecast, tk, tkShort, type InsightWindow,
} from '@shared/domain'
import { useSee } from '@/app/useSee'
import { CompareBars } from '@/components/charts/CompareBars'
import { DivergingBars } from '@/components/charts/DivergingBars'
import { ForecastChart } from '@/components/charts/ForecastChart'
import { Hidden } from '@/components/Hidden'
import { useBooks } from '@/core/store/context'
import { Card, Segmented, Stat, useSheets } from '@/ui'
import { DealerInsightSheet, ProductInsightSheet } from './InsightSheets'
import { Growth } from './Growth'
import { pct } from './pct'

/** The analytics overview: headline numbers, the forecast, who and what moved sales, and when we sell. */
export function Overview({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const prods = productInsights(db, days)
  const dls = dealerInsights(db, days)
  const fc = salesForecast(db)
  const drivers = salesDrivers(db, days)
  const [by, setBy] = useState<'dealers' | 'products' | 'areas'>('dealers')
  const sales = prods.reduce((s, r) => s + r.sales, 0)
  const before = prods.reduce((s, r) => s + r.prevSales, 0)
  const profit = prods.reduce((s, r) => s + r.profit, 0)
  const prevProfit = prods.reduce((s, r) => s + r.prevProfit, 0)
  const next = fc.next[1] || fc.next[0]
  const change = (now: number, b: number) => (b > 0 ? (now - b) / b : null)
  return (
    <>
      <div className="stats">
        <Stat icon="trend" label="Sales" value={tkShort(sales)} sub={<><Growth v={change(sales, before)} /> vs {tkShort(before)} before</>} />
        <Stat icon="money" label="Gross profit" value={see.profit ? tkShort(profit) : <Hidden />} sub={see.profit ? <><Growth v={change(profit, prevProfit)} /> · margin {pct(sales ? profit / sales : null)}</> : 'Hidden for your role'} />
        <Stat icon="target" label={`Expected ${next ? next.short : 'next month'}`} value={next?.forecast != null ? tkShort(next.forecast) : '—'} sub={next?.low != null ? `Likely ${tkShort(next.low)} – ${tkShort(next.high ?? 0)}` : 'Needs more history'} />
        <Stat icon="calendar" label="Last 12 months" value={fc.yearOnYear === null ? '—' : <Growth v={fc.yearOnYear} />} sub="Against the 12 before" />
      </div>

      <Card icon="trend" title="Sales and forecast" sub={fc.reliable
        ? `Trend ${fc.trendPerMonth >= 0 ? 'up' : 'down'} about ${pct(Math.abs(fc.trendPerMonth), 1)} a month${fc.seasonal ? ', adjusted for each month’s usual season' : ''}. The shaded band is where sales will likely land.`
        : 'The forecast gets better after six months of sales.'}>
        <ForecastChart data={fc.points} format={tk} />
      </Card>

      <div className="two-col">
        <Card icon="users" title="Top dealers" sub={`Last ${days} days against the ${days} before. Tap one for their deep dive.`}>
          <CompareBars rows={dls.filter((d) => d.sales > 0 || d.prevSales > 0).map((d) => ({ id: d.id, name: d.name, now: d.sales, before: d.prevSales }))} format={tkShort} empty="No dealer sales in this period."
            onPick={(r) => sheets.open(DealerInsightSheet, { dealerId: r.id, days })} />
        </Card>
        <Card icon="chart" title="What moved sales" sub={`${drivers.total >= 0 ? 'Up' : 'Down'} ${tkShort(Math.abs(drivers.total))} in all. The biggest gains and losses:`}
          action={<Segmented<string> label="By" value={by} onChange={(x) => setBy(x as typeof by)} options={[{ value: 'dealers', label: 'Dealers' }, { value: 'products', label: 'Items' }, { value: 'areas', label: 'Areas' }]} />}>
          <DivergingBars rows={drivers[by].map((r) => ({ id: r.id, name: r.name, value: r.delta, note: `${tkShort(r.now)} now, ${tkShort(r.before)} before` }))} format={tkShort} empty="No change to show."
            onPick={by === 'dealers' ? (r) => sheets.open(DealerInsightSheet, { dealerId: r.id, days }) : by === 'products' ? (r) => sheets.open(ProductInsightSheet, { productId: r.id, days }) : undefined} />
        </Card>
      </div>

    </>
  )
}
