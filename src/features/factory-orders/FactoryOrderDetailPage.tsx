import { useSee } from '@/app/useSee'
import { byId, byDateTs, fdate, fmt, foCalc, tk, type FactoryReceipt, type FactoryBill } from '@shared/domain'
import { CustomView } from '@/components/CustomFields'
import { ClipButton } from '@/components/attachments/Attachments'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { PaySheet } from '@/features/payments/PaySheet'
import { shareOnWhatsApp } from '@/components/share'
import { Button, Card, DataTable, Empty, Pill, Progress, usePrint, useSheets } from '@/ui'
import { OrderProgress } from './OrderProgress'
import { OrderStatementDoc } from './orderDocs'
import { orderStatementText } from './orderText'
import { AmendOrderSheet } from './sheets/AmendOrderSheet'
import { EstimateDetailSheet } from './sheets/EstimateDetailSheet'
import { FactoryBillSheet } from './sheets/FactoryBillSheet'
import { ReceiveShipmentSheet } from './sheets/ReceiveShipmentSheet'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { SettleMaterialSheet } from './sheets/SettleMaterialSheet'

interface LedgerRow {
  id: string
  date?: string
  entry: string
  paid: number
  billed: number
  bal: number
  expected?: boolean
}
type ReceiptRow = (FactoryReceipt & { n: number; bill?: FactoryBill; pending?: false }) | { id: 'pending'; pending: true }

/** Each movement with the balance after it: payments push it up, bills pull it down. */
function withRunningBalance<T extends { paid: number; billed: number }>(rows: T[]): (T & { bal: number })[] {
  const out: (T & { bal: number })[] = []
  let bal = 0
  for (const r of rows) {
    bal += r.paid - r.billed
    out.push({ ...r, bal })
  }
  return out
}

const balanceText = (b: number) => (b > 0 ? `Factory owes us ${tk(b)}` : b < 0 ? `We owe ${tk(-b)}` : 'Settled')

