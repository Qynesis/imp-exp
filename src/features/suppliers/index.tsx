import { ClipButton } from '@/components/attachments/Attachments'
import { useMemo, useState } from 'react'
import { byId, fdate, fmt, fullAddress, siteLabel, siteStock, supplierLedger, supplyRows, tk } from '@shared/domain'
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
import { Button, Card, DataTable, Empty, Pill, cls, usePaged, useSheets, SearchBox, Segmented } from '@/ui'
import { ConfirmPurchaseSheet } from '@/features/warehouse/sheets/ReceiveSheets'
import { FilterPanel, FilterSelect } from '@/components/filters/Filters'
import { useFilters } from '@/components/filters/filterState'
import { SourceStockTable } from '@/features/warehouse/SourceStockTable'
import { AddSupplierSheet } from './sheets/AddSupplierSheet'
import { NewPurchaseSheet } from './sheets/NewPurchaseSheet'
import { SupplyOverviewSheet } from './sheets/SupplyOverviewSheet'

/** #/suppliers and #/suppliers/<supplier id>: list beside detail on wide screens, one at a time on phones. */
export default function SuppliersPage({ params: [id] }: FeatureRouteProps) {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const f = useFilters({ terms: '', due: '', area: '', item: '', site: '', sort: '' })
  const st = siteStock(db)
  const areas = [...new Set(db.suppliers.map((x) => (x.city || x.area || '').trim()).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))
  const items = db.products.filter((p) => !p.archived && (db.purchases.some((x) => x.productId === p.id) || p.supplierIds?.length)).map((p) => ({ value: p.id, label: p.name }))
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const v = f.v
    const last = (id: string) => db.purchases.filter((x) => x.supplierId === id).map((x) => x.date).sort().pop() || ''
    const out = db.suppliers.map((s) => supplierLedger(db, s.id)).filter((l) => {
      const s = l.supplier
      if (needle && !(s.name + ' ' + s.goods + ' ' + s.contact + ' ' + s.phone + ' ' + fullAddress(s)).toLowerCase().includes(needle)) return false
      if (v.terms && s.terms !== v.terms) return false
      if (v.due === 'owe' && !(l.due > 0)) return false
      if (v.due === 'settled' && l.due > 0) return false
      if (v.area && (s.city || s.area || '').trim() !== v.area) return false
      if (v.item && !db.purchases.some((x) => x.supplierId === s.id && x.productId === v.item) && !byId(db.products, v.item)?.supplierIds?.includes(s.id)) return false
      if (v.site && !db.purchases.some((x) => x.supplierId === s.id && ((x.siteId && st.sites.some((w) => w.id === x.siteId) ? x.siteId : st.mainId) === v.site))) return false
      return true
    })
    if (v.sort === 'due') out.sort((a, b) => b.due - a.due)
    else if (v.sort === 'recent') out.sort((a, b) => (last(a.supplier.id) < last(b.supplier.id) ? 1 : -1))
    else if (v.sort === 'big') out.sort((a, b) => b.purchased - a.purchased)
    else out.sort((a, b) => a.supplier.name.localeCompare(b.supplier.name))
    return out
  }, [db, q, f.v, st])
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
          <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }}
            summary={<span><b>{fmt(list.length)}</b> of {fmt(db.suppliers.length)} suppliers{see.cost && list.length ? <> · we owe <b>{tk(list.reduce((a, l) => a + Math.max(0, l.due), 0))}</b></> : null}</span>}
            main={<SearchBox value={q} onChange={setQ} placeholder="Name, goods, phone or area" wide />}>
            <FilterSelect label="Terms" value={f.v.terms} onChange={(x) => f.set('terms', x)} all="Cash or credit" options={[{ value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit' }]} />
            {see.cost && <FilterSelect label="Dues" value={f.v.due} onChange={(x) => f.set('due', x)} all="Any balance" options={[{ value: 'owe', label: 'We owe them' }, { value: 'settled', label: 'Settled' }]} />}
            <FilterSelect label="City or area" value={f.v.area} onChange={(x) => f.set('area', x)} all="Everywhere" options={areas} />
            <FilterSelect label="Supplies item" value={f.v.item} onChange={(x) => f.set('item', x)} all="Any item" options={items} />
            {st.sites.length > 1 && <FilterSelect label="Delivers to" value={f.v.site} onChange={(x) => f.set('site', x)} all="Any warehouse" options={st.sites.map((w) => ({ value: w.id, label: siteLabel(w) }))} />}
            <FilterSelect label="Sort by" value={f.v.sort} onChange={(x) => f.set('sort', x)} all="Name" options={[...(see.cost ? [{ value: 'due', label: 'Most owed first' }, { value: 'big', label: 'Most bought from' }] : []), { value: 'recent', label: 'Latest delivery' }]} />
          </FilterPanel>
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
            {!list.length && <Empty>{db.suppliers.length ? 'No supplier matches these filters.' : 'No suppliers yet.'}</Empty>}
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
  const [bq, setBq] = useState('')
  const [billShow, setBillShow] = useState<'all' | 'due' | 'paid' | 'waiting'>('all')
  const bills = led.bills.filter((r) => (billShow === 'all' || (billShow === 'waiting' ? !!byId(db.purchases, r.id)?.pending : billShow === 'due' ? r.amount - r.paid > 0 : r.amount - r.paid <= 0)) && (!bq.trim() || `${r.billNo} ${r.items}`.toLowerCase().includes(bq.trim().toLowerCase())))
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
      <Card icon="layers" title="Their goods in our warehouses" sub="How much came from them into each warehouse, and how much of each item we hold now.">
        <SourceStockTable kind="supplier" id={s.id} name={s.name} />
      </Card>
      <Card title="Purchases" action={<SearchBox value={bq} onChange={setBq} placeholder="Bill no. or item" label="Search purchases" />}>
        <div className="card-body pt0 filter-bar">
          <Segmented label="Bills" value={billShow} onChange={setBillShow} options={[{ value: 'all', label: 'All' }, { value: 'waiting', label: 'Waiting for warehouse' }, { value: 'due', label: 'With dues' }, { value: 'paid', label: 'Paid' }]} />
        </div>
        <DataTable
            pageSize={25}
          exportName={`purchases-${s.name.toLowerCase().replace(/\W+/g, '-')}`}
          rows={bills}
          empty="No purchases from this supplier yet."
          columns={[
            { label: 'Bill', primary: true, render: (r) => r.billNo },
            { label: 'Date', render: (r) => fdate(r.date) },
            { label: 'Items', render: (r) => r.items },
            { label: 'Terms', render: (r) => (r.terms === 'cash' ? 'Cash' : 'Credit') },
            { label: 'Goods', render: (r) => {
              const x = byId(db.purchases, r.id)
              if (!x) return ''
              if (x.pending) return <button type="button" className="link" onClick={() => sheets.open(ConfirmPurchaseSheet, { purchaseId: x.id })}><Pill tone="warn">Waiting for warehouse</Pill></button>
              return <span className="two-line"><Pill tone={x.recv?.short ? 'warn' : 'good'}>{x.recv?.short ? `${fmt(x.recv.short)} short` : 'Received'}</Pill>{x.recv && <small className="t-muted">{fdate(x.recv.date)} · {x.recv.by}</small>}</span>
            } },
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
