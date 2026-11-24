import { useState, type ReactNode } from 'react'
import {
  AGING_LABELS, AREAS, cashInsights, concentration, dealerInsights, decisions, fdate, fmt, productInsights, profitBridge, SEGMENTS, STOCK_HEALTH,
  supplierInsights, tk, tk as tkRaw, tkShort, tradeLeadTimes, whatIf, WINDOWS, type DecisionArea, type InsightWindow, type Priority, type Segment, type StockHealth,
} from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { useSee } from '@/app/useSee'
import { BarList } from '@/components/charts/BarList'
import { FilterPanel, FilterSelect } from '@/components/filters/Filters'
import { useFilters } from '@/components/filters/filterState'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Card, cls, DataTable, Empty, Pill, SearchBox, Segmented, Stat, useSheets } from '@/ui'
import { DealerInsightSheet, ProductInsightSheet } from './InsightSheets'
import { Growth } from './Growth'
import { AiAnalyst } from './AiAnalyst'
import { Overview } from './Overview'
import { ScatterChart } from '@/components/charts/ScatterChart'
import { WaterfallChart } from '@/components/charts/WaterfallChart'
import { CompareBars } from '@/components/charts/CompareBars'
import { pct } from './pct'

type Tab = 'overview' | 'ai' | 'decide' | 'products' | 'dealers' | 'profit' | 'cash' | 'suppliers' | 'trade'
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' }, { value: 'ai', label: 'AI analyst' }, { value: 'decide', label: 'Decisions' }, { value: 'products', label: 'Products and stock' }, { value: 'dealers', label: 'Dealers' },
  { value: 'profit', label: 'Profit and what-if' }, { value: 'cash', label: 'Cash' }, { value: 'suppliers', label: 'Suppliers' }, { value: 'trade', label: 'Import and export' },
]
const PRIORITY_TONE: Record<Priority, 'warn' | 'info' | 'neutral'> = { high: 'warn', medium: 'info', low: 'neutral' }
const HEALTH_TONE: Record<StockHealth, 'warn' | 'info' | 'good' | 'neutral' | 'muted'> = { reorder: 'warn', low: 'info', healthy: 'good', overstock: 'info', dead: 'warn', none: 'muted' }
const SEG_TONE: Record<Segment, 'good' | 'info' | 'warn' | 'neutral' | 'muted'> = { champion: 'good', loyal: 'good', new: 'info', promising: 'neutral', 'at-risk': 'warn', lost: 'warn', never: 'muted' }

/** #/insights[/tab]: deep-dive analytics across the business, and the decisions they point to. */
export default function InsightsPage({ params: [t] }: FeatureRouteProps) {
  const tab: Tab = TABS.some((x) => x.value === t) ? (t as Tab) : 'overview'
  const [days, setDays] = useState<InsightWindow>(90)
  return (
    <>
      <PageHead title="Business insights" sub="Deep-dive analysis of products, dealers, profit, cash, suppliers and trade, and the decisions it points to."
        actions={<Segmented<string> label="Period" value={String(days)} onChange={(x) => setDays(Number(x) as InsightWindow)} options={WINDOWS.map((w) => ({ value: String(w), label: w === 365 ? '1 year' : `${w} days` }))} />} />
      <Segmented<Tab> label="Insights section" value={tab} onChange={(x) => go('insights/' + x)} options={TABS} />
      <p className="t-muted small-note">Last {days === 365 ? 'year' : `${days} days`} up to today, compared with the {days === 365 ? 'year' : `${days} days`} before.</p>
      {tab === 'overview' && <Overview days={days} />}
      {tab === 'ai' && <AiAnalyst key={days} days={days} />}
      {tab === 'decide' && <Decisions days={days} />}
      {tab === 'products' && <Products days={days} />}
      {tab === 'dealers' && <Dealers days={days} />}
      {tab === 'profit' && <Profit days={days} />}
      {tab === 'cash' && <Cash />}
      {tab === 'suppliers' && <Suppliers days={days} />}
      {tab === 'trade' && <Trade />}
    </>
  )
}

