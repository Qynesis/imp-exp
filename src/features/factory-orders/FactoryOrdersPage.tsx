import { useMemo, useState } from 'react'
import { byId, ESTIMATE_STATUS, factoryRows, fdate, fmt, foCalc, tk } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Pill, Segmented, useSheets } from '@/ui'
import { AddFactorySheet } from './sheets/AddFactorySheet'
import { FactoryDetailSheet } from './sheets/FactoryDetailSheet'
import { ESTIMATE_TONE } from './estimateTone'
import { EstimateDetailSheet } from './sheets/EstimateDetailSheet'
import { NewFactoryOrderSheet } from './sheets/NewFactoryOrderSheet'

type Filter = 'all' | '1' | '2'
type Stage = 'open' | 'done' | 'all'
type View = 'orders' | 'estimates' | 'factories'

export function FactoryOrdersPage() {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const [filter, setFilter] = useState<Filter>('all')
  const [stage, setStage] = useState<Stage>('open')
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('orders')
  const estimates = db.estimates || []
  const waiting = estimates.filter((e) => e.status === 'sent' || e.status === 'approved').length
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.factoryOrders
      .map((o) => ({ ...o, c: foCalc(db, o) }))
      // a lot is open until it has all arrived and nothing is owed either way
      .map((o) => ({ ...o, open: o.c.pending > 0 || Math.abs(o.c.balance) > 0.5 || o.c.unbilled > 0.5 }))
      .filter((o) => (filter === 'all' || String(o.type) === filter) && (stage === 'all' || (stage === 'open') === o.open))
      .filter((o) => !needle || `${o.id} ${o.c.factory?.name} ${o.c.product?.name}`.toLowerCase().includes(needle))
  }, [db, filter, stage, q])
  const openCount = db.factoryOrders.filter((o) => { const c = foCalc(db, o); return c.pending > 0 || Math.abs(c.balance) > 0.5 || c.unbilled > 0.5 }).length
  return (
    <>
      <PageHead title="Factory orders" sub="Every order placed with a factory, what has arrived and what is still due." actions={
        <>
          <Button icon="plus" variant="secondary" onClick={() => sheets.open(AddFactorySheet, {})}>Add factory</Button>
          <Button icon="receipt" variant="secondary" onClick={() => sheets.open(NewFactoryOrderSheet, { mode: 'estimate' })}>New estimate</Button>
          <Button icon="factory" onClick={() => sheets.open(NewFactoryOrderSheet, {})}>New factory order</Button>
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
      <Segmented<View> label="Orders or estimates" value={view} onChange={setView} options={[
        { value: 'orders', label: `Orders (${db.factoryOrders.length})` },
        { value: 'estimates', label: `Estimates${waiting ? ` (${waiting} waiting)` : ` (${estimates.length})`}` },
        { value: 'factories', label: `Factories (${db.factories.filter((f) => !f.archived).length})` },
      ]} />
      {view === 'factories' ? <FactoriesList /> : view === 'orders' ? (
        <Card>
          <div className="card-body tools-row">
            <Segmented<Stage> label="Order stage" value={stage} onChange={setStage} options={[
              { value: 'open', label: `Open (${openCount})` },
              { value: 'done', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]} />
            <div className="tools-right">
              <select className="in narrow-select" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Order type">
                <option value="all">Both types</option>
                <option value="1">Type 1 · raw material supplied</option>
                <option value="2">Type 2 · direct order</option>
              </select>
              <input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, factory or product" aria-label="Search orders" />
            </div>
          </div>
          <DataTable
              pageSize={25}
            rows={rows}
            onRow={(r) => go('factory-orders/' + r.id)}
            empty={db.factoryOrders.length ? 'No order matches.' : 'No factory orders yet. Place the first one with New factory order, or start with an estimate.'}
            columns={[
              { label: 'Order', primary: true, render: (r) => <span className="order-id">{r.id}</span> },
              { label: 'Factory', render: (r) => r.c.factory?.name },
              { label: 'Product', render: (r) => r.c.product?.name },
              { label: 'Type', render: (r) => <span className="t-muted">{r.c.typeLabel}</span> },
              { label: 'Ordered', align: 'right', render: (r) => `${fmt(r.qty)} ${r.c.unit}` },
              { label: 'Received', align: 'right', render: (r) => <span className="two-line right"><span>{fmt(r.c.received)} of {fmt(r.qty)}</span><span className="mini-progress"><span style={{ width: `${r.c.pct}%` }} /></span></span> },
              { label: 'Pending', align: 'right', render: (r) => <b className={r.c.pending > 0 ? 't-warn' : 't-muted'}>{fmt(r.c.pending)}</b> },
              { label: 'Money balance', align: 'right', render: (r) => (see.cost ? <span className={`t-${r.c.balanceTone}`}>{r.c.balanceText}</span> : <Hidden />) },
              { label: 'Status', render: (r) => <Pill tone={r.c.tone}>{r.c.status}</Pill> },
            ]}
          />
        </Card>
      ) : (
        <Card icon="receipt" title="Estimates" sub="Proposals sent to factories. Once a factory approves, confirm it and it becomes an order.">
          <DataTable pageSize={25} rows={estimates} rowKey={(e) => e.id} onRow={(e) => sheets.open(EstimateDetailSheet, { estimateId: e.id })}
            empty="No estimates yet. Use New estimate to prepare one and send it to the factory."
            columns={[
              { label: 'Estimate', primary: true, render: (e) => <span className="two-line"><b>{e.id}</b><small>{fdate(e.date)}</small></span> },
              { label: 'Factory', render: (e) => byId(db.factories, e.factoryId)?.name },
              { label: 'Product', render: (e) => byId(db.products, e.productId)?.name },
              { label: 'Quantity', align: 'right', render: (e) => `${fmt(e.qty)} ${byId(db.products, e.productId)?.unit || ''}` },
              { label: 'Value', align: 'right', render: (e) => (see.cost ? tk(e.qty * e.rate) : <Hidden />) },
              { label: 'Status', render: (e) => <span className="two-line"><Pill tone={ESTIMATE_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Pill>{e.orderId && <small className="t-muted">{e.orderId}</small>}</span> },
            ]} />
        </Card>
      )}
    </>
  )
}

/** Every factory we work with: what they make for us, open orders, and where the money stands. */
function FactoriesList() {
  const { db } = useBooks()
  const sheets = useSheets()
  const see = useSee()
  const [q, setQ] = useState('')
  const [showOld, setShowOld] = useState(false)
  const rows = factoryRows(db).filter((r) => (showOld || !r.factory.archived) && (!q || `${r.factory.name} ${r.factory.contact} ${r.factory.makes} ${r.products.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <Card icon="factory" title="Factories" sub="Tap a factory for its details, orders and balance."
      action={<Button size="sm" icon="plus" onClick={() => sheets.open(AddFactorySheet, {})}>Add factory</Button>}>
      <div className="card-body tools-row">
        <label className="check"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show factories not in use</label>
        <div className="tools-right"><input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Factory, person or product" aria-label="Search factories" /></div>
      </div>
      <DataTable rows={rows} rowKey={(r) => r.factory.id} pageSize={20} onRow={(r) => sheets.open(FactoryDetailSheet, { factoryId: r.factory.id })}
        empty="No factories yet. Add the factories that make goods for you."
        columns={[
          { label: 'Factory', primary: true, render: (r) => <span className="two-line"><b>{r.factory.name}{r.factory.archived ? ' (not in use)' : ''}</b><small className="t-muted">{[r.factory.contact, r.factory.phone].filter(Boolean).join(' · ')}</small></span> },
          { label: 'Makes for us', render: (r) => <span className="t-muted">{r.products.join(', ') || r.factory.makes || '—'}</span> },
          { label: 'Orders', align: 'right', render: (r) => <span className="two-line right"><b>{r.orders}</b>{r.open > 0 && <small className="t-warn">{r.open} open</small>}</span> },
          { label: 'Still to come', align: 'right', render: (r) => (r.pendingQty ? r.pendingQty.toLocaleString('en-IN') : '—') },
          { label: 'Balance', align: 'right', render: (r) => (!see.cost ? <Hidden /> : r.balance < -0.5 ? <b className="t-warn">We owe {tk(-r.balance)}</b> : r.balance > 0.5 ? <span className="t-good">Advance {tk(r.balance)}</span> : <span className="t-muted">Settled</span>) },
        ]} />
    </Card>
  )
}
