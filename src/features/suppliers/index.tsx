import { ClipButton } from '@/components/attachments/Attachments'
import { useMemo, useState } from 'react'
import { byId, fdate, fmt, fullAddress, supplierLedger, supplyRows, tk } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import type { FeatureRouteProps } from '@/app/features'
import { CustomView } from '@/components/CustomFields'
import { PageHead } from '@/components/PageHead'
import { PartyView } from '@/components/PartyFields'
import { PhoneLink } from '@/components/PhoneLink'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { PaySheet } from '@/features/payments/PaySheet'
import { Button, Card, DataTable, Empty, cls, usePaged, useSheets, SearchBox } from '@/ui'
import { AddSupplierSheet } from './sheets/AddSupplierSheet'
import { NewPurchaseSheet } from './sheets/NewPurchaseSheet'
import { SupplyOverviewSheet } from './sheets/SupplyOverviewSheet'

/** #/suppliers and #/suppliers/<supplier id>: list beside detail on wide screens, one at a time on phones. */
export default function SuppliersPage({ params: [id] }: FeatureRouteProps) {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.suppliers.map((s) => supplierLedger(db, s.id)).filter((l) => (l.supplier.name + ' ' + l.supplier.goods + ' ' + fullAddress(l.supplier)).toLowerCase().includes(needle))
  }, [db, q])
  const paged = usePaged(list, 15)
  const shownId = byId(db.suppliers, id) ? id : db.suppliers[0]?.id
  const led = shownId ? supplierLedger(db, shownId) : null

  return (
    <div className={cls('md', id && 'has-detail')}>
      <div className="md-head">
        <PageHead title="Suppliers" sub="Who we buy raw materials and packaging from, on cash or credit."
          actions={
            <>
              <Button icon="layers" variant="secondary" onClick={() => sheets.open(SupplyOverviewSheet, {})}>What we buy, by supplier</Button>
              <Button icon="plus" onClick={() => sheets.open(AddSupplierSheet, {})}>Add supplier</Button>
            </>
          } />
      </div>
      <div className="md-grid">
        <Card className="md-list">
          <div className="card-body">
            <SearchBox value={q} onChange={setQ} placeholder="Name, goods or area" wide />
          </div>
          <div className="pick-list">
            {paged.rows.map((l) => (
              <button key={l.supplier.id} type="button" className={cls('pick', l.supplier.id === shownId && 'active')} onClick={() => go('suppliers/' + l.supplier.id)}>
                <b>{l.supplier.name}</b>
                <span className="t-muted">{l.supplier.goods || 'No goods listed'}</span>
                {(l.supplier.area || l.supplier.city) && <span className="t-muted">{[l.supplier.area, l.supplier.city].filter(Boolean).join(', ')}</span>}
                {see.cost && <span className={l.due > 0 ? 't-warn strong' : 't-muted strong'}>{l.due > 0 ? `We owe ${tk(l.due)}` : 'Settled'}</span>}
              </button>
            ))}
            {paged.pager}
            {!list.length && <Empty>{db.suppliers.length ? 'No supplier matches that search.' : 'No suppliers yet.'}</Empty>}
          </div>
        </Card>

        {led && <SupplierDetail led={led} onNewPurchase={() => sheets.open(NewPurchaseSheet, { supplierId: led.supplier.id })} onPay={() => sheets.open(PaySheet, { kind: 'supplier', supplierId: led.supplier.id, crumb: 'Suppliers' })} />}
      </div>
    </div>
  )
}

