import { useState } from 'react'
import { byId, fdate, fmt, fshort, hasSampleDelivery, invoiceDelivery, todayISO, lastNDays, loadingList, pendingDeliveries, returnsBetween, tk, type Delivery, type Invoice } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { BarList } from '@/components/charts/BarList'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { BookCourierSheet } from '@/features/courier/BookCourierSheet'
import { ViewInvoiceSheet } from '@/features/sales/sheets/ViewInvoiceSheet'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Card, DataTable, Pill, Segmented, Stat, useConfirm, usePrint, useSheets, useToast, SearchBox } from '@/ui'
import { DeliveryChallan } from './DeliveryChallan'
import { CloseRestSheet } from './sheets/CloseRestSheet'
import { DeliverSheet } from './sheets/DeliverSheet'
import { ReturnSheet } from './sheets/ReturnSheet'

type Tab = 'pending' | 'delivered' | 'returns'
const TABS: Tab[] = ['pending', 'delivered', 'returns']
const VIA: Record<string, string> = { own: 'Our vehicle', courier: 'Courier', hired: 'Hired transport', pickup: 'Collected' }

/** #/deliveries: bills waiting for goods, what went out, and what came back. */
export default function DeliveriesPage({ params: [tabParam] }: FeatureRouteProps) {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const samples = hasSampleDelivery(db)
  const loadSamples = () => {
    if (!act('loadSampleDelivery', { today: todayISO() })) toast('Sample bills, deliveries and returns loaded for “Sample Dealer (test)”')
  }
  const removeSamples = async () => {
    if (!(await confirm({ title: 'Remove the sample data?', message: 'The sample dealer and its bills, deliveries and returns are removed. Your real records are not touched.', confirmLabel: 'Remove samples', destructive: true }))) return
    if (!act('removeSampleDelivery', {})) toast('Sample data removed')
  }
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'pending'
  const pending = pendingDeliveries(db)
  const partial = pending.filter((x) => x.d.status === 'partial').length
  const [from, to] = lastNDays(30)
  const ret = returnsBetween(db, from, to)
  const late = pending.filter((x) => x.d.waitingDays > 3).length
  return (
    <>
      <PageHead title="Delivery" sub="Bills wait here until the goods go. Deliver all or part, and record anything that comes back." actions={
        <>
          {samples
            ? <Button variant="ghost" icon="trash" className="edit-only" onClick={() => void removeSamples()}>Remove sample data</Button>
            : <Button variant="ghost" icon="box" className="edit-only" onClick={loadSamples}>Load sample data</Button>}
          <Button variant="secondary" icon="undo" onClick={() => sheets.open(ReturnSheet, {})}>Record a return</Button>
          <Button icon="plus" onClick={() => go('sell')}>New sale</Button>
        </>
      } />
      <div className="stats">
        <Stat icon="clock" label="Waiting for delivery" value={fmt(pending.length)} tone={late ? 'warn' : undefined} sub={pending.length ? `${fmt(pending.reduce((s, x) => s + x.d.remainingUnits, 0))} units · ${late} waiting over 3 days` : 'Everything billed has gone'} />
        <Stat icon="truck" label="Part delivered" value={fmt(partial)} sub="Some goods gone, the rest pending" />
        <Stat icon="check" label="Delivered, last 30 days" value={fmt((db.deliveries || []).filter((x) => x.date >= from).length)} sub="Deliveries recorded" />
        <Stat icon="undo" label="Returns, last 30 days" value={tk(ret.credit)} tone={ret.count ? 'warn' : undefined} sub={`${fmt(ret.count)} returns · ${fmt(ret.units)} units`} />
      </div>
      {samples && (
        <div className="alert-strip info" role="status">
          <div><b>Sample data is loaded</b><span>Bills marked SAMPLE belong to “Sample Dealer (test)”. Try delivering, closing and returning them: they never change stock, sales, cash or dues.</span></div>
          <button type="button" className="link edit-only" onClick={() => void removeSamples()}>Remove</button>
        </div>
      )}
      <Segmented<Tab> label="Delivery section" value={tab} onChange={(t) => go(t === 'pending' ? 'deliveries' : 'deliveries/' + t)} options={[
        { value: 'pending', label: `Pending (${pending.length})` }, { value: 'delivered', label: 'Delivered' }, { value: 'returns', label: `Returns (${(db.returns || []).length})` },
      ]} />
      {tab === 'pending' && <PendingTab rows={pending} open={(inv) => sheets.open(ViewInvoiceSheet, { invoiceId: inv.id })} onSample={samples ? undefined : loadSamples} />}
      {tab === 'delivered' && <DeliveredTab />}
      {tab === 'returns' && <ReturnsTab />}
    </>
  )
}

