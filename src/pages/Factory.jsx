import { useState } from 'react'
import { CustomView } from '../custom.jsx'
import { fdate, fmt, tk } from '../lib/format.js'
import { byId, foCalc, newestFirst } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Empty, Pill, Progress, Segmented, Stat, go, useSheets } from '../ui.jsx'
import { PageHead } from './common.jsx'

export function FactoryOrders() {
  const { db } = useStore()
  const sheets = useSheets()
  const [filter, setFilter] = useState('all')
  const rows = db.factoryOrders.filter((o) => filter === 'all' || String(o.type) === filter).map((o) => ({ ...o, c: foCalc(db, o) }))
  return (
    <>
      <PageHead title="Factory orders" sub="Every order placed with a factory, what has arrived and what is still due." actions={
        <>
          <Button variant="secondary" onClick={() => sheets.open('addFactory')}>Add factory</Button>
          <Button onClick={() => sheets.open('newFactoryOrder')}>New factory order</Button>
        </>
      } />
      <div className="grid2 tight">
        <div className="card explain">
          <b>Type 1 · Raw material supplied</b>
          <p>We buy raw materials, hand them to the factory and receive finished goods. The factory bills only its making charge.</p>
        </div>
        <div className="card explain">
          <b>Type 2 · Direct order</b>
          <p>The factory uses its own materials. We order finished goods and the factory bills the full product price.</p>
        </div>
      </div>
      <Card>
        <div className="card-tools">
          <Segmented label="Order type" value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All orders' },
            { value: '1', label: 'Raw material supplied' },
            { value: '2', label: 'Direct order' },
          ]} />
        </div>
        <DataTable
          rows={rows}
          onRow={(r) => go('factory-orders/' + r.id)}
          empty="No factory orders yet. Place the first one with New factory order."
          columns={[
            { label: 'Order', primary: true, render: (r) => <span className="order-id">{r.id}</span> },
            { label: 'Factory', render: (r) => r.c.factory?.name },
            { label: 'Product', render: (r) => r.c.product?.name },
            { label: 'Type', render: (r) => <span className="t-muted">{r.c.typeLabel}</span> },
            { label: 'Ordered', align: 'right', render: (r) => `${fmt(r.qty)} ${r.c.unit}` },
            { label: 'Received', align: 'right', render: (r) => fmt(r.c.received) },
            { label: 'Pending', align: 'right', render: (r) => <b className={r.c.pending > 0 ? 't-warn' : 't-muted'}>{fmt(r.c.pending)}</b> },
            { label: 'Money balance', align: 'right', render: (r) => <span className={`t-${r.c.balanceTone}`}>{r.c.balanceText}</span> },
            { label: 'Status', render: (r) => <Pill tone={r.c.tone}>{r.c.status}</Pill> },
          ]}
        />
      </Card>
    </>
  )
}

