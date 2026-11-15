import { flong, fmt, plural, tk, todayISO } from '../lib/format.js'
import { cashForDay, foCalc, isLow, payables, receivables } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, Empty, Progress, Stat, go, useSheets } from '../ui.jsx'
import { DueRow, PageHead } from './common.jsx'

export default function Dashboard() {
  const { db } = useStore()
  const sheets = useSheets()
  const today = todayISO()
  const pay = payables(db)
  const rec = receivables(db)
  const cash = cashForDay(db, today)
  const open = db.factoryOrders.map((o) => ({ o, c: foCalc(db, o) })).filter((x) => x.c.pending > 0)
  const low = db.products.filter(isLow)

  return (
    <>
      <PageHead title="Dashboard" sub={flong(today)} actions={
        <>
          <Button variant="secondary" onClick={() => sheets.open('newFactoryOrder')}>New factory order</Button>
          <Button onClick={() => go('sell')}>New sale invoice</Button>
        </>
      } />
      <div className="stats">
        <Stat label="We owe (suppliers and factories)" value={tk(pay.total)} tone={pay.total > 0 ? 'warn' : undefined} sub={pay.rows.length ? `${plural(pay.rows.length, 'bill')} to pay` : 'Nothing to pay'} />
        <Stat label="Owed to us (dealers)" value={tk(rec.total)} tone={rec.total > 0 ? 'good' : undefined} sub={rec.rows.length ? `${plural(rec.rows.length, 'dealer')} with dues` : 'No dues'} />
        <Stat label="Cash in hand today" value={tk(cash.closing)} sub={`In ${tk(cash.in)} · Out ${tk(cash.out)}`} />
        <Stat label="Goods pending from factories" value={plural(open.length, 'order')} sub={open.length ? `${open.filter((x) => x.c.received === 0).length} not yet started` : 'All received'} />
      </div>

      <div className="grid2">
        <Card title="Factory orders in progress" action={<a className="link" href="#/factory-orders">View all</a>}>
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

        <Card title="Dues to collect from dealers" action={<a className="link" href="#/cashbook">Collect</a>}>
          <div className="rows">
            {rec.rows.map((r) => (
              <DueRow key={r.dealer.id} name={r.dealer.name} meta={r.statusText} metaTone={r.overdue ? 'warn' : 'muted'} amount={r.due}
                onClick={() => sheets.open('dealerStatement', { dealerId: r.dealer.id })} />
            ))}
            {!rec.rows.length && <Empty>No dealer owes anything.</Empty>}
          </div>
        </Card>

        <Card title="What we owe" action={<a className="link" href="#/cashbook">Pay</a>}>
          <div className="rows">
            {pay.rows.map((r) => (
              <DueRow key={r.key} name={r.name} meta={r.meta} metaTone="muted" amount={r.due}
                onClick={() => (r.kind === 'supplier' ? go('suppliers/' + r.supplierId) : go('factory-orders/' + r.orderId))} />
            ))}
            {!pay.rows.length && <Empty>Nothing to pay.</Empty>}
          </div>
        </Card>

        <Card title="Today’s cashbook" action={<a className="link" href="#/cashbook">Open cashbook</a>}>
          <div className="kv-list">
            <div className="kv"><span>Opening balance</span><span>{tk(cash.opening)}</span></div>
            <div className="kv"><span>Cash in (sales and collection)</span><span>{tk(cash.in)}</span></div>
            <div className="kv"><span>Cash out (payments and expenses)</span><span>{tk(cash.out)}</span></div>
            <div className="kv strong"><span>Closing balance</span><span>{tk(cash.closing)}</span></div>
          </div>
        </Card>

        {low.length > 0 && (
          <Card title="Running low in the warehouse" action={<a className="link" href="#/products">Stock</a>}>
            <div className="rows">
              {low.map((p) => (
                <div key={p.id} className="row">
                  <span className="name">{p.name}</span>
                  <span className="meta t-muted">Alert at {fmt(p.lowAt)}</span>
                  <span className="amt t-warn">{fmt(p.stock)} {p.unit}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