function PendingTab({ rows: all, open, onSample }: { rows: ReturnType<typeof pendingDeliveries>; open: (inv: Invoice) => void; onSample?: () => void }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const rows = n ? all.filter((x) => `${x.inv.id} ${byId(db.dealers, x.inv.dealerId)?.name || ''}`.toLowerCase().includes(n)) : all
  const load = loadingList(db)
  return (
    <div className="stack">
    {load.length > 0 && (
      <Card icon="box" title="Loading list" sub="Everything still to go across the waiting bills, against what the warehouse holds.">
        <div className="rows loading-list">
          {load.map((x) => (
            <div key={x.productId} className="row">
              <span className="name">{x.name}</span>
              <span className={'meta' + (x.qty > x.stock ? ' t-warn' : '')}>{fmt(x.stock)} {x.unit} in the warehouse{x.qty > x.stock ? ` · short by ${fmt(x.qty - x.stock)}` : ''}</span>
              <span className="amt">{fmt(x.qty)} {x.unit}<small className="t-muted">on {x.bills} bill{x.bills === 1 ? '' : 's'}</small></span>
            </div>
          ))}
        </div>
      </Card>
    )}
    {!all.length && onSample && (
      <div className="next-step"><span>Nothing is waiting. Load sample data to see pending, part-delivered, closed and returned bills.</span><Button size="sm" icon="box" className="edit-only" onClick={onSample}>Load sample data</Button></div>
    )}
    <Card icon="clock" title="Waiting for delivery" sub="Oldest first. Stock is still in the warehouse for these; it is held for them."
      action={<SearchBox value={q} onChange={setQ} placeholder="Bill no. or dealer" label="Search waiting bills" />}>
      <DataTable pageSize={25} rows={rows} rowKey={(x) => x.inv.id} onRow={(x) => open(x.inv)}
        empty="Nothing waiting. Every bill has been delivered."
        columns={[
          { label: 'Bill', primary: true, render: (x) => <span className="two-line"><b>{x.inv.id}{x.inv.sample && <span className="test-tag">sample</span>}</b><small>{fdate(x.inv.date)}{x.d.waitingDays ? ` · ${x.d.waitingDays} days waiting` : ' · today'}</small></span> },
          { label: 'Dealer', render: (x) => <span className="two-line"><span>{byId(db.dealers, x.inv.dealerId)?.name}</span><small className="t-muted">{byId(db.dealers, x.inv.dealerId)?.area}</small></span> },
          { label: 'Still to go', render: (x) => <span className="t-muted">{x.d.lines.filter((l) => l.remaining > 0).map((l) => `${fmt(l.remaining)} ${l.unit} ${l.name}`).join(', ')}</span> },
          { label: 'Status', render: (x) => <Pill tone={x.d.status === 'partial' ? 'info' : x.d.waitingDays > 3 ? 'warn' : 'neutral'}>{x.d.status === 'partial' ? 'Part delivered' : 'Pending'}</Pill> },
          { label: '', align: 'right', render: (x) => (
            <span className="row-actions edit-only" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" icon="check" onClick={() => sheets.open(DeliverSheet, { invoiceId: x.inv.id })}>Deliver</Button>
              <Button size="sm" variant="secondary" icon="truck" onClick={() => sheets.open(TripSheet, { purpose: 'delivery', dealerId: x.inv.dealerId, invoiceId: x.inv.id })}>Trip</Button>
              <Button size="sm" variant="secondary" icon="parcel" onClick={() => sheets.open(BookCourierSheet, { invoiceId: x.inv.id })}>Courier</Button>
              <Button size="sm" variant="ghost" icon="close" onClick={() => sheets.open(CloseRestSheet, { invoiceId: x.inv.id })}>Close rest</Button>
            </span>
          ) },
        ]} />
    </Card>
    </div>
  )
}

