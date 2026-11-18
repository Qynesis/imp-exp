import {
  addDays, byId, cashForDay, change, fday, flong, fmt, foCalc, fshort, IMPORT_STAGES, isLowStock, orderBook, paperAlerts, PAPERS, payables, plural, receivables,
  servicesDue, tk, tkShort, todayISO, totalsBetween, tradeOverview, type ImportStage, type PipelineRow,
} from '@shared/domain'
import { useAccess } from '@/app/useAccess'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { DueRow } from '@/components/DueRow'
import { PageHead } from '@/components/PageHead'
import { go, href } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { DealerStatementSheet } from '@/features/dealers/sheets/DealerStatementSheet'
import { NewFactoryOrderSheet } from '@/features/factory-orders/sheets/NewFactoryOrderSheet'
import { NewShipmentSheet } from '@/features/shipments/sheets/NewShipmentSheet'
import { DeliverSheet } from '@/features/deliveries/sheets/DeliverSheet'
import { Button, Card, cls, Empty, Icon, IconBadge, Pill, Progress, Stat, useSheets } from '@/ui'

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const pct = (x: number) => `${Math.round(x * 100)}%`

export default function DashboardPage() {
  const { db } = useBooks()
  const sheets = useSheets()
  const { level } = useAccess()
  const today = todayISO()
  const pay = payables(db)
  const rec = receivables(db)
  const cash = cashForDay(db, today)
  const book = orderBook(db)
  const trade = tradeOverview(db)
  const open = db.factoryOrders.map((o) => ({ o, c: foCalc(db, o) })).filter((x) => x.c.pending > 0)
  const vsYesterday = change(book.today.value, book.yesterday.value)
  const can = (p: Parameters<typeof level>[0]) => level(p) !== 'none'
  /** A card opens its screen only for people allowed to see it. */
  const link = (p: Parameters<typeof level>[0]) => (can(p) ? href(p) : undefined)
  const salesTo = can('sales-analytics') ? href('sales-analytics') : link('sell')

  return (
    <>
      <PageHead title="Dashboard" sub={flong(today)} actions={
        <>
          {can('imports') && <Button icon="ship" variant="secondary" onClick={() => sheets.open(NewShipmentSheet, {})}>New shipment</Button>}
          {can('factory-orders') && <Button icon="factory" variant="secondary" onClick={() => sheets.open(NewFactoryOrderSheet, {})}>Factory order</Button>}
          {can('sell') && <Button icon="plus" onClick={() => go('sell')}>New sale invoice</Button>}
        </>
      } />

      <div className="stats">
        <Stat href={salesTo} icon="receipt" label="Sales today" value={tk(book.today.value)}
          sub={<>{plural(book.today.orders, 'order')}{vsYesterday != null && <> · <b className={vsYesterday >= 0 ? 't-good' : 't-warn'}>{vsYesterday >= 0 ? '↑' : '↓'} {pct(Math.abs(vsYesterday))}</b> vs yesterday</>}</>} />
        <Stat href={salesTo} icon="trend" label="Orders this month" value={tk(book.month.value)}
          sub={`${plural(book.month.orders, 'order')}${book.target ? ` · ${pct(book.month.value / book.target)} of target` : ''} · profit ${tkShort(book.month.profit)}`} />
        <Stat href={link('cashbook')} icon="arrowIn" label="Owed to us (dealers)" value={tk(rec.total)} tone={rec.total > 0 ? 'good' : undefined} sub={rec.rows.length ? `${plural(rec.rows.length, 'dealer')}, ${rec.rows.filter((r) => r.overdue).length} overdue` : 'No dues'} />
        <Stat href={link('cashbook')} icon="arrowOut" label="We owe" value={tk(pay.total)} tone={pay.total > 0 ? 'warn' : undefined} sub={pay.rows.length ? `${plural(pay.rows.length, 'bill')} · suppliers, factories, transport` : 'Nothing to pay'} />
      </div>

      <RecentSales />

      {(can('imports') || can('customs')) && (
        <>
          <h2 className="dash-h"><Icon name="ship" size={20} />Imports and exports</h2>
          <div className="stats">
            <Stat href={link('imports')} icon="ship" label="Open import LCs" value={fmt(trade.imports.length)} sub={`${usd(trade.importUsd)} · ${tkShort(trade.importTk)}`} />
            <Stat href={link('imports')} icon="calendar" label="Arriving this week" value={fmt(trade.arriving.length)} tone={trade.arriving.some((r) => (r.daysTo ?? 0) < 0) ? 'warn' : undefined}
              sub={trade.arriving.length ? trade.arriving.slice(0, 2).map((r) => `${r.s.id} ${r.daysTo! < 0 ? 'late' : fshort(r.expected)}`).join(' · ') : 'Nothing due in 7 days'} />
            <Stat href={link('imports')} icon="arrowOut" label="Exports in progress" value={usd(trade.exportUsd)} sub={trade.awaitingPayment.length ? `${usd(trade.awaitingUsd)} shipped, payment not realised` : `${plural(trade.exports.length, 'order')}`} />
            <Stat href={link('customs')} icon="shield" label="Customs" value={tk(trade.dutyDue + trade.demurrage)} tone={trade.demurrage > 0 || trade.docsMissing > 0 ? 'warn' : undefined}
              sub={`Duty ${tkShort(trade.dutyDue)}${trade.demurrage ? ` · demurrage ${tkShort(trade.demurrage)}` : ''}${trade.docsMissing ? ` · ${trade.docsMissing} documents missing` : ''}`} />
          </div>

          <div className="grid2">
            <Card icon="ship" title="Import pipeline" sub={(Object.keys(IMPORT_STAGES) as ImportStage[]).filter((k) => trade.importsByStage[k]).map((k) => `${trade.importsByStage[k]} ${IMPORT_STAGES[k].toLowerCase()}`).join(' · ') || 'No open LCs'}
              action={<a className="link" href={href('imports')}>All shipments</a>}>
              <div className="rows">
                {trade.imports.slice(0, 6).map((r) => <PipelineLine key={r.s.id} r={r} />)}
                {!trade.imports.length && <Empty>No imports on the way.</Empty>}
              </div>
            </Card>
            <Card icon="arrowOut" title="Export orders" sub={trade.usdRate ? `Last rate used Tk ${fmt(trade.usdRate)} per USD` : undefined} action={<a className="link" href={href('imports')}>All shipments</a>}>
              <div className="rows">
                {trade.exports.slice(0, 6).map((r) => <PipelineLine key={r.s.id} r={r} />)}
                {!trade.exports.length && <Empty>No export orders open.</Empty>}
              </div>
            </Card>
          </div>
        </>
      )}

      <h2 className="dash-h"><Icon name="receipt" size={20} />Orders, money and stock</h2>
      <div className="grid2">
        {book.toDeliver.length > 0 && can('deliveries') && (
          <Card icon="truck" title="Orders waiting for delivery" sub={`Billed, goods not all gone yet${book.onTheRoad ? ` · ${book.onTheRoad} trips on the road now` : ''}`}
            action={<a className="link" href={href('deliveries')}>Delivery</a>}>
            <div className="rows">
              {book.toDeliver.slice(0, 6).map((i) => (
                <div key={i.id} className="row-wrap">
                  <div className="row">
                    <span className="name">{byId(db.dealers, i.dealerId)?.name}</span>
                    <span className="meta">{i.id} · {fshort(i.date)} · {fmt(i.units)} units{i.partial ? ' left' : ''}</span>
                    <span className="amt">{tkShort(i.total)}</span>
                  </div>
                  <Button size="sm" variant="secondary" icon="check" className="edit-only" onClick={() => sheets.open(DeliverSheet, { invoiceId: i.id })}>Deliver</Button>
                </div>
              ))}
              {book.toDeliver.length > 6 && <div className="row foot-note">and {book.toDeliver.length - 6} more</div>}
            </div>
          </Card>
        )}

        <Card icon="factory" title="Factory orders in progress" action={<a className="link" href={href('factory-orders')}>View all</a>}>
          {open.length ? open.map(({ o, c }) => (
            <button key={o.id} type="button" className="order-row click" onClick={() => go('factory-orders/' + o.id)}>
              <div className="order-top">
                <b>{o.id} · {c.product?.name}</b>
                <span className="t-muted">{c.factory?.name}</span>
              </div>
              <Progress value={c.pct} />
              <div className="order-top small">
                <span>{fmt(c.received)} of {fmt(o.qty)} {c.unit} received</span>
                <b className="t-warn">{fmt(c.pending)} {c.unit} pending</b>
              </div>
            </button>
          )) : <Empty>No orders waiting on a factory.</Empty>}
        </Card>

        <Card icon="arrowIn" title="Dues to collect from dealers" action={<a className="link" href={href('cashbook')}>Collect</a>}>
          <div className="rows">
            {rec.rows.map((r) => (
              <DueRow key={r.dealer.id} name={r.dealer.name} meta={r.statusText} metaTone={r.overdue ? 'warn' : 'muted'} amount={r.due}
                onClick={() => sheets.open(DealerStatementSheet, { dealerId: r.dealer.id })} />
            ))}
            {!rec.rows.length && <Empty>No dealer owes anything.</Empty>}
          </div>
        </Card>

        <Card icon="arrowOut" title="What we owe" action={<a className="link" href={href('cashbook')}>Pay</a>}>
          <div className="rows">
            {pay.rows.map((r) => (
              <DueRow key={r.key} name={r.name} meta={r.meta} metaTone="muted" amount={r.due}
                onClick={() => go(r.kind === 'supplier' ? 'suppliers/' + r.supplierId : r.kind === 'factory' ? 'factory-orders/' + r.orderId : 'transport/transporters')} />
            ))}
            {!pay.rows.length && <Empty>Nothing to pay.</Empty>}
          </div>
        </Card>

        <Card icon="wallet" title="Today’s cashbook" action={<a className="link" href={href('cashbook')}>Open cashbook</a>}>
          <div className="kv-list">
            <div className="kv"><span>Opening balance</span><span>{tk(cash.opening)}</span></div>
            <div className="kv"><span>Cash in (sales and collection)</span><span>{tk(cash.in)}</span></div>
            <div className="kv"><span>Cash out (payments and expenses)</span><span>{tk(cash.out)}</span></div>
            <div className="kv strong"><span>Closing balance</span><span>{tk(cash.closing)}</span></div>
          </div>
        </Card>

        <Attention />
      </div>
    </>
  )
}

