import { useState } from 'react'
import {
  addDays, breakdown, byId, change, currentAnchor, dealerLedger, fdate, fday, fmt, nextAnchor, parse, periodOf, previousPeriod, runningTotals,
  salesBetween, salesPace, salesSeries, targetsFor, tk, tkShort, todayISO, totalsBetween, type Grain,
} from '@shared/domain'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { SERIES } from '@/components/charts/common'
import { LineChart } from '@/components/charts/LineChart'
import { downloadCsv } from '@/components/downloadCsv'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { ViewInvoiceSheet } from '@/features/sales/sheets/ViewInvoiceSheet'
import { Button, Card, cls, DataTable, Icon, Pill, Segmented, Stat, useSheets } from '@/ui'
import { SalesTargetsSheet } from './SalesTargetsSheet'

const GRAINS: { value: Grain; label: string }[] = [{ value: 'day', label: 'Daily' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]
const pct = (x: number) => `${Math.round(x * 100)}%`

/** "↑ 12% vs yesterday", green when sales went up. */
function Delta({ now, before, against }: { now: number; before: number; against: string }) {
  const c = change(now, before)
  if (c === null) return <>{before === 0 && now > 0 ? `New sales · nothing ${against}` : `Nothing to compare ${against}`}</>
  const up = c >= 0
  return (
    <span>
      <b className={up ? 't-good' : 't-warn'}>{up ? '↑' : '↓'} {pct(Math.abs(c))}</b> {against} <span className="t-muted">({tkShort(before)})</span>
    </span>
  )
}

/** Selling days left in the month after today, Fridays off. */
function sellingDaysLeft(monthEnd: string): number {
  let n = 0
  for (let d = addDays(todayISO(), 1); d <= monthEnd; d = addDays(d, 1)) if (parse(d).getDay() !== 5) n++
  return n
}

export default function SalesAnalyticsPage() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [grain, setGrainState] = useState<Grain>('day')
  const [anchor, setAnchor] = useState(currentAnchor('day'))
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [day, setDay] = useState('')
  const [dealer, setDealer] = useState('')
  const [person, setPerson] = useState('')

  const period = periodOf(db, grain, anchor)
  const prev = previousPeriod(db, period)
  const series = salesSeries(db, period)
  const totals = totalsBetween(db, period.from, period.to)
  const before = prev ? totalsBetween(db, prev.from, prev.to) : null
  const bd = breakdown(db, period.from, period.to)
  const targets = targetsFor(db, period)
  const pace = salesPace(db)
  const isCurrent = anchor === currentAnchor(grain)
  const canGoNext = grain !== 'year' && period.to < todayISO()
  const prevLabel = grain === 'day' ? 'vs last month' : grain === 'month' ? 'vs last year' : ''

  const setGrain = (g: Grain, a = currentAnchor(g)) => {
    setGrainState(g)
    setAnchor(a)
    setDay('')
  }
  const move = (step: number) => {
    setAnchor(nextAnchor(period, step))
    setDay('')
  }

  // salesBetween is cached per version of the books, so filtering here is cheap
  const invoices = salesBetween(db, day || period.from, day || period.to).filter((f) => (!dealer || f.dealerId === dealer) && (!person || (person === 'office' ? !f.soldBy : f.soldBy === person)))

  const dueOf = (id: string, dealerId: string) => (byId(db.dealers, dealerId) ? dealerLedger(db, dealerId).open.find((o) => o.id === id)?.out || 0 : 0)

  const download = () => downloadCsv(`sales-${grain}-${period.anchor || 'all-years'}.csv`,
    [grain === 'day' ? 'Date' : grain === 'month' ? 'Month' : 'Year', 'Sales', 'Gross profit', 'Margin', 'Invoices', 'Units', 'Collected'],
    series.map((b) => [b.long, Math.round(b.sales), Math.round(b.profit), b.sales ? pct(b.profit / b.sales) : '', b.invoices, b.units, Math.round(b.collected)]))

  const running = grain !== 'year' ? runningTotals(db, period) : []
  const monthTarget = targets.company?.target || 0
  const left = monthTarget - totals.sales
  const daysLeft = grain === 'day' && isCurrent ? sellingDaysLeft(period.to) : 0
  const staffWithTargets = targets.staff.filter((s) => s.target > 0 || s.actual > 0)

  return (
    <>
      <PageHead title="Sales analytics" sub="Daily, monthly and yearly sales with profit, collections and targets." actions={
        <>
          <Button variant="secondary" icon="download" onClick={download}>Download</Button>
          <Button variant="secondary" icon="target" className="edit-only" onClick={() => sheets.open(SalesTargetsSheet)}>Set targets</Button>
        </>
      } />

      <div className="stats three">
        {pace.map((p, i) => (
          <Stat key={p.label} icon={i === 0 ? 'clock' : i === 1 ? 'calendar' : 'trend'} label={p.label} value={tk(p.value)} sub={<Delta now={p.value} before={p.compare} against={`vs ${p.compareLabel}`} />} />
        ))}
      </div>

      <div className="analytics-bar">
        <Segmented<Grain> label="Show sales by" value={grain} onChange={(g) => setGrain(g)} options={GRAINS} />
        {grain !== 'year' && (
          <div className="month-nav">
            <button type="button" className="icon-btn bordered" aria-label="Earlier" onClick={() => move(-1)}><Icon name="back" size={18} /></button>
            <b className="period-label">{period.label}</b>
            <button type="button" className="icon-btn bordered" aria-label="Later" disabled={!canGoNext} onClick={() => move(1)}><Icon name="chevron" size={18} /></button>
            {!isCurrent && <button type="button" className="link" onClick={() => setGrain(grain)}>Back to {grain === 'day' ? 'this month' : 'this year'}</button>}
          </div>
        )}
      </div>

      <div className="stats">
        <Stat icon="receipt" label={`Sales · ${period.label}`} value={tk(totals.sales)} sub={before ? <Delta now={totals.sales} before={before.sales} against={prevLabel} /> : `${fmt(totals.invoices)} invoices`} />
        <Stat icon="trend" label="Gross profit" value={tk(totals.profit)} sub={totals.sales ? `${pct(totals.profit / totals.sales)} margin on cost of goods` : 'No sales yet'} />
        <Stat icon="grid" label="Invoices" value={fmt(totals.invoices)} sub={totals.invoices ? `Average ${tk(Math.round(totals.sales / totals.invoices))} · ${fmt(totals.units)} units` : 'None yet'} />
        <Stat icon="wallet" label="Collected" value={tk(totals.collected)} sub="Cash on sales plus dealer payments" />
      </div>

      <Card icon="chart" title={grain === 'day' ? `Daily sales · ${period.label}` : grain === 'month' ? `Monthly sales · ${period.label}` : 'Yearly sales'}
        sub={grain === 'year' ? 'Tap a year to see its months.' : grain === 'month' ? 'Tap a month to see its days.' : 'Tap a day to list its invoices below.'}
        action={<Segmented label="Chart or table" value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}>
        {view === 'chart' ? (
          <ColumnChart
            data={series.map((b) => ({ key: b.key, short: b.short, long: b.long, value: b.sales, line: b.future ? null : b.profit, faded: b.future,
              extra: [['invoices', fmt(b.invoices)], ['collected', tkShort(b.collected)]] }))}
            valueName="Sales" lineName="Gross profit" format={tk} height={280}
            pickHint={grain === 'day' ? 'Click to list this day’s invoices' : grain === 'month' ? 'Click to open this month' : 'Click to open this year'}
            onPick={(d) => {
              const b = series.find((x) => x.key === d.key)
              if (b?.drill) setGrain(b.drill.grain, b.drill.anchor)
              else if (grain === 'day') setDay((cur) => (cur === d.key ? '' : d.key))
            }}
          />
        ) : (
          <DataTable rows={series} rowKey={(b) => b.key} empty="No sales."
            onRow={(b) => (b.drill ? setGrain(b.drill.grain, b.drill.anchor) : setDay(b.key))}
            columns={[
              { label: grain === 'day' ? 'Day' : grain === 'month' ? 'Month' : 'Year', primary: true, render: (b) => b.long },
              { label: 'Sales', align: 'right', render: (b) => <b>{tk(b.sales)}</b> },
              { label: 'Gross profit', align: 'right', render: (b) => tk(b.profit) },
              { label: 'Margin', align: 'right', render: (b) => (b.sales ? pct(b.profit / b.sales) : '') },
              { label: 'Invoices', align: 'right', render: (b) => fmt(b.invoices) },
              { label: 'Collected', align: 'right', render: (b) => tk(b.collected) },
            ]} />
        )}
      </Card>

      {grain !== 'year' && (
        <div className="grid2">
          <Card icon="trend" title="Running total" sub={grain === 'day' ? 'Sales added up day by day, against last month.' : 'Sales added up month by month, against last year.'}>
            <LineChart
              labels={running.map((r) => ({ short: r.short, long: r.long }))}
              series={[
                { name: period.label, color: SERIES.sales, values: running.map((r) => r.now), endLabel: true },
                ...(prev ? [{ name: prev.label, color: SERIES.muted, values: running.map((r) => r.before) }] : []),
              ]}
              target={monthTarget ? { value: monthTarget, label: 'Target' } : undefined}
              format={tk}
            />
          </Card>
          <Card icon="target" title="Targets" sub={grain === 'day' ? `For ${period.label}` : `For ${period.label}, twelve months of targets`}
            action={<button type="button" className="link edit-only" onClick={() => sheets.open(SalesTargetsSheet)}>Change</button>}>
            <div className="target-list">
              {targets.company ? (
                <TargetRow name="Company" actual={targets.company.actual} target={targets.company.target} big />
              ) : <p className="t-muted">No company target yet. Set one to track progress here.</p>}
              {targets.company && isCurrent && grain === 'day' && left > 0 && daysLeft > 0 && (
                <p className="target-need">Needs <b>{tk(Math.ceil(left / daysLeft))}</b> a day for the {daysLeft} selling days left to reach the target.</p>
              )}
              {targets.company && left <= 0 && <p className="target-need t-good"><b>Target reached</b>, {tk(-left)} over.</p>}
              {staffWithTargets.map((s) => <TargetRow key={s.id} name={s.name} actual={s.actual} target={s.target} />)}
            </div>
          </Card>
        </div>
      )}

      <div className="grid2">
        <Card icon="box" title="Best-selling products" sub={period.label}>
          <BarList format={tk} empty="No sales in this period." rows={bd.products.map((p) => ({ id: p.id, name: p.name, value: p.sales, note: `${fmt(p.qty)} ${p.sub} · ${p.sales ? pct(p.profit / p.sales) : '0%'} margin` }))} />
        </Card>
        <Card icon="users" title="Top dealers" sub={period.label}>
          <BarList format={tk} empty="No sales in this period." rows={bd.dealers.map((d) => ({ id: d.id, name: d.name, sub: d.sub, value: d.sales, note: `${fmt(d.invoices)} invoice${d.invoices === 1 ? '' : 's'}` }))} />
        </Card>
        <Card icon="badge" title="Salespeople" sub={period.label}>
          <BarList format={tk} empty="No sales in this period." rows={bd.staff.map((s) => ({ id: s.id || 'office', name: s.name, value: s.sales, note: `${fmt(s.invoices)} invoices · avg ${tkShort(s.invoices ? s.sales / s.invoices : 0)}` }))} />
        </Card>
        <Card icon="pin" title="Areas" sub={period.label}>
          <BarList format={tk} empty="No sales in this period." rows={bd.areas.map((a) => ({ id: a.id, name: a.name, value: a.sales, note: `${fmt(a.invoices)} invoices` }))} />
          <CashCredit cash={bd.terms.cash} credit={bd.terms.credit} />
        </Card>
      </div>

      <Card icon="receipt" title="Sales tracking" sub={day ? `Invoices on ${fday(day)}` : `Every invoice in ${period.label}`}
        action={day ? <button type="button" className="link" onClick={() => setDay('')}>Show the whole period</button> : undefined}>
        <div className="card-body pt0 tools-row">
          <select className="in narrow-select" value={dealer} onChange={(e) => setDealer(e.target.value)} aria-label="Dealer">
            <option value="">All dealers</option>
            {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="in narrow-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Salesperson">
            <option value="">All salespeople</option>
            {db.employees.filter((e) => e.payType === 'sales').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            <option value="office">Office sales</option>
          </select>
          <span className="t-muted tracking-sum">{fmt(invoices.length)} invoices · <b>{tk(invoices.reduce((s, f) => s + f.total, 0))}</b></span>
        </div>
        <DataTable pageSize={25} rows={invoices} rowKey={(f) => f.id} empty="No invoices match."
          onRow={(f) => sheets.open(ViewInvoiceSheet, { invoiceId: f.id })}
          columns={[
            { label: 'Invoice', primary: true, render: (f) => (
              <span className="two-line"><b>{f.id}</b><small>{fdate(f.date)}</small></span>
            ) },
            { label: 'Dealer', render: (f) => byId(db.dealers, f.dealerId)?.name || 'Removed dealer' },
            { label: 'Sold by', render: (f) => <span className="t-muted">{byId(db.employees, f.soldBy)?.name || 'Office'}</span> },
            { label: 'Items', render: (f) => <span className="t-muted">{f.lines.map((l) => `${fmt(l.qty)} ${l.unit}`).join(', ')}</span> },
            { label: 'Total', align: 'right', render: (f) => <b>{tk(f.total)}</b> },
            { label: 'Profit', align: 'right', render: (f) => <span className={f.profit < 0 ? 't-warn' : ''}>{tk(f.profit)}</span> },
            { label: 'Status', align: 'right', render: (f) => {
              const due = dueOf(f.id, f.dealerId)
              return due > 0 ? <Pill tone="warn">Due {tkShort(due)}</Pill> : <Pill tone="good">Paid</Pill>
            } },
          ]} />
      </Card>
    </>
  )
}

function TargetRow({ name, actual, target, big }: { name: string; actual: number; target: number; big?: boolean }) {
  const share = target > 0 ? actual / target : 0
  return (
    <div className={cls('target-row', big && 'big')}>
      <div className="bar-top">
        <span>{name}</span>
        <span><b>{tk(actual)}</b>{target > 0 && <small className="t-muted"> of {tkShort(target)}</small>}</span>
      </div>
      {target > 0 ? (
        <>
          <div className={cls('meter', share >= 1 && 'done', share < 0.5 && 'warn')} role="meter" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${name}: ${pct(share)} of target`}>
            <span style={{ width: `${Math.min(share, 1) * 100}%` }} />
          </div>
          <small className={share >= 1 ? 't-good' : 't-muted'}>{pct(share)} of target</small>
        </>
      ) : <small className="t-muted">No target set</small>}
    </div>
  )
}

/** Cash against credit sales as one bar split in two. */
function CashCredit({ cash, credit }: { cash: number; credit: number }) {
  const total = cash + credit
  if (!total) return null
  return (
    <div className="cash-credit">
      <div className="chart-legend">
        <span><i className="key-rect" style={{ background: SERIES.sales }} />Cash on delivery {tkShort(cash)}</span>
        <span><i className="key-rect" style={{ background: SERIES.profit }} />On credit {tkShort(credit)}</span>
      </div>
      <div className="seg-bar" role="img" aria-label={`Cash ${pct(cash / total)}, credit ${pct(credit / total)}`}>
        {cash > 0 && <span style={{ flexGrow: cash, background: SERIES.sales }}>{cash / total >= 0.12 ? pct(cash / total) : ''}</span>}
        {credit > 0 && <span style={{ flexGrow: credit, background: SERIES.profit }}>{credit / total >= 0.12 ? pct(credit / total) : ''}</span>}
      </div>
    </div>
  )
}