function DeliveredTab() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const print = usePrint()
  const confirm = useConfirm()
  const toast = useToast()
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const rows = [...(db.deliveries || [])].reverse().filter((x) => !n || `${x.id} ${x.invoiceId} ${byId(db.dealers, x.dealerId)?.name || ''} ${x.receivedBy || ''}`.toLowerCase().includes(n))
  const undo = async (x: Delivery) => {
    const ok = await confirm({ title: x.cancelled ? `Reopen the closed rest of ${x.invoiceId}?` : `Undo delivery ${x.id}?`, message: x.cancelled ? 'The bill waits for these goods again, and any credit given is taken back.' : 'The goods go back into stock and the bill waits for them again.', confirmLabel: 'Undo', destructive: true })
    if (!ok) return
    const refused = act('undoDelivery', x.id)
    if (!refused) toast(x.cancelled ? `${x.invoiceId} reopened` : `${x.id} undone, goods back in stock`)
  }
  return (
    <Card icon="check" title="Deliveries" sub="Every handover, newest first. Stock left the warehouse on these dates."
      action={<SearchBox value={q} onChange={setQ} placeholder="Bill, delivery or dealer" label="Search deliveries" />}>
      <DataTable pageSize={25} rows={rows} rowKey={(x) => x.id} onRow={(x) => sheets.open(ViewInvoiceSheet, { invoiceId: x.invoiceId })}
        empty="No deliveries recorded yet."
        columns={[
          { label: 'Delivery', primary: true, render: (x) => <span className="two-line"><b>{x.invoiceId}{x.sample && <span className="test-tag">sample</span>}</b><small>{fdate(x.date)} · {x.id}</small></span> },
          { label: 'Dealer', render: (x) => byId(db.dealers, x.dealerId)?.name },
          { label: 'Goods', render: (x) => <span className="t-muted">{x.lines.map((l) => `${fmt(l.qty)} ${byId(db.products, l.productId)?.unit || ''} ${byId(db.products, l.productId)?.name || ''}`).join(', ')}</span> },
          { label: 'How', render: (x) => (x.cancelled
            ? <span className="two-line"><Pill tone="muted">Closed, not delivered</Pill>{x.note && <small className="t-muted">{x.note}{x.credit ? ` · ${tk(x.credit)} credited` : ''}</small>}</span>
            : <span className="two-line"><span>{VIA[x.via] || x.via}</span>{x.receivedBy && <small className="t-muted">Received by {x.receivedBy}</small>}</span>) },
          { label: 'Bill', align: 'right', render: (x) => { const inv = byId(db.invoices, x.invoiceId); const st = inv ? invoiceDelivery(db, inv).status : 'delivered'; return <Pill tone={st === 'delivered' ? 'good' : 'info'}>{st === 'delivered' ? 'Complete' : 'Part delivered'}</Pill> } },
          { label: '', align: 'right', render: (x) => (
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              {!x.cancelled && <Button size="sm" variant="secondary" icon="print" onClick={() => print(<DeliveryChallan db={db} x={x} />)}>Challan</Button>}
              <Button size="sm" variant="ghost" icon="undo" className="edit-only" onClick={() => void undo(x)}>Undo</Button>
            </span>
          ) },
        ]} />
    </Card>
  )
}

function ReturnsTab() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [days, setDays] = useState<'30' | '90' | '365'>('90')
  const [from, to] = lastNDays(Number(days))
  const sum = returnsBetween(db, from, to)
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const rows = (db.returns || []).filter((r) => r.date >= from && (!n || `${r.id} ${r.invoiceId} ${byId(db.dealers, r.dealerId)?.name || ''} ${r.reason}`.toLowerCase().includes(n))).slice().reverse()
  return (
    <div className="stack">
      <div className="grid2">
        <Card icon="users" title="Returns by dealer" sub={`Last ${days} days`}
          action={<Segmented<'30' | '90' | '365'> label="Period" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} />}>
          <BarList share="of returns" format={tk} empty="No returns in this period." rows={sum.byDealer.map((d) => ({ id: d.id, name: d.name, value: d.credit, note: `${fmt(d.units)} units · ${d.count} return${d.count === 1 ? '' : 's'}` }))} />
        </Card>
        <Card icon="box" title="Returned products" sub={sum.byReason.length ? `Most common reason: ${sum.byReason[0].reason}` : `Last ${days} days`}>
          <BarList share="of units returned" format={(n) => fmt(n)} empty="No returns in this period." rows={sum.byProduct.map((p) => ({ id: p.id, name: p.name, value: p.units, note: `${p.unit} · ${tk(p.credit)}` }))} />
        </Card>
      </div>
      <Card icon="undo" title="Every return" action={<div className="tools-right"><SearchBox value={q} onChange={setQ} placeholder="Bill, dealer or reason" label="Search returns" /><Button size="sm" icon="undo" className="edit-only" onClick={() => sheets.open(ReturnSheet, {})}>Record a return</Button></div>}>
        <DataTable pageSize={25} rows={rows} rowKey={(r) => r.id} onRow={(r) => sheets.open(ViewInvoiceSheet, { invoiceId: r.invoiceId })}
          empty="No returns in this period."
          columns={[
            { label: 'Return', primary: true, render: (r) => <span className="two-line"><b>{byId(db.dealers, r.dealerId)?.name}{r.sample && <span className="test-tag">sample</span>}</b><small>{fshort(r.date)} · {r.invoiceId}</small></span> },
            { label: 'Goods', render: (r) => <span className="t-muted">{r.lines.map((l) => `${fmt(l.qty)} ${byId(db.products, l.productId)?.unit || ''} ${byId(db.products, l.productId)?.name || ''}`).join(', ')}</span> },
            { label: 'Reason', render: (r) => <span className="two-line"><span>{r.reason}</span>{r.note && <small className="t-muted">{r.note}</small>}</span> },
            { label: 'Condition', render: (r) => <Pill tone={r.condition === 'restock' ? 'good' : 'warn'}>{r.condition === 'restock' ? 'Back in stock' : 'Damaged'}</Pill> },
            { label: 'Credit', align: 'right', render: (r) => (r.credit ? <b>{tk(r.credit)}</b> : <span className="t-muted">None</span>) },
          ]} />
      </Card>
    </div>
  )
}