function SupplierDetail({ led, onNewPurchase, onPay }: { led: ReturnType<typeof supplierLedger>; onNewPurchase: () => void; onPay: () => void }) {
  const { db } = useBooks()
  const see = useSee()
  const supply = supplyRows(db, led.supplier.id)
  const m = (n: number) => (see.cost ? tk(n) : <Hidden />)
  const s = led.supplier
  const sheets = useSheets()
  const addr = fullAddress(s)
  return (
    <div className="md-detail stack">
      <a className="back-link only-mobile" href="#/suppliers">‹ All suppliers</a>
      <Card>
        <div className="card-body">
          <div className="detail-head">
            <div>
              <h2 className="h-lg">{s.name}</h2>
              <p className="t-muted tight">
                {s.goods || 'No goods listed'} · {s.terms === 'credit' ? `Credit terms: ${s.days} days` : 'Cash terms'}
                {(s.contact || s.phone) && <><br />{s.contact}{s.contact && s.phone ? ' · ' : ''}<PhoneLink phone={s.phone} label={s.name} /></>}
                {addr && <><br />{addr}</>}
                <br /><CustomView entity="supplier" record={s} inline />
              </p>
            </div>
            <div className="page-actions">
              {!accessGuard.readonly && <Button icon="edit" variant="secondary" onClick={() => sheets.open(AddSupplierSheet, { supplierId: s.id })}>Edit details</Button>}
              <Button icon="cart" variant="secondary" onClick={onNewPurchase}>New purchase</Button>
              {see.cost && <Button icon="wallet" disabled={led.due <= 0} onClick={onPay}>Pay supplier</Button>}
            </div>
          </div>
          <div className="mini-stats">
            <div><span>Items they supply</span><b>{supply.length}</b><small className="t-muted">{fmt(supply.reduce((s, r) => s + r.purchases, 0))} deliveries</small></div>
            <div><span>Total purchased</span><b>{m(led.purchased)}</b></div>
            <div><span>Paid so far</span><b>{m(led.paid)}</b></div>
            <div><span>We owe</span><b className={led.due > 0 ? 't-warn' : ''}>{m(led.due)}</b></div>
          </div>
        </div>
      </Card>
      <Card icon="pin" title="Contact, address and papers" sub={s.note || undefined}>
        <div className="card-body"><PartyView p={s} name={s.name} /></div>
      </Card>
      <Card icon="box" title="Items from this supplier" sub="What they send us, how much, and at what price.">
        <DataTable rows={supply} rowKey={(r) => r.productId} empty="Nothing bought from this supplier yet."
          columns={[
            { label: 'Item', primary: true, render: (r) => <span className="two-line"><b>{r.productName}</b><small className="t-muted">{r.purchases} purchase{r.purchases === 1 ? '' : 's'} · last {fdate(r.lastDate)}</small></span> },
            { label: 'Total quantity', align: 'right', render: (r) => `${fmt(r.qty)} ${r.unit}` },
            { label: 'Last price', align: 'right', render: (r) => m(r.lastRate) },
            { label: 'Average price', align: 'right', render: (r) => m(r.avgRate) },
            { label: 'Lowest – highest', align: 'right', render: (r) => (see.cost ? (r.minRate === r.maxRate ? tk(r.minRate) : `${tk(r.minRate)} – ${tk(r.maxRate)}`) : <Hidden />) },
            { label: 'Total value', align: 'right', render: (r) => m(r.amount) },
          ]} />
      </Card>
      <Card title="Purchases">
        <DataTable
            pageSize={25}
          rows={led.bills}
          empty="No purchases from this supplier yet."
          columns={[
            { label: 'Bill', primary: true, render: (r) => r.billNo },
            { label: 'Date', render: (r) => fdate(r.date) },
            { label: 'Items', render: (r) => r.items },
            { label: 'Terms', render: (r) => (r.terms === 'cash' ? 'Cash' : 'Credit') },
            { label: 'Bill amount', align: 'right', render: (r) => m(r.amount) },
            { label: 'Paid', align: 'right', render: (r) => m(r.paid) },
            { label: 'Due', align: 'right', render: (r) => (!see.cost ? <Hidden /> : r.amount - r.paid > 0 ? <b className="t-warn">{tk(r.amount - r.paid)}</b> : <b className="t-muted">Paid</b>) },
          ]}
        />
      </Card>
      <Card title="Payments made">
        <div className="rows">
          {led.payments.map((p) => {
            const bill = byId(db.purchases, p.purchaseId)
            return (
              <div key={p.id} className="row">
                <span className="meta">{fdate(p.date)}</span>
                <span className="name normal">{p.method} · {p.note || 'Payment'}{bill ? ` · ${bill.billNo}` : ''}</span>
                <span className="amt">{m(p.amount)}</span>
                <ClipButton target="supplierPayment" id={p.id} files={p.attachments || []} title={`${led.supplier.name} payment`} />
              </div>
            )
          })}
          {!led.payments.length && <Empty>No payments made yet.</Empty>}
        </div>
      </Card>
    </div>
  )
}
