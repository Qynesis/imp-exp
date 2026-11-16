import { useMemo, useState } from 'react'
import { byId, fdate, supplierLedger, tk } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { CustomView } from '@/components/CustomFields'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { PaySheet } from '@/features/payments/PaySheet'
import { Button, Card, DataTable, Empty, cls, useSheets } from '@/ui'
import { AddSupplierSheet } from './sheets/AddSupplierSheet'
import { NewPurchaseSheet } from './sheets/NewPurchaseSheet'

/** #/suppliers and #/suppliers/<supplier id>: list beside detail on wide screens, one at a time on phones. */
export default function SuppliersPage({ params: [id] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.suppliers.map((s) => supplierLedger(db, s.id)).filter((l) => (l.supplier.name + ' ' + l.supplier.goods).toLowerCase().includes(needle))
  }, [db, q])
  const shownId = byId(db.suppliers, id) ? id : db.suppliers[0]?.id
  const led = shownId ? supplierLedger(db, shownId) : null

  return (
    <div className={cls('md', id && 'has-detail')}>
      <div className="md-head">
        <PageHead title="Suppliers" sub="Who we buy raw materials and packaging from, on cash or credit."
          actions={<Button icon="plus" onClick={() => sheets.open(AddSupplierSheet)}>Add supplier</Button>} />
      </div>
      <div className="md-grid">
        <Card className="md-list">
          <div className="card-body">
            <label className="field">
              <span className="field-label">Search suppliers</span>
              <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or goods" />
            </label>
          </div>
          <div className="pick-list">
            {list.map((l) => (
              <button key={l.supplier.id} type="button" className={cls('pick', l.supplier.id === shownId && 'active')} onClick={() => go('suppliers/' + l.supplier.id)}>
                <b>{l.supplier.name}</b>
                <span className="t-muted">{l.supplier.goods || 'No goods listed'}</span>
                <span className={l.due > 0 ? 't-warn strong' : 't-muted strong'}>{l.due > 0 ? `We owe ${tk(l.due)}` : 'Settled'}</span>
              </button>
            ))}
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
  const s = led.supplier
  const contact = [s.contact, s.phone, s.address].filter(Boolean).join(' · ')
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
                {contact && <><br />{contact}</>}
                <br /><CustomView entity="supplier" record={s} inline />
              </p>
            </div>
            <div className="page-actions">
              <Button icon="cart" variant="secondary" onClick={onNewPurchase}>New purchase</Button>
              <Button icon="wallet" disabled={led.due <= 0} onClick={onPay}>Pay supplier</Button>
            </div>
          </div>
          <div className="mini-stats">
            <div><span>Total purchased</span><b>{tk(led.purchased)}</b></div>
            <div><span>Paid so far</span><b>{tk(led.paid)}</b></div>
            <div><span>We owe</span><b className={led.due > 0 ? 't-warn' : ''}>{tk(led.due)}</b></div>
          </div>
        </div>
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
            { label: 'Bill amount', align: 'right', render: (r) => tk(r.amount) },
            { label: 'Paid', align: 'right', render: (r) => tk(r.paid) },
            { label: 'Due', align: 'right', render: (r) => (r.amount - r.paid > 0 ? <b className="t-warn">{tk(r.amount - r.paid)}</b> : <b className="t-muted">Paid</b>) },
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
                <span className="amt">{tk(p.amount)}</span>
              </div>
            )
          })}
          {!led.payments.length && <Empty>No payments made yet.</Empty>}
        </div>
      </Card>
    </div>
  )
}