/** Money the role may see: costs need the cost permission, profit the profit permission. */
function useMoney() {
  const see = useSee()
  return {
    see,
    cost: (n: number): ReactNode => (see.cost ? tk(n) : <Hidden />),
    profit: (n: number): ReactNode => (see.profit ? tk(n) : <Hidden />),
  }
}

/* ---------- decisions ---------- */

function Decisions({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const { see } = useMoney()
  const all = decisions(db, days)
  const [area, setArea] = useState<'' | DecisionArea>('')
  const shown = all.filter((d) => !area || d.area === area)
  const visible = (d: (typeof all)[number]) => !d.money || see[d.money]
  const atStake = all.filter((d) => d.priority !== 'low' && visible(d)).reduce((s, d) => s + d.impact, 0)
  const areas = [...new Set(all.map((d) => d.area))]
  return (
    <>
      <div className="stats">
        <Stat icon="alert" label="Act now" value={fmt(all.filter((d) => d.priority === 'high').length)} tone={all.some((d) => d.priority === 'high') ? 'warn' : undefined} sub="High priority" />
        <Stat icon="target" label="This week" value={fmt(all.filter((d) => d.priority === 'medium').length)} sub="Medium priority" />
        <Stat icon="check" label="Keep an eye on" value={fmt(all.filter((d) => d.priority === 'low').length)} sub="Low priority" />
        <Stat icon="money" label="Money at stake" value={tkShort(atStake)} sub="High and medium items" />
      </div>
      <Card icon="sparkle" title="What to do next" sub="Ranked by priority, then by the money involved. Tap one to go where you act on it.">
        <div className="card-body pt0 filter-bar">
          <Segmented<string> label="Area" value={area} onChange={(x) => setArea(x as DecisionArea | '')} options={[{ value: '', label: `All (${all.length})` }, ...areas.map((a) => ({ value: a, label: `${AREAS[a]} (${all.filter((d) => d.area === a).length})` }))]} />
        </div>
        {!shown.length ? <Empty>Nothing needs a decision right now. Stock, dues, prices and shipments look on track.</Empty> : (
          <ol className="decisions">
            {shown.map((d) => (
              <li key={d.key}>
                <button type="button" className={cls('decision', d.priority)} onClick={() => go(d.href)}>
                  <span className="decision-top">
                    <Pill tone={PRIORITY_TONE[d.priority]}>{d.priority === 'high' ? 'Act now' : d.priority === 'medium' ? 'This week' : 'Watch'}</Pill>
                    <small className="t-muted">{AREAS[d.area]}</small>
                    {d.impact > 0 && <b className="decision-impact">{visible(d) ? tkShort(d.impact) : <Hidden />}</b>}
                  </span>
                  <b className="decision-title">{d.title}</b>
                  <span className="t-muted">{d.why}</span>
                  <span className="decision-action">→ {d.action}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  )
}

/* ---------- products ---------- */

function Products({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const m = useMoney()
  const sheets = useSheets()
  const rows = productInsights(db, days)
  const [q, setQ] = useState('')
  const f = useFilters({ abc: '', health: '', kind: '' })
  const n = q.trim().toLowerCase()
  const shown = rows.filter((r) => (!f.v.abc || r.abc === f.v.abc) && (!f.v.health || r.health === f.v.health) && (!f.v.kind || (f.v.kind === 'finished' ? r.kind === 'finished' : r.kind !== 'finished')) && (!n || r.name.toLowerCase().includes(n)))
  const total = rows.reduce((s, r) => s + r.sales, 0)
  const cls3 = (c: string) => rows.filter((r) => r.abc === c)
  const tied = rows.filter((r) => r.health === 'dead' || r.health === 'overstock').reduce((s, r) => s + r.stockValue, 0)
  return (
    <>
      <div className="stats">
        <Stat icon="target" label="A items" value={fmt(cls3('A').length)} sub={`${pct(total ? cls3('A').reduce((s, r) => s + r.sales, 0) / total : 0)} of sales — never run out`} />
        <Stat icon="layers" label="B and C items" value={fmt(cls3('B').length + cls3('C').length)} sub="The rest of sales" />
        <Stat icon="alert" label="Need reordering" value={fmt(rows.filter((r) => r.health === 'reorder').length)} tone={rows.some((r) => r.health === 'reorder') ? 'warn' : undefined} sub={`Under ${21} days of stock`} />
        <Stat icon="archive" label="Money stuck in stock" value={m.see.cost ? tkShort(tied) : <Hidden />} sub="Not moving or too much" />
      </div>
      <div className="two-col">
        <Card icon="chart" title="Where sales come from (Pareto)" sub="Items ranked by sales; A items make the first 80%.">
          <div className="card-body pt0"><BarList rows={rows.filter((r) => r.sales > 0).map((r) => ({ id: r.id, name: r.name, sub: `class ${r.abc}`, value: r.sales, note: `${pct(r.cumShare)} running total` }))} format={tkShort} limit={8} empty="No sales in this period." /></div>
        </Card>
        <Card icon="trend" title="Most profitable" sub="Profit in the period, with margin.">
          <div className="card-body pt0">{m.see.profit
            ? <BarList share="of profit" rows={rows.filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit).map((r) => ({ id: r.id, name: r.name, value: r.profit, note: `${pct(r.margin)} margin` }))} format={tkShort} limit={8} empty="No profit recorded in this period." />
            : <p className="t-muted">Your role does not show profit.</p>}</div>
        </Card>
      </div>
      {m.see.profit && (
        <Card icon="target" title="Product portfolio" sub="Each circle is an item: growth against the period before across, margin up, size by sales. Tap one for its deep dive.">
          <ScatterChart points={rows.filter((r) => r.sales > 0 && r.margin !== null).map((r) => ({ id: r.id, name: r.name, x: Math.max(Math.min(r.growth ?? 0, 2), -1), y: r.margin ?? 0, size: r.sales, note: `${STOCK_HEALTH[r.health]} · class ${r.abc}` }))}
            xLabel="Sales growth" yLabel="Margin" xFormat={(v) => pct(v)} yFormat={(v) => pct(v)} sizeFormat={tk} yCut={marginCut(rows)}
            quadrants={['Profitable, slowing', 'Stars: growing and profitable', 'Review: slowing, thin margin', 'Growing, thin margin']}
            onPick={(p) => sheets.open(ProductInsightSheet, { productId: p.id, days })} />
          <p className="t-muted small-note">The line across is the average margin ({pct(marginCut(rows))}). Push the stars, protect the profitable ones that are slowing, fix the price or cost of thin-margin growers, and review the rest.</p>
        </Card>
      )}
      <Card icon="box" title="Every item" sub="Tap an item for its twelve-month deep dive.">
        <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }} summary={<span><b>{fmt(shown.length)}</b> of {fmt(rows.length)} items</span>}
          main={<><SearchBox value={q} onChange={setQ} placeholder="Item name" />
            <Segmented<string> label="Class" value={f.v.abc} onChange={(x) => f.set('abc', x)} options={[{ value: '', label: 'All' }, { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: '-', label: 'No sales' }]} /></>}>
          <FilterSelect label="Stock health" value={f.v.health} onChange={(x) => f.set('health', x)} all="Any" options={Object.entries(STOCK_HEALTH).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Kind" value={f.v.kind} onChange={(x) => f.set('kind', x)} all="All items" options={[{ value: 'finished', label: 'Finished goods' }, { value: 'material', label: 'Raw materials and packaging' }]} />
        </FilterPanel>
        <DataTable rows={shown} rowKey={(r) => r.id} pageSize={20} exportName={`product-insights-${days}d`} onRow={(r) => sheets.open(ProductInsightSheet, { productId: r.id, days })} empty="No item matches."
          columns={[
            { label: 'Item', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small className="t-muted">{r.dealers ? `${r.dealers} dealer${r.dealers === 1 ? '' : 's'}` : 'No dealers this period'}</small></span> },
            { label: 'Class', render: (r) => (r.abc === '-' ? '—' : <Pill tone={r.abc === 'A' ? 'good' : r.abc === 'B' ? 'info' : 'neutral'}>{r.abc}</Pill>) },
            { label: 'Sales', align: 'right', render: (r) => tk(r.sales) },
            { label: 'vs before', align: 'right', render: (r) => <Growth v={r.growth} /> },
            { label: 'Margin', align: 'right', render: (r) => (m.see.profit ? <span className={r.margin !== null && r.margin < 0.05 ? 't-warn strong' : ''}>{pct(r.margin)}</span> : <Hidden />) },
            { label: 'Stock lasts', align: 'right', render: (r) => (r.daysCover === null ? '—' : `${fmt(r.daysCover)} days`) },
            { label: 'Turns a year', align: 'right', render: (r) => (r.turns === null ? '—' : r.turns.toFixed(1)) },
            { label: 'Health', align: 'right', render: (r) => <Pill tone={HEALTH_TONE[r.health]}>{STOCK_HEALTH[r.health]}</Pill> },
          ]} />
      </Card>
    </>
  )
}

/** Average margin weighted by sales: the line between thin and good margins on the portfolio. */
const marginCut = (rows: { sales: number; profit: number }[]) => { const s = rows.reduce((a, r) => a + r.sales, 0); return s > 0 ? rows.reduce((a, r) => a + r.profit, 0) / s : 0 }

/* ---------- dealers ---------- */

function Dealers({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const m = useMoney()
  const sheets = useSheets()
  const rows = dealerInsights(db, days)
  const conc = concentration(db, days)
  const [seg, setSeg] = useState<'' | Segment>('')
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const shown = rows.filter((r) => (!seg || r.segment === seg) && (!n || `${r.name} ${r.area}`.toLowerCase().includes(n)))
  const segs = (Object.keys(SEGMENTS) as Segment[]).filter((s) => rows.some((r) => r.segment === s))
  const risk = conc.top5 > 0.6 || conc.top1 > 0.3 ? 'High' : conc.top5 > 0.4 ? 'Medium' : 'Low'
  return (
    <>
      <div className="stats">
        <Stat icon="users" label="Buying dealers" value={fmt(conc.buyers)} sub={`of ${rows.length} on the list`} />
        <Stat icon="pie" label="Top dealer's share" value={pct(conc.top1)} tone={conc.top1 > 0.3 ? 'warn' : undefined} sub={conc.biggest?.name || '—'} />
        <Stat icon="layers" label="Top 5 share" value={pct(conc.top5)} sub={`Dependence: ${risk}`} tone={risk === 'High' ? 'warn' : undefined} />
        <Stat icon="alert" label="At risk or lost" value={fmt(rows.filter((r) => r.segment === 'at-risk' || r.segment === 'lost').length)} tone={rows.some((r) => r.segment === 'at-risk') ? 'warn' : undefined} sub={tkShort(rows.filter((r) => r.segment === 'at-risk').reduce((s, r) => s + r.monthly, 0)) + ' a month at risk'} />
      </div>
      <Card icon="chart" title="Biggest dealers, now and before" sub={`Last ${days} days against the ${days} days before.`}>
        <CompareBars rows={rows.filter((r) => r.sales > 0 || r.prevSales > 0).map((r) => ({ id: r.id, name: r.name, now: r.sales, before: r.prevSales }))} format={tkShort} limit={10} empty="No dealer sales in this period."
          onPick={(r) => sheets.open(DealerInsightSheet, { dealerId: r.id, days })} />
      </Card>
      <Card icon="target" title="Dealer segments" sub="Grouped by how recently, how often and how much they buy. Tap a group to list it.">
        <div className="seg-grid">
          {segs.map((s) => {
            const list = rows.filter((r) => r.segment === s)
            return (
              <button key={s} type="button" className={cls('seg-tile', seg === s && 'on')} onClick={() => setSeg(seg === s ? '' : s)}>
                <Pill tone={SEG_TONE[s]}>{SEGMENTS[s].label}</Pill>
                <b>{fmt(list.length)}</b>
                <small className="t-muted">{SEGMENTS[s].hint}</small>
                <small>{tkShort(list.reduce((a, r) => a + r.sales, 0))} in the period</small>
              </button>
            )
          })}
        </div>
      </Card>
      <Card icon="users" title={seg ? SEGMENTS[seg].label : 'Every dealer'} sub="Tap a dealer for their twelve-month deep dive." action={<SearchBox value={q} onChange={setQ} placeholder="Dealer or area" />}>
        <DataTable rows={shown} rowKey={(r) => r.id} pageSize={20} exportName={`dealer-insights-${days}d`} onRow={(r) => sheets.open(DealerInsightSheet, { dealerId: r.id, days })} empty="No dealer matches."
          columns={[
            { label: 'Dealer', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small className="t-muted">{r.area || 'No area'}</small></span> },
            { label: 'Segment', render: (r) => <Pill tone={SEG_TONE[r.segment]}>{SEGMENTS[r.segment].label}</Pill> },
            { label: 'Sales', align: 'right', render: (r) => tk(r.sales) },
            { label: 'vs before', align: 'right', render: (r) => <Growth v={r.growth} /> },
            { label: 'Share', align: 'right', render: (r) => pct(r.share) },
            { label: 'Last bill', align: 'right', render: (r) => (r.lastDate ? <span className="two-line right"><span>{fdate(r.lastDate)}</span><small className="t-muted">{r.recency} days ago{r.gap ? ` · usually every ${Math.round(r.gap)}` : ''}</small></span> : '—') },
            { label: 'Bills a year', align: 'right', render: (r) => fmt(r.frequency) },
            { label: 'Due', align: 'right', render: (r) => (r.due > 0 ? <span className="two-line right"><b className={r.overdueDays > 30 ? 't-warn' : ''}>{tk(r.due)}</b>{r.overdueDays > 0 && <small className="t-warn">{r.overdueDays} days late</small>}</span> : <span className="t-muted">—</span>) },
            ...(m.see.profit ? [{ label: 'Profit', align: 'right' as const, render: (r: (typeof rows)[number]) => tk(r.profit) }] : []),
          ]} />
      </Card>
    </>
  )
}

/* ---------- profit and what-if ---------- */

function Profit({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const { see } = useMoney()
  const b = profitBridge(db, days)
  const rows = productInsights(db, days)
  const [w, setW] = useState({ price: 0, cost: 0, volume: 0 })
  if (!see.profit) return <Card><Empty>Profit analysis needs the “See profit and margins” permission. Ask an admin.</Empty></Card>
  const tk = (n: number) => tkRaw(Math.round(n))
  const sim = whatIf(rows, { price: w.price / 100, cost: w.cost / 100, volume: w.volume / 100 })
  const slider = (k: keyof typeof w, label: string, hint: string) => (
    <label className="field">
      <span className="field-label">{label} <b className={w[k] > 0 ? 't-good' : w[k] < 0 ? 't-warn' : ''}>{w[k] > 0 ? '+' : ''}{w[k]}%</b></span>
      <input type="range" min={-30} max={30} step={1} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} aria-label={label} />
      <small className="t-muted">{hint}</small>
    </label>
  )
  return (
    <div className="two-col">
      <Card icon="chart" title="Why profit changed" sub={`Gross profit on dealer sales: the ${days} days before against the last ${days} days.`}>
        <WaterfallChart start={{ label: 'Profit before', value: b.before }} end={{ label: 'Profit now', value: b.after }} format={tk}
          steps={b.steps.map((x) => ({ key: x.key, label: x.label, value: x.value }))} />
        <p className="t-muted small-note">{b.change >= 0 ? 'Up' : 'Down'} {tk(Math.abs(b.change))}. The biggest reason: {[...b.steps].sort((a, c) => Math.abs(c.value) - Math.abs(a.value))[0]?.label.toLowerCase()}.</p>
      </Card>
      <Card icon="adjust" title="What if…" sub={`Move prices, costs or quantities and see the profit for the next ${days} days, based on the last ${days}.`}>
        <div className="card-body pt0 form-grid">
          {slider('price', 'Selling prices', 'All items, same quantity')}
          {slider('cost', 'Buying and making costs', 'e.g. a supplier price rise')}
          {slider('volume', 'Quantity sold', 'e.g. a new area or a lost dealer')}
        </div>
        <div className="whatif">
          <div><small className="t-muted">Sales</small><b>{tk(sim.newSales)}</b><small className="t-muted">now {tk(sim.sales)}</small></div>
          <div><small className="t-muted">Profit</small><b className={sim.change >= 0 ? 't-good' : 't-warn'}>{tk(sim.newProfit)}</b><small className="t-muted">now {tk(sim.profit)}</small></div>
          <div><small className="t-muted">Change</small><b className={sim.change >= 0 ? 't-good' : 't-warn'}>{sim.change >= 0 ? '+' : '−'}{tk(Math.abs(sim.change))}</b><small className="t-muted">{pct(sim.profit ? sim.change / Math.abs(sim.profit) : 0)}</small></div>
        </div>
        {sim.sales > 0 && <p className="t-muted small-note">To keep today’s profit after a {Math.abs(w.cost || 5)}% cost rise, prices need to go up about {pct(((sim.sales - sim.profit) * (Math.abs(w.cost || 5) / 100)) / sim.sales, 1)}.</p>}
      </Card>
    </div>
  )
}

/* ---------- cash ---------- */

function Cash() {
  const { db } = useBooks()
  const c = cashInsights(db)
  const d = (n: number | null) => (n === null ? '—' : `${Math.round(n)} days`)
  const low = Math.min(...c.forecast.map((f) => f.balance), c.cashNow)
  const high = Math.max(...c.forecast.map((f) => f.balance), c.cashNow, 1)
  const span = Math.max(high - Math.min(low, 0), 1)
  return (
    <>
      <div className="stats">
        <Stat icon="wallet" label="Days to collect (DSO)" value={d(c.dso)} sub={`${tkShort(c.receivables)} owed to us`} tone={c.dso !== null && c.dso > 45 ? 'warn' : undefined} />
        <Stat icon="box" label="Days in stock (DIO)" value={d(c.dio)} sub={`${tkShort(c.stockValue)} of stock`} />
        <Stat icon="receipt" label="Days to pay (DPO)" value={d(c.dpo)} sub={`${tkShort(c.payables)} we owe`} />
        <Stat icon="route" label="Cash cycle" value={d(c.cycle)} sub={c.cycle !== null && c.cycle < 0 ? 'Suppliers fund the business' : 'Days our money is tied up'} />
      </div>
      <div className="two-col">
        <Card icon="trend" title="Cash for the next 90 days" sub="At the pace money came in and went out over the last 90 days, plus half of overdue dues.">
          <ul className="forecast">
            <li><span>Today</span><span className="bridge-track"><span className="bridge-bar base" style={{ width: `${(Math.max(c.cashNow, 0) / span) * 100}%` }} /></span><b>{tk(c.cashNow)}</b></li>
            {c.forecast.map((f) => (
              <li key={f.key}>
                <span className="two-line"><span>{f.label}</span><small className="t-muted">+{tkShort(f.inflow)} in · −{tkShort(f.outflow)} out</small></span>
                <span className="bridge-track"><span className={cls('bridge-bar', f.balance < 0 ? 'down' : 'up')} style={{ width: `${Math.max((Math.abs(f.balance) / span) * 100, 1)}%` }} /></span>
                <b className={f.balance < 0 ? 't-warn' : ''}>{tk(f.balance)}</b>
              </li>
            ))}
          </ul>
          <p className="t-muted small-note">{c.firstShort ? `Cash goes below zero in the ${c.firstShort.label.toLowerCase()}. Collect overdue dues and slow purchases now.` : `Cash stays positive. About ${tkShort(c.runIn - c.runOut)} a month is added at the current pace.`}</p>
        </Card>
        <Card icon="clock" title="Dues by how late they are" sub="What dealers owe, by days past the due date.">
          <div className="card-body pt0"><BarList share="of dues" rows={AGING_LABELS.map(([k, label]) => ({ id: k, name: label, value: c.aging[k] }))} format={tkShort} limit={5} empty="No dealer owes money." /></div>
        </Card>
      </div>
    </>
  )
}

/* ---------- suppliers ---------- */

function Suppliers({ days }: { days: InsightWindow }) {
  const { db } = useBooks()
  const m = useMoney()
  const rows = supplierInsights(db, days)
  return (
    <Card icon="store" title="Suppliers" sub="Spend, price rises, short deliveries and lateness. Tap one to open the supplier.">
      <DataTable rows={rows} rowKey={(r) => r.id} pageSize={20} exportName={`supplier-insights-${days}d`} onRow={(r) => go('suppliers/' + r.id)} empty="No suppliers yet."
        columns={[
          { label: 'Supplier', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small className="t-muted">{r.bills} bill{r.bills === 1 ? '' : 's'} in the period{r.waiting ? ` · ${r.waiting} waiting for check-in` : ''}</small></span> },
          { label: 'Spend', align: 'right', render: (r) => m.cost(r.spend) },
          { label: 'Share', align: 'right', render: (r) => pct(r.share) },
          { label: 'Price changes', render: (r) => (!m.see.cost ? <Hidden /> : r.priceRises.length ? <span className="two-line">{r.priceRises.map((x) => <small key={x.productId} className="t-warn">{x.name} +{pct(x.change)}</small>)}</span> : <span className="t-muted">Stable</span>) },
          { label: 'Short or damaged', align: 'right', render: (r) => <span className={r.shortRate > 0.02 ? 't-warn strong' : ''}>{pct(r.shortRate, 1)}</span> },
          { label: 'Days late', align: 'right', render: (r) => (r.lateDays === null ? '—' : r.lateDays.toFixed(1)) },
          { label: 'We owe', align: 'right', render: (r) => (r.due > 0 ? m.cost(r.due) : <span className="t-muted">—</span>) },
        ]} />
    </Card>
  )
}

/* ---------- import and export ---------- */

function Trade() {
  const { db } = useBooks()
  const m = useMoney()
  const t = tradeLeadTimes(db)
  const steps = (list: typeof t.import, title: string) => (
    <Card icon="route" title={title} sub="Average days between steps, over shipments where both steps are done.">
      <DataTable rows={list} rowKey={(r) => r.key} empty="Not enough finished steps yet."
        columns={[
          { label: 'Step', primary: true, render: (r) => r.label },
          { label: 'Average', align: 'right', render: (r) => <b>{r.avg.toFixed(1)} days</b> },
          { label: 'Longest', align: 'right', render: (r) => `${r.max} days` },
          { label: 'Shipments', align: 'right', render: (r) => fmt(r.count) },
        ]} />
      {list.length > 0 && <p className="t-muted small-note card-body">From the first step to the last takes about <b>{Math.round(list.reduce((s, r) => s + r.avg, 0))} days</b>. Plan orders that far ahead.</p>}
    </Card>
  )
  return (
    <>
      {t.late.length > 0 && (
        <Card icon="alert" title="Late right now" sub="Shipments whose next step is past its expected date.">
          <DataTable rows={t.late} rowKey={(r) => r.id} onRow={(r) => go('trade/' + r.id)}
            columns={[
              { label: 'Shipment', primary: true, render: (r) => <b>{r.id}</b> },
              { label: 'Waiting for', render: (r) => r.step },
              { label: 'Expected', align: 'right', render: (r) => fdate(r.expected) },
              { label: 'Late by', align: 'right', render: (r) => <b className="t-warn">{r.days} days</b> },
            ]} />
        </Card>
      )}
      <div className="two-col">
        {steps(t.import, 'Import lead time')}
        {steps(t.export, 'Export lead time')}
      </div>
      <Card icon="ship" title="What landed imports cost" sub="Received imports: the goods against freight, duty and other costs.">
        <div className="card-body pt0">{m.see.cost
          ? <BarList share="of landed cost" rows={t.landedShare.map((x) => ({ id: x.label, name: x.label, value: x.value }))} format={tkShort} limit={8} empty="No imports received yet." />
          : <p className="t-muted">Your role does not show costs.</p>}</div>
      </Card>
    </>
  )
}