export function FactoryOrderDetailPage({ id }: { id: string }) {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const print = usePrint()
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

  const movements = [
    ...o.payments.map((p) => ({ id: p.id, date: p.date, ts: p.ts, entry: `${p.note || 'Payment'} · ${p.method}`, paid: p.amount, billed: 0 })),
    ...o.bills.map((b) => ({ id: b.id, date: b.date, ts: b.ts, entry: `Bill ${b.billNo}`, paid: 0, billed: b.amount })),
  ].sort(byDateTs)
  const ledger: LedgerRow[] = withRunningBalance(movements)
  if (c.pending > 0 && c.unbilled > 0) {
    ledger.push({ id: 'expected', expected: true, entry: `Bill for remaining ${fmt(c.pending)} ${c.unit} at ${tk(o.rate)}`, paid: 0, billed: c.unbilled, bal: c.balance - c.unbilled })
  }
  const receipts: ReceiptRow[] = o.receipts.map((r, i) => ({ ...r, n: i + 1, bill: o.bills.find((b) => b.receiptId === r.id) }))
  if (c.pending > 0) receipts.push({ id: 'pending', pending: true })

  return (
    <>
      <PageHead
        back={{ to: 'factory-orders', label: 'Factory orders' }}
        title={`${o.id} · ${c.product?.name}`}
        pill={<Pill tone={c.tone}>{c.status}</Pill>}
        sub={<>{c.factory?.name} · Type {o.type}, {c.typeLabel.toLowerCase()} · Placed {fdate(o.placed)}{o.estimateId && <> · from <button type="button" className="link" onClick={() => sheets.open(EstimateDetailSheet, { estimateId: o.estimateId as string })}>{o.estimateId}</button></>}</>}
        actions={
          <>
            <Button variant="secondary" icon="edit" disabled={c.pending <= 0} onClick={() => sheets.open(AmendOrderSheet, { orderId: o.id })}>Change order</Button>
            <Button variant="secondary" icon="receipt" onClick={() => sheets.open(FactoryBillSheet, { orderId: o.id })}>Record factory bill</Button>
            <Button icon="wallet" variant="secondary" onClick={() => sheets.open(PaySheet, { kind: 'factory', orderId: o.id, crumb: 'Factory order' })}>Pay factory</Button>
            <Button variant="secondary" icon="truck" disabled={c.pending <= 0} onClick={() => sheets.open(TripSheet, { purpose: 'pickup', orderId: o.id })}>Arrange pickup</Button>
            <Button icon="arrowIn" disabled={c.pending <= 0} onClick={() => sheets.open(ReceiveShipmentSheet, { orderId: o.id })}>Receive shipment</Button>
          </>
        }
      />
      <OrderProgress db={db} o={o} />

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
            rows={receipts}
            rowClass={(r) => r.pending && 'pending-row'}
            empty="Nothing received yet."
            columns={[
              { label: 'Date', primary: true, render: (r) => (r.pending ? (o.expected ? `By ${fdate(o.expected)}` : 'Pending') : fdate(r.date)) },
              { label: 'Challan', render: (r) => (r.pending ? 'Not shipped yet' : `${r.challan || 'No challan'} · Shipment ${r.n}`) },
              { label: 'Quantity', align: 'right', render: (r) => (r.pending ? <b>{fmt(c.pending)} {c.unit}</b> : `${fmt(r.qty)} ${c.unit}${r.damaged ? ` (+${fmt(r.damaged)} rejected)` : ''}`) },
              { label: 'Freight', align: 'right', render: (r) => (r.pending || !r.freight ? '' : <span className="two-line right"><span>{tk(r.freight)}</span><small className="t-muted">{r.freightInCost ? 'In product cost' : 'Expense only'}</small></span>) },
              { label: 'Factory bill', align: 'right', render: (r) => (r.pending || !r.bill ? 'Not billed yet' : `${r.bill.billNo} · ${tk(r.bill.amount)}`) },
            ]}
          />
          {c.freight > 0 && <p className="card-body t-muted small-note">Freight to warehouse so far {tk(c.freight)}{c.freightInCost ? `, of which ${tk(c.freightInCost)} is in the product cost` : ''}.</p>}
        </Card>

        {(o.amendments?.length ?? 0) > 0 && (
          <Card icon="edit" title="Order changes" sub="Every change made while the factory was working.">
            <div className="rows">
              {o.amendments!.map((a) => (
                <div key={a.id} className="row">
                  <span className="two-line"><span className="name normal">{fmt(a.fromQty)} → <b>{fmt(a.toQty)}</b> {c.unit}{a.fromRate !== a.toRate ? ` · rate ${tk(a.fromRate)} → ${tk(a.toRate)}` : ''}</span><small className="t-muted">{a.reason}</small></span>
                  <span className="meta">{fdate(a.date)}</span>
                  <span className="amt">{a.toQty > a.fromQty ? `+${fmt(a.toQty - a.fromQty)}` : a.toQty < a.fromQty ? `−${fmt(a.fromQty - a.toQty)}` : ''}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {o.type === 1 && (
          <Card className="span-all" title="Our raw materials at the factory" sub="Bought by us and handed over for this order. Settle what is left: take it back or write it off.">
            <DataTable
              rows={c.materials}
              rowKey={(r) => r.productId}
              empty="No materials were handed over for this order."
              columns={[
                { label: 'Material', primary: true, render: (r) => r.name },
                { label: 'Given', align: 'right', render: (r) => `${fmt(r.given)} ${r.unit}` },
                { label: 'Used', align: 'right', render: (r) => `${fmt(r.used)} ${r.unit}` },
                { label: 'Taken back / wasted', align: 'right', render: (r) => (r.returned || r.wasted ? <span className="t-muted">{fmt(r.returned)} / {fmt(r.wasted)} {r.unit}</span> : <span className="t-muted">None</span>) },
                { label: 'Left at factory', align: 'right', render: (r) => (
                  <span className="nowrap"><b>{fmt(r.left)} {r.unit}</b>{r.left > 0 && <Button variant="ghost" size="sm" className="edit-only" onClick={(e) => { e.stopPropagation(); sheets.open(SettleMaterialSheet, { orderId: o.id, productId: r.productId }) }}>Settle</Button>}</span>
                ) },
              ]}
            />
          </Card>
        )}
      </div>

      <CustomView entity="factoryOrder" record={o} />
      {see.cost ? (
      <Card icon="wallet" title="Payment history for this lot" sub="Each payment and each bill moves the balance, so it always shows who owes whom. Pay any amount, any time."
          action={<div className="btn-row tight-row">
            <Button size="sm" variant="secondary" icon="print" onClick={() => print(<OrderStatementDoc db={db} o={o} />)}>Print</Button>
            <Button size="sm" variant="secondary" icon="send" onClick={() => shareOnWhatsApp(orderStatementText(db, o), c.factory?.phone)}>WhatsApp</Button>
            <Button size="sm" icon="wallet" className="edit-only" onClick={() => sheets.open(PaySheet, { kind: 'factory', orderId: o.id, crumb: 'Factory order' })}>Add payment</Button>
          </div>}>
          <DataTable
            rows={ledger}
            rowClass={(r) => r.expected && 'expected-row'}
            empty="No payments or bills yet."
            columns={[
              { label: 'Date', render: (r) => (r.expected ? 'Expected' : fdate(r.date)) },
              { label: 'Entry', primary: true, render: (r) => r.entry },
              { label: 'We paid', align: 'right', render: (r) => (r.paid ? tk(r.paid) : '') },
              { label: 'Factory billed', align: 'right', render: (r) => (r.billed ? tk(r.billed) : '') },
              { label: 'Balance after', align: 'right', render: (r) => <b className={r.bal > 0 ? 't-good' : r.bal < 0 ? 't-warn' : 't-muted'}>{r.expected && r.bal < 0 ? `We will owe ${tk(-r.bal)}` : balanceText(r.bal)}</b> },
  
              { label: '', align: 'right', render: (r) => { const pay = o.payments.find((p) => p.id === r.id); return pay ? <ClipButton target="factoryPayment" id={pay.id} files={pay.attachments || []} title={`${o.id} payment`} /> : '' } },
            ]}
          />
        </Card>
      ) : <Card icon="wallet" title="Payment history for this lot"><Empty>Payments, bills and factory prices are hidden for your role.</Empty></Card>}
    </>
  )
}
