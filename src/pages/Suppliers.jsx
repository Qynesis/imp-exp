import { useState } from 'react'
import { CustomView } from '../custom.jsx'
import { fdate, tk } from '../lib/format.js'
import { byId, supplierLedger } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Empty, cls, go, useSheets } from '../ui.jsx'
import { PageHead } from './common.jsx'

export default function Suppliers({ id }) {
  const { db } = useStore()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const list = db.suppliers.map((s) => supplierLedger(db, s.id))
    .filter((l) => (l.supplier.name + ' ' + l.supplier.goods).toLowerCase().includes(q.trim().toLowerCase()))
  const shownId = byId(db.suppliers, id) ? id : db.suppliers[0]?.id
  const led = shownId ? supplierLedger(db, shownId) : null
  const s = led?.supplier

  return (
    <div className={cls('md', id && 'has-detail')}>
      <div className="md-head">
        <PageHead title="Suppliers" sub="Who we buy raw materials and packaging from, on cash or credit."
          actions={<Button onClick={() => sheets.open('addSupplier')}>Add supplier</Button>} />
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

        {led && (
          <div className="md-detail stack">
            <a className="back-link only-mobile" href="#/suppliers">‹ All suppliers</a>
            <Card>
              <div className="card-body">
                <div className="detail-head">
                  <div>
                    <h2 className="h-lg">{s.name}</h2>
                    <p className="t-muted tight">
                      {s.goods || 'No goods listed'} · {s.terms === 'credit' ? `Credit terms: ${s.days} days` : 'Cash terms'}
                      {[s.contact, s.phone, s.address].some(Boolean) && <><br />{[s.contact, s.phone, s.address].filter(Boolean).join(' · ')}</>}
                      <br /><CustomView entity="supplier" record={s} inline />
                    </p>
                  </div>
                  <div className="page-actions">
                    <Button variant="secondary" onClick={() => sheets.open('newPurchase', { supplierId: s.id })}>New purchase</Button>
                    <Button disabled={led.due <= 0} onClick={() => sheets.open('pay', { kind: 'supplier', supplierId: s.id, crumb: 'Suppliers' })}>Pay supplier</Button>
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
                rows={led.bills}
                empty="No purchases from this supplier yet."
                columns={[
                  { label: 'Bill', primary: true, render: (r) => r.billNo },
                  { label: 'Date', render: (r) => (r.date ? fdate(r.date) : '') },
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
                {led.payments.map((p) => (
                  <div key={p.id} className="row">
                    <span className="meta">{fdate(p.date)}</span>
                    <span className="name normal">{p.method} · {p.note || 'Payment'}{p.purchaseId && byId(db.purchases, p.purchaseId) ? ` · ${byId(db.purchases, p.purchaseId).billNo}` : ''}</span>
                    <span className="amt">{tk(p.amount)}</span>
                  </div>
                ))}
                {!led.payments.length && <Empty>No payments made yet.</Empty>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