export function FactoryOrderDetail({ id }) {
  const { db } = useStore()
  const sheets = useSheets()
  const o = byId(db.factoryOrders, id)
  if (!o) {
    return (
      <>
        <PageHead title="Order not found" back={{ to: 'factory-orders', label: 'Factory orders' }} />
        <Card><Empty>There is no factory order {id}.</Empty></Card>
      </>
    )
  }
  const c = foCalc(db, o)
  const ledger = [
    ...o.payments.map((p) => ({ ...p, entry: `${p.note || 'Payment'} · ${p.method}`, paid: p.amount, billed: 0 })),
    ...o.bills.map((b) => ({ ...b, entry: `Bill ${b.billNo}`, paid: 0, billed: b.amount })),
  ].sort((a, b) => -newestFirst(a, b))
  const ledgerRows = ledger.map((l, i) => ({ ...l, bal: ledger.slice(0, i + 1).reduce((s, x) => s + x.paid - x.billed, 0) }))
  const run = c.balance
  if (c.pending > 0 && c.unbilled > 0) {
    ledgerRows.push({ id: 'exp', expected: true, entry: `Bill for remaining ${fmt(c.pending)} ${c.unit} at ${tk(o.rate)}`, paid: 0, billed: c.unbilled, bal: run - c.unbilled })
  }
  const balText = (b) => (b > 0 ? `Factory owes us ${tk(b)}` : b < 0 ? `We owe ${tk(-b)}` : 'Settled')
  const receiptRows = o.receipts.map((r, i) => ({ ...r, n: i + 1, bill: o.bills.find((b) => b.receiptId === r.id) }))
  if (c.pending > 0) receiptRows.push({ id: 'pending', pending: true })

  return (
    <>
      <PageHead
        back={{ to: 'factory-orders', label: 'Factory orders' }}
        title={`${o.id} · ${c.product?.name}`}
        pill={<Pill tone={c.tone}>{c.status}</Pill>}
        sub={`${c.factory?.name} · Type ${o.type}, ${c.typeLabel.toLowerCase()} · Placed ${fdate(o.placed)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => sheets.open('factoryBill', { orderId: o.id })}>Record factory bill</Button>
            <Button variant="secondary" onClick={() => sheets.open('pay', { kind: 'factory', orderId: o.id, crumb: 'Factory order' })}>Pay factory</Button>
            <Button disabled={c.pending <= 0} onClick={() => sheets.open('receiveShipment', { orderId: o.id })}>Receive shipment</Button>
          </>
        }
      />
      <div className="stats">
        <Stat label="Ordered" value={`${fmt(o.qty)} ${c.unit}`} sub={`${o.type === 1 ? 'Making charge' : 'Price'} ${tk(o.rate)} per unit`} />
        <Stat label="Received" value={`${fmt(c.received)} ${c.unit}`} tone="good" sub={`In ${o.receipts.length} shipment${o.receipts.length === 1 ? '' : 's'}`} />
        <Stat label="Still due from factory" value={`${fmt(c.pending)} ${c.unit}`} tone={c.pending > 0 ? 'warn' : undefined} sub={c.pending > 0 ? (o.expected ? `Promised by ${fdate(o.expected)}` : 'No delivery date set') : 'Everything has arrived'} />
        <Stat label="Money balance" value={tk(Math.abs(c.balance))} tone={c.balance > 0 ? 'good' : c.balance < 0 ? 'warn' : undefined}
          sub={c.balance > 0 ? 'Factory owes us (advance not yet used)' : c.balance < 0 ? 'We owe the factory' : c.billed ? 'Settled' : 'Nothing billed yet'} />
      </div>

      <div className="grid2">
        <Card title="Goods received">
          <div className="card-body pt0">
            <Progress value={c.pct} />
            <div className="order-top small">
              <span>{fmt(c.received)} of {fmt(o.qty)} {c.unit} ({c.pct}%)</span>
              <b className={c.pending > 0 ? 't-warn' : 't-good'}>{c.pending > 0 ? `${fmt(c.pending)} pending` : 'Received in full'}</b>
            </div>
          </div>
          <DataTable
            rows={receiptRows}
            rowClass={(r) => r.pending && 'pending-row'}
            empty="Nothing received yet."
            columns={[
              { label: 'Date', primary: true, render: (r) => (r.pending ? (o.expected ? `By ${fdate(o.expected)}` : 'Pending') : fdate(r.date)) },
              { label: 'Challan', render: (r) => (r.pending ? 'Not shipped yet' : `${r.challan || 'No challan'} · Shipment ${r.n}`) },
              { label: 'Quantity', align: 'right', render: (r) => (r.pending ? <b>{fmt(c.pending)} {c.unit}</b> : `${fmt(r.qty)} ${c.unit}${r.damaged ? ` (+${fmt(r.damaged)} rejected)` : ''}`) },
              { label: 'Factory bill', align: 'right', render: (r) => (r.pending || !r.bill ? 'Not billed yet' : `${r.bill.billNo} · ${tk(r.bill.amount)}`) },
            ]}
          />
        </Card>

        {o.type === 1 && (
          <Card title="Our raw materials at the factory" sub="Bought by us and handed over for this order.">
            <DataTable
              rows={c.materials}
              rowKey={(r) => r.productId}
              empty="No materials were handed over for this order."
              columns={[
                { label: 'Material', primary: true, render: (r) => r.name },
                { label: 'Given', align: 'right', render: (r) => `${fmt(r.given)} ${r.unit}` },
                { label: 'Used', align: 'right', render: (r) => `${fmt(r.used)} ${r.unit}` },
                { label: 'Left at factory', align: 'right', render: (r) => <b>{fmt(r.left)} {r.unit}</b> },
              ]}
            />
          </Card>
        )}
      </div>

      <CustomView entity="factoryOrder" record={o} />
      <Card title="Money ledger with this factory" sub="Each payment and each bill moves the balance, so it always shows who owes whom.">
        <DataTable
          rows={ledgerRows}
          rowClass={(r) => r.expected && 'expected-row'}
          empty="No payments or bills yet."
          columns={[
            { label: 'Date', render: (r) => (r.expected ? 'Expected' : fdate(r.date)) },
            { label: 'Entry', primary: true, render: (r) => r.entry },
            { label: 'We paid', align: 'right', render: (r) => (r.paid ? tk(r.paid) : '') },
            { label: 'Factory billed', align: 'right', render: (r) => (r.billed ? tk(r.billed) : '') },
            { label: 'Balance after', align: 'right', render: (r) => <b className={r.bal > 0 ? 't-good' : r.bal < 0 ? 't-warn' : 't-muted'}>{r.expected && r.bal < 0 ? `We will owe ${tk(-r.bal)}` : balText(r.bal)}</b> },
          ]}
        />
      </Card>
    </>
  )
}
