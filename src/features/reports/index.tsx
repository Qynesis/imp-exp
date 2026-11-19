import { useState, type ReactNode } from 'react'
import {
  addMonths, fmonth, fmt, foCalc, fshort, payables, PRODUCT_KINDS, profitAndLoss, receivables, sum, supplierLedger, thisMonth, tk, type Db, type MonthKey,
} from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Icon, Segmented } from '@/ui'

type Tab = 'pnl' | 'dues' | 'stock' | 'balances'
const TABS: { value: Tab; label: string }[] = [
  { value: 'pnl', label: 'Profit and loss' },
  { value: 'dues', label: 'Dealer dues' },
  { value: 'stock', label: 'Stock' },
  { value: 'balances', label: 'Factory and supplier balances' },
]

export default function ReportsPage() {
  const { db } = useBooks()
  const [tab, setTab] = useState<Tab>('pnl')
  const [month, setMonth] = useState(thisMonth)
  const title = TABS.find((t) => t.value === tab)?.label
  const body: Record<Tab, () => ReactNode> = {
    pnl: () => <ProfitAndLoss db={db} month={month} setMonth={setMonth} />,
    dues: () => <DealerDues db={db} />,
    stock: () => <StockValue db={db} />,
    balances: () => <Balances db={db} />,
  }
  return (
    <>
      <PageHead title="Reports" sub={tab === 'pnl' ? fmonth(month) : `${title} as of today`} actions={<Button icon="print" variant="secondary" onClick={() => window.print()}>Print report</Button>} />
      <Segmented<Tab> label="Report" value={tab} onChange={setTab} options={TABS} />
      <div className="stack report" key={tab}>{body[tab]()}</div>
    </>
  )
}

function ProfitAndLoss({ db, month, setMonth }: { db: Db; month: MonthKey; setMonth: (m: MonthKey) => void }) {
  const r = profitAndLoss(db, month)
  return (
    <Card title="Profit and loss" action={
      <div className="month-nav">
        <button type="button" className="icon-btn bordered" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="back" size={18} /></button>
        <b>{fmonth(month)}</b>
        <button type="button" className="icon-btn bordered" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevron" size={18} /></button>
      </div>
    }>
      <div className="kv-list">
        <div className="kv"><span>Sales to dealers <small className="t-muted">· {r.invoices} invoices</small></span><span>{tk(r.sales)}</span></div>
        {r.exports > 0 && <div className="kv"><span>Export sales <small className="t-muted">· {r.exports} shipments</small></span><span>{tk(r.exportSales)}</span></div>}
        <div className="kv"><span>Cost of goods sold</span><span>{tk(r.cogs)}</span></div>
        {r.exports > 0 && <div className="kv"><span>Cost of exports, with freight and charges</span><span>{tk(r.exportCost)}</span></div>}
        <div className="kv strong"><span>Gross profit</span><span>{tk(r.gross)}</span></div>
        {r.expenses.map((e) => (
          <div className="kv" key={e.label}><span>{e.label} <small className="t-muted">· Expense</small></span><span>{tk(e.amount)}</span></div>
        ))}
        {r.assetGain !== 0 && <div className="kv"><span>{r.assetGain > 0 ? 'Profit on assets sold' : 'Loss on assets sold or scrapped'}</span><span className={r.assetGain < 0 ? 't-warn' : 't-good'}>{tk(Math.abs(r.assetGain))}</span></div>}
        <div className={`kv total ${r.net < 0 ? 't-warn' : ''}`}><span>{r.net < 0 ? 'Net loss' : 'Net profit'}</span><span>{tk(Math.abs(r.net))}</span></div>
      </div>
    </Card>
  )
}

function DealerDues({ db }: { db: Db }) {
  const rec = receivables(db)
  return (
    <Card title="Dealer dues" action={<b className="t-good">{tk(rec.total)}</b>}>
      <DataTable
        rows={rec.rows}
        rowKey={(r) => r.dealer.id}
        empty="No dealer owes anything."
        columns={[
          { label: 'Dealer', primary: true, render: (r) => r.dealer.name },
          { label: 'Area', render: (r) => r.dealer.area },
          { label: 'Status', render: (r) => <span className={r.overdue ? 't-warn' : 't-muted'}>{r.statusText}</span> },
          { label: 'Unpaid invoices', align: 'right', render: (r) => r.open.length },
          { label: 'Credit limit', align: 'right', render: (r) => (r.dealer.terms === 'credit' ? tk(r.dealer.limit) : 'No credit') },
          { label: 'Last payment', align: 'right', render: (r) => (r.lastPayment ? `${tk(r.lastPayment.amount)} · ${fshort(r.lastPayment.date)}` : '') },
          { label: 'Due', align: 'right', render: (r) => <b>{tk(r.due)}</b> },
        ]}
      />
    </Card>
  )
}

function StockValue({ db }: { db: Db }) {
  return (
    <Card title="Stock in warehouse" action={<b>Value {tk(sum(db.products, (p) => p.stock * (p.cost || 0)))}</b>}>
      <DataTable
        rows={db.products}
        empty="No products yet."
        columns={[
          { label: 'Product', primary: true, render: (r) => r.name },
          { label: 'Kind', render: (r) => PRODUCT_KINDS[r.kind] },
          { label: 'In warehouse', align: 'right', render: (r) => `${fmt(r.stock)} ${r.unit}` },
          { label: 'Cost per unit', align: 'right', render: (r) => tk(r.cost) },
          { label: 'Stock value', align: 'right', render: (r) => <b>{tk(r.stock * (r.cost || 0))}</b> },
        ]}
      />
    </Card>
  )
}

function Balances({ db }: { db: Db }) {
  const pay = payables(db)
  const sup = db.suppliers.map((s) => supplierLedger(db, s.id))
  const orders = db.factoryOrders.map((o) => ({ ...o, c: foCalc(db, o) })).filter((o) => o.c.balance !== 0 || o.c.pending > 0)
  return (
    <>
      <Card title="Supplier balances" action={<b className="t-warn">{tk(sum(sup, (l) => l.due))}</b>}>
        <DataTable
          rows={sup}
          rowKey={(r) => r.supplier.id}
          empty="No suppliers yet."
          columns={[
            { label: 'Supplier', primary: true, render: (r) => r.supplier.name },
            { label: 'Total purchased', align: 'right', render: (r) => tk(r.purchased) },
            { label: 'Paid', align: 'right', render: (r) => tk(r.paid) },
            { label: 'We owe', align: 'right', render: (r) => <b className={r.due > 0 ? 't-warn' : 't-muted'}>{r.due > 0 ? tk(r.due) : 'Settled'}</b> },
          ]}
        />
      </Card>
      <Card title="Factory balances" sub={pay.advanceTotal > 0 ? `Advance lying with factories: ${tk(pay.advanceTotal)}` : undefined}>
        <DataTable
          rows={orders}
          empty="Every factory order is received and settled."
          columns={[
            { label: 'Order', primary: true, render: (r) => `${r.id} · ${r.c.factory?.name}` },
            { label: 'Product', render: (r) => r.c.product?.name },
            { label: 'Goods pending', align: 'right', render: (r) => `${fmt(r.c.pending)} ${r.c.unit}` },
            { label: 'Billed', align: 'right', render: (r) => tk(r.c.billed) },
            { label: 'Paid', align: 'right', render: (r) => tk(r.c.paid) },
            { label: 'Balance', align: 'right', render: (r) => <b className={`t-${r.c.balanceTone}`}>{r.c.balanceText}</b> },
          ]}
        />
      </Card>
    </>
  )
}
