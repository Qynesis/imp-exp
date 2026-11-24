import { AGING_LABELS, byId, dealerInsights, dealerMonths, fdate, fmt, productInsights, productMonths, SEGMENTS, STOCK_HEALTH, tk, tkShort, type InsightWindow } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Hidden } from '@/components/Hidden'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Sheet, useSheetItem, type SheetComponent } from '@/ui'
import { Growth } from './Growth'
import { pct } from './pct'

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => <div><span>{label}</span><b>{children}</b></div>

/** One product in depth: twelve months of sales and profit, who buys it, and how its stock is doing. */
export const ProductInsightSheet: SheetComponent<{ productId: string; days: InsightWindow }> = ({ productId, days }) => {
  const { db } = useBooks()
  const see = useSee()
  const { close } = useSheetItem()
  const r = productInsights(db, days).find((x) => x.id === productId)
  const p = byId(db.products, productId)
  if (!r || !p) return <Sheet title="Item not found"><p className="t-muted">It may have been removed.</p></Sheet>
  const h = productMonths(db, productId)
  const best = [...h.months].sort((a, b) => b.sales - a.sales)[0]
  return (
    <Sheet title={r.name} crumb={`Business insights · last ${days} days`} wide
      footer={<><Button variant="secondary" onClick={close}>Close</Button><Button onClick={() => { close(); go(p.kind === 'finished' ? 'products' : 'raw-materials') }}>Open in stock</Button></>}>
      <div className="facts">
        <Fact label="Sales">{tk(r.sales)} <Growth v={r.growth} /></Fact>
        <Fact label="Class">{r.abc === '-' ? 'No sales' : `${r.abc} item`}</Fact>
        <Fact label="Margin">{see.profit ? pct(r.margin) : <Hidden />}</Fact>
        <Fact label="Average price">{r.price ? `${tk(r.price)} / ${r.unit}` : '—'}</Fact>
        <Fact label="Stock">{fmt(r.stock)} {r.unit} · {STOCK_HEALTH[r.health]}</Fact>
        <Fact label="Lasts">{r.daysCover === null ? 'No recent use' : `${fmt(r.daysCover)} days`}</Fact>
        <Fact label="Turns a year">{r.turns === null ? '—' : r.turns.toFixed(1)}</Fact>
        <Fact label="Stock value">{see.cost ? tk(r.stockValue) : <Hidden />}</Fact>
      </div>
      <p className="form-sub">Last twelve months</p>
      <ColumnChart data={h.months.map((m) => ({ key: m.key, short: m.short, long: m.long, value: m.sales, line: see.profit ? m.profit : null, extra: [['Quantity', `${fmt(m.qty)} ${r.unit}`]] }))} valueName="Sales" lineName={see.profit ? 'Profit' : undefined} format={tkShort} height={220} />
      <p className="t-muted small-note">{best && best.sales > 0 ? `Best month: ${best.long}, ${tk(best.sales)}.` : 'No sales in the last twelve months.'} {r.prevPrice > 0 && r.price > 0 ? `Average price ${r.price >= r.prevPrice ? 'up' : 'down'} ${pct(Math.abs((r.price - r.prevPrice) / r.prevPrice), 1)} on the period before.` : ''}</p>
      <p className="form-sub">Who buys it (twelve months)</p>
      <BarList share="of its sales" rows={h.buyers.map((b) => ({ id: b.id, name: b.name, value: b.sales, note: `${fmt(b.qty)} ${r.unit}` }))} format={tkShort} limit={6} empty="No dealer bought it in the last twelve months." />
    </Sheet>
  )
}

/** One dealer in depth: twelve months of buying, what they buy, how they pay. */
export const DealerInsightSheet: SheetComponent<{ dealerId: string; days: InsightWindow }> = ({ dealerId, days }) => {
  const { db } = useBooks()
  const see = useSee()
  const { close } = useSheetItem()
  const r = dealerInsights(db, days).find((x) => x.id === dealerId)
  if (!r) return <Sheet title="Dealer not found"><p className="t-muted">They may have been removed.</p></Sheet>
  const h = dealerMonths(db, dealerId)
  const active = h.months.filter((m) => m.bills > 0).length
  return (
    <Sheet title={r.name} crumb={`Business insights · last ${days} days`} wide
      footer={<><Button variant="secondary" onClick={close}>Close</Button><Button onClick={() => { close(); go('dealers/' + r.id) }}>Open dealer</Button></>}>
      <div className="facts">
        <Fact label="Segment">{SEGMENTS[r.segment].label}</Fact>
        <Fact label="Sales">{tk(r.sales)} <Growth v={r.growth} /></Fact>
        <Fact label="Share of all sales">{pct(r.share)}</Fact>
        <Fact label="Profit">{see.profit ? tk(r.profit) : <Hidden />}</Fact>
        <Fact label="Last bill">{r.lastDate ? `${fdate(r.lastDate)} (${r.recency} days ago)` : 'Never'}</Fact>
        <Fact label="Buys every">{r.gap ? `${Math.round(r.gap)} days` : '—'}</Fact>
        <Fact label="Monthly average">{tk(r.monthly)}</Fact>
        <Fact label="Owes">{r.due > 0 ? `${tk(r.due)}${r.overdueDays > 0 ? ` · ${r.overdueDays} days late` : ''}` : 'Nothing'}</Fact>
      </div>
      <p className="form-sub">Last twelve months</p>
      <ColumnChart data={h.months.map((m) => ({ key: m.key, short: m.short, long: m.long, value: m.sales, line: see.profit ? m.profit : null, extra: [['Bills', fmt(m.bills)]] }))} valueName="Bought" lineName={see.profit ? 'Profit' : undefined} format={tkShort} height={220} />
      <p className="t-muted small-note">Bought in {active} of the last 12 months. {SEGMENTS[r.segment].hint}.</p>
      <div className="two-col">
        <div>
          <p className="form-sub">What they buy</p>
          <BarList share="of their buying" rows={h.mix.map((x) => ({ id: x.id, name: x.name, value: x.sales, note: `${fmt(x.qty)} ${x.unit}` }))} format={tkShort} limit={5} empty="Nothing bought in twelve months." />
        </div>
        <div>
          <p className="form-sub">What they owe, by lateness</p>
          <BarList share="of their due" rows={AGING_LABELS.map(([k, label]) => ({ id: k, name: label, value: r.aging[k] })).filter((x) => x.value > 0)} format={tkShort} limit={5} empty="Nothing owed." />
        </div>
      </div>
    </Sheet>
  )
}