/** One shipment: where it is, what comes next and when, and its value. */
function PipelineLine({ r }: { r: PipelineRow }) {
  const late = r.daysTo != null && r.daysTo < 0
  return (
    <button type="button" className="pipe-row click" onClick={() => go('imports/' + r.s.id)}>
      <div className="order-top">
        <b>{r.s.id} · {r.name}</b>
        <span className="t-muted">{r.s.direction === 'export' ? `to ${r.s.country || 'buyer'}` : `from ${r.s.country || 'abroad'}`}</span>
      </div>
      <div className="pipe-steps" aria-label={`${r.done} of ${r.total} steps done`}>
        {Array.from({ length: r.total }, (_, i) => <span key={i} className={cls(i < r.done && 'on')} />)}
      </div>
      <div className="order-top small">
        <span>{r.stageText} · next: {r.next}</span>
        <span className="nowrap">
          {r.expected && <Pill tone={late ? 'warn' : r.daysTo! <= 7 ? 'info' : 'neutral'}>{late ? `${-r.daysTo!} days late` : r.daysTo === 0 ? 'today' : fshort(r.expected)}</Pill>}
          {' '}<b>{usd(r.usd)}</b>
        </span>
      </div>
    </button>
  )
}

/** Everything that needs a decision: low stock, vehicle papers and servicing. */
function Attention() {
  const { db } = useBooks()
  const low = db.products.filter(isLowStock)
  const papers = paperAlerts(db)
  const services = servicesDue(db)
  const count = low.length + papers.length + services.length
  return (
    <Card icon="alert" title="Needs attention" sub={count ? `${count} item${count === 1 ? '' : 's'}` : 'All clear'}>
      <div className="rows">
        {low.map((p) => (
          <button key={p.id} type="button" className="row click" onClick={() => go(p.kind === 'finished' ? 'products' : 'raw-materials')}>
            <span className="name"><IconBadge name={p.kind === 'finished' ? 'box' : 'layers'} tone="warn" size={15} /> {p.name}</span>
            <span className="meta t-muted">Low stock · alert at {fmt(p.lowAt)}</span>
            <span className="amt t-warn">{fmt(p.stock)} {p.unit}</span>
          </button>
        ))}
        {papers.map((a) => (
          <button key={a.vehicle.id + a.paper} type="button" className="row click" onClick={() => go('transport/vehicles')}>
            <span className="name"><IconBadge name="shield" tone="warn" size={15} /> {a.vehicle.name}</span>
            <span className="meta t-muted">{PAPERS[a.paper]}</span>
            <span className="amt t-warn">{a.state === 'expired' ? `Expired ${fshort(a.date)}` : `${a.days} days left`}</span>
          </button>
        ))}
        {services.map((s) => (
          <button key={'svc' + s.vehicle.id} type="button" className="row click" onClick={() => go('transport/vehicles')}>
            <span className="name"><IconBadge name="settings" tone="info" size={15} /> {s.vehicle.name}</span>
            <span className="meta t-muted">Servicing</span>
            <span className="amt">{!s.lastDate ? 'Not recorded' : s.state === 'late' ? 'Late' : 'Due soon'}</span>
          </button>
        ))}
        {!count && <Empty>Stock, papers and servicing are all in order.</Empty>}
      </div>
    </Card>
  )
}

/** Sales of the last fourteen days, with a way into the full analytics. */
function RecentSales() {
  const { db } = useBooks()
  const { level } = useAccess()
  const today = todayISO()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  const data = days.map((d) => {
    const t = totalsBetween(db, d, d)
    return { key: d, short: String(Number(d.slice(8))), long: fday(d), value: t.sales, line: t.profit, extra: [['orders', fmt(t.invoices)] as [string, string]] }
  })
  const total = data.reduce((s, d) => s + d.value, 0)
  const orders = days.reduce((s, d) => s + totalsBetween(db, d, d).invoices, 0)
  return (
    <Card icon="trend" title="Sales orders, last 14 days" sub={`${tkShort(total)} from ${plural(orders, 'order')}`}
      action={level('sales-analytics') !== 'none' ? <button type="button" className="link" onClick={() => go('sales-analytics')}>Open sales analytics</button> : undefined}>
      <ColumnChart data={data} valueName="Sales" lineName="Gross profit" format={tk} height={210} />
    </Card>
  )
}
