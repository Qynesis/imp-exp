import { useMemo, useState } from 'react'
import { byId, expectedIn, fdate, fmt, fullAddress, inboundLog, siteStock, siteSummaries, sourceDirectory, SOURCE_KINDS, thisMonth, tk, todayISO, type Incoming, type InboundRow, type SourceKind, type SourceRow } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { useAccess } from '@/app/useAccess'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { PhoneLink } from '@/components/PhoneLink'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { AddFactorySheet } from '@/features/factory-orders/sheets/AddFactorySheet'
import { FactoryDetailSheet } from '@/features/factory-orders/sheets/FactoryDetailSheet'
import { ReceiveShipmentSheet } from '@/features/factory-orders/sheets/ReceiveShipmentSheet'
import { AddSupplierSheet } from '@/features/suppliers/sheets/AddSupplierSheet'
import { NewPurchaseSheet } from '@/features/suppliers/sheets/NewPurchaseSheet'
import { Button, Card, DataTable, Icon, Pill, Segmented, Stat, useConfirm, useSheets, useToast, SearchBox } from '@/ui'
import { ArriveImportSheet, SiteDetailSheet, TransferSheet } from './sheets/StockSheets'
import { ImportSourceSheet, SupplierSourceSheet } from './sheets/SourceSheets'
import { WarehouseSiteSheet } from './sheets/WarehouseSiteSheet'

type Tab = 'in' | 'log' | 'stock' | 'moves' | 'sources' | 'sites'
const TABS: Tab[] = ['in', 'log', 'stock', 'moves', 'sources', 'sites']
const KIND_TONE: Record<SourceKind, 'info' | 'good' | 'warn' | 'neutral' | 'muted'> = { supplier: 'info', factory: 'good', import: 'warn', return: 'neutral', workshop: 'muted' }

/** #/warehouse[/in|log|sources|sites]: goods coming in from suppliers, factories and imports, where they come from, and our godowns. */
export default function WarehousePage({ params: [t] }: FeatureRouteProps) {
  const { db } = useBooks()
  const { level } = useAccess()
  const sheets = useSheets()
  const tab: Tab = TABS.includes(t as Tab) ? (t as Tab) : 'in'
  const incoming = expectedIn(db)
  const log = inboundLog(db)
  const sources = sourceDirectory(db)
  const month = thisMonth()
  const inMonth = log.filter((r) => r.date.slice(0, 7) === month)
  const sites = db.warehouses || []
  const main = sites.find((w) => w.main)
  const canBuy = level('suppliers') === 'edit'
  return (
    <>
      <PageHead title="Warehouse" sub={main ? `Receiving at ${main.name}${fullAddress(main) ? `, ${fullAddress(main)}` : ''}.` : 'Goods coming in from suppliers, factories and imports, and where each comes from.'}
        actions={
          <>
            {sites.length > 1 && level('warehouse') === 'edit' && <Button icon="truck" variant="secondary" onClick={() => sheets.open(TransferSheet, {})}>Move stock</Button>}
            {canBuy && <Button icon="cart" onClick={() => sheets.open(NewPurchaseSheet, {})}>Receive from supplier</Button>}
          </>
        } />
      <div className="stats">
        <Stat icon="truck" label="On the way" value={fmt(incoming.length)} sub={`${incoming.filter((i) => i.source === 'factory').length} factory · ${incoming.filter((i) => i.source === 'import').length} import`} tone={incoming.some((i) => i.expected && i.expected < todayISO()) ? 'warn' : undefined} href="#/warehouse/in" />
        <Stat icon="box" label="Received this month" value={fmt(inMonth.length)} sub={`${fmt(inMonth.reduce((s, r) => s + r.qty, 0))} units in`} href="#/warehouse/log" />
        <Stat icon="store" label="Sources" value={fmt(sources.length)} sub={`${sources.filter((s) => s.kind === 'supplier').length} suppliers · ${sources.filter((s) => s.kind === 'factory').length} factories · ${sources.filter((s) => s.kind === 'import').length} abroad`} href="#/warehouse/sources" />
        <Stat icon="building" label="Warehouses" value={fmt(sites.length)} sub={main ? `Main: ${main.name}` : 'None added yet'} href="#/warehouse/sites" />
      </div>
      <Segmented<Tab> label="Warehouse section" value={tab} onChange={(x) => go('warehouse/' + x)}
          options={[{ value: 'in', label: `To receive (${incoming.length})` }, { value: 'log', label: 'Received' }, { value: 'stock', label: 'Stock by warehouse' }, { value: 'moves', label: 'Moves' }, { value: 'sources', label: 'Sources' }, { value: 'sites', label: 'Warehouses' }]} />
      {tab === 'in' && <ToReceive rows={incoming} />}
      {tab === 'log' && <ReceivedLog rows={log} />}
      {tab === 'stock' && <StockBySite />}
      {tab === 'moves' && <Moves />}
      {tab === 'sources' && <Sources rows={sources} />}
      {tab === 'sites' && <Sites />}
    </>
  )
}

function ToReceive({ rows }: { rows: Incoming[] }) {
  const { db } = useBooks()
  const { level } = useAccess()
  const sheets = useSheets()
  const today = todayISO()
  const canFactory = level('factory-orders') === 'edit'
  const canImport = level('warehouse') === 'edit' || level('imports') === 'edit'
  const receive = (r: Incoming) => {
    if (r.source === 'factory') {
      if (canFactory) sheets.open(ReceiveShipmentSheet, { orderId: r.ref })
      else go('factory-orders/' + r.ref)
      return
    }
    const s = byId(db.imports, r.ref)
    if (!s) return
    if (!canImport) return go('imports/' + s.id)
    sheets.open(ArriveImportSheet, { importId: s.id })
  }
  return (
    <Card icon="truck" title="To receive" sub="Factory goods still due and imports not yet in. Tap one to receive it.">
      <DataTable rows={rows} rowKey={(r) => r.key} pageSize={15} onRow={receive} empty="Nothing on the way. New factory orders and shipments show up here."
        columns={[
          { label: 'Item', primary: true, render: (r) => { const p = byId(db.products, r.productId); return <span className="two-line"><b>{p?.name || 'Item'}</b><small className="t-muted">{r.ref} · {r.from}</small></span> } },
          { label: 'From', render: (r) => <Pill tone={KIND_TONE[r.source]}>{SOURCE_KINDS[r.source]}</Pill> },
          { label: 'Quantity', align: 'right', render: (r) => <b>{fmt(r.qty)} {byId(db.products, r.productId)?.unit}</b> },
          { label: 'Where it is', render: (r) => <span className="t-muted">{r.status}</span> },
          { label: 'Expected', align: 'right', render: (r) => (r.expected ? <span className={r.expected < today ? 't-warn strong nowrap' : 'nowrap'}>{fdate(r.expected)}{r.expected < today ? ' · late' : ''}</span> : '—') },
          { label: '', align: 'right', render: (r) => <Button variant="secondary" onClick={(e) => { e.stopPropagation(); receive(r) }}>{r.source === 'factory' ? (canFactory ? 'Receive' : 'View') : canImport ? 'Mark arrived' : 'View'}</Button> },
        ]} />
    </Card>
  )
}

function ReceivedLog({ rows }: { rows: InboundRow[] }) {
  const { db } = useBooks()
  const sites = db.warehouses || []
  const [kind, setKind] = useState<'all' | SourceKind>('all')
  const [q, setQ] = useState('')
  const [month, setMonth] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && (!month || r.date.slice(0, 7) === month) && (!n || `${r.productName} ${r.sourceName} ${r.ref}`.toLowerCase().includes(n)))
  }, [rows, kind, q, month])
  const kinds = (Object.keys(SOURCE_KINDS) as SourceKind[]).filter((k) => rows.some((r) => r.kind === k))
  return (
    <Card icon="box" title="Received into the warehouse" sub={`${fmt(shown.length)} entr${shown.length === 1 ? 'y' : 'ies'} · ${fmt(shown.reduce((s, r) => s + r.qty, 0))} units`}>
      <div className="card-body pt0 period-bar filter-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Item, source or bill no." />
        <label className="field"><span className="field-label">Month</span><input className="in" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      </div>
      <div className="card-body pt0">
        <Segmented<'all' | SourceKind> label="Source" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...kinds.map((k) => ({ value: k, label: SOURCE_KINDS[k] }))]} />
      </div>
      <DataTable rows={shown} rowKey={(r) => r.key} pageSize={20} empty="Nothing received matches."
        columns={[
          { label: 'Date', primary: true, render: (r) => <span className="nowrap">{fdate(r.date)}</span> },
          { label: 'Item', render: (r) => <b>{r.productName}</b> },
          { label: 'From', render: (r) => <span className="two-line"><span>{r.sourceName}</span><small><Pill tone={KIND_TONE[r.kind]}>{SOURCE_KINDS[r.kind]}</Pill></small></span> },
          { label: 'Quantity', align: 'right', render: (r) => <b className="nowrap">{fmt(r.qty)} {r.unit}</b> },
          ...(sites.length > 1 ? [{ label: 'Warehouse', render: (r: InboundRow) => <span className="t-muted">{byId(sites, r.siteId)?.name || (r.kind === 'supplier' || r.kind === 'factory' || r.kind === 'import' ? sites.find((w) => w.main)?.name : '') || '—'}</span> }] : []),
          { label: 'Ref', render: (r) => <span className="mono t-muted">{r.ref}</span> },
          { label: 'Note', render: (r) => <span className="t-muted">{r.note}</span> },
        ]} />
    </Card>
  )
}

function Sources({ rows }: { rows: SourceRow[] }) {
  const { level } = useAccess()
  const sheets = useSheets()
  const [kind, setKind] = useState<'all' | SourceRow['kind']>('all')
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && (!n || `${r.name} ${r.contact} ${r.phone} ${r.address} ${r.items.join(' ')}`.toLowerCase().includes(n)))
  }, [rows, kind, q])
  const open = (r: SourceRow) => {
    if (r.kind === 'supplier') sheets.open(SupplierSourceSheet, { supplierId: r.id })
    else if (r.kind === 'factory') sheets.open(FactoryDetailSheet, { factoryId: r.id })
    else sheets.open(ImportSourceSheet, { name: r.name })
  }
  return (
    <Card icon="store" title="Where our goods come from" sub="Local suppliers, factories that make for us, and suppliers abroad we import from — with their address and contact."
      action={
        <div className="page-actions">
          {level('suppliers') === 'edit' && <Button variant="secondary" icon="plus" onClick={() => sheets.open(AddSupplierSheet, {})}>Supplier</Button>}
          {level('factory-orders') === 'edit' && <Button variant="secondary" icon="plus" onClick={() => sheets.open(AddFactorySheet, {})}>Factory</Button>}
        </div>
      }>
      <div className="card-body pt0 period-bar filter-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Name, area, phone or item" />
        <Segmented<'all' | SourceRow['kind']> label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'supplier', label: 'Suppliers' }, { value: 'factory', label: 'Factories' }, { value: 'import', label: 'Abroad' }]} />
      </div>
      <DataTable rows={shown} rowKey={(r) => r.kind + r.id} pageSize={15} onRow={open} empty="No source matches."
        columns={[
          { label: 'Source', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small className="t-muted">{r.contact}{r.contact && r.phone ? ' · ' : ''}{r.phone && <PhoneLink phone={r.phone} label={r.name} />}</small></span> },
          { label: 'Kind', render: (r) => <Pill tone={KIND_TONE[r.kind]}>{r.kind === 'import' ? 'Abroad' : SOURCE_KINDS[r.kind]}</Pill> },
          { label: 'Address', render: (r) => <span className="t-muted">{r.address || 'No address yet'}</span> },
          { label: 'Sends us', render: (r) => r.items.slice(0, 3).join(', ') + (r.items.length > 3 ? ` +${r.items.length - 3}` : '') || <span className="t-muted">—</span> },
          { label: 'Deliveries', align: 'right', render: (r) => <span className="two-line"><b>{r.deliveries}</b><small className="t-muted">{r.lastDate ? `last ${fdate(r.lastDate)}` : 'none yet'}</small></span> },
          { label: 'On the way', align: 'right', render: (r) => (r.pending > 0 ? <b className="t-warn">{fmt(r.pending)}</b> : '—') },
        ]} />
    </Card>
  )
}

function Sites() {
  const { db } = useBooks()
  const { level } = useAccess()
  const see = useSee()
  const sheets = useSheets()
  const list = siteSummaries(db)
  const canEdit = level('warehouse') === 'edit' && !accessGuard.readonly
  return (
    <Card icon="building" title="Our warehouses and godowns" sub="Tap a warehouse for its stock, receipts and moves. Edit, make main or remove it from there."
      action={canEdit && <Button icon="plus" onClick={() => sheets.open(WarehouseSiteSheet, {})}>Add warehouse</Button>}>
      {!list.length && <p className="t-muted card-body">No warehouse added yet. Add your godown so receipts, challans and stock show where goods are.</p>}
      <div className="site-grid">
        {list.map((x) => (
          <article key={x.site.id} className={'site-card' + (x.site.main ? ' is-main' : '')}>
            <button type="button" className="site-main" onClick={() => sheets.open(SiteDetailSheet, { siteId: x.site.id })}>
              <span className="site-top"><span className="site-ic"><Icon name="building" size={20} /></span><b>{x.site.name}</b>{x.site.main && <Pill tone="good">Main</Pill>}</span>
              <span className="site-addr"><Icon name="pin" size={14} />{fullAddress(x.site) || 'No address yet'}</span>
              <span className="site-stats">
                <span><b>{x.items.length}</b>items</span>
                <span><b>{fmt(x.units)}</b>units</span>
                <span><b>{see.cost ? tk(x.value) : <Hidden />}</b>value</span>
              </span>
              <span className="site-foot t-muted">{x.site.manager ? `${x.site.manager}${x.site.phone ? ` · ${x.site.phone}` : ''}` : 'No one in charge set'}{x.site.capacity ? ` · holds ${x.site.capacity}` : ''}</span>
            </button>
            {canEdit && (
              <div className="site-actions">
                <Button size="sm" variant="secondary" icon="edit" onClick={() => sheets.open(WarehouseSiteSheet, { siteId: x.site.id })}>Edit</Button>
                {list.length > 1 && <Button size="sm" variant="secondary" icon="truck" onClick={() => sheets.open(TransferSheet, { from: x.site.id })}>Move stock</Button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </Card>
  )
}

/** Every item and how much of it is in each warehouse. */
function StockBySite() {
  const { db } = useBooks()
  const sheets = useSheets()
  const { level } = useAccess()
  const st = siteStock(db)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'low'>('all')
  const canMove = st.sites.length > 1 && level('warehouse') === 'edit' && !accessGuard.readonly
  const rows = db.products.filter((p) => !p.archived && (!q.trim() || `${p.name} ${p.code}`.toLowerCase().includes(q.trim().toLowerCase())) && (only === 'all' || (p.lowAt > 0 && p.stock <= p.lowAt)))
  if (!st.sites.length) return <Card icon="layers" title="Stock by warehouse"><p className="t-muted card-body">Add your warehouses under the Warehouses tab to see stock in each one.</p></Card>
  return (
    <Card icon="layers" title="Stock by warehouse" sub="Goods received into a warehouse or moved there stay there; sales and deliveries go out from the main one.">
      <div className="card-body pt0 period-bar filter-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Item name or code" />
        <Segmented label="Show" value={only} onChange={setOnly} options={[{ value: 'all', label: 'All items' }, { value: 'low', label: 'Low stock' }]} />
      </div>
      <DataTable rows={rows} rowKey={(p) => p.id} pageSize={20} empty="No item matches."
        columns={[
          { label: 'Item', primary: true, render: (p) => <span className="two-line"><b>{p.name}</b><small className="t-muted">{p.code}</small></span> },
          ...st.sites.map((w) => ({ label: w.name, align: 'right' as const, render: (p: (typeof rows)[number]) => { const n = st.qty.get(p.id)?.[w.id] || 0; return <span className={n < 0 ? 't-warn' : n === 0 ? 't-muted' : undefined}>{fmt(n)}</span> } })),
          { label: 'Total', align: 'right', render: (p) => <b className={p.lowAt > 0 && p.stock <= p.lowAt ? 't-warn' : undefined}>{fmt(p.stock)} {p.unit}</b> },
          ...(canMove ? [{ label: '', align: 'right' as const, render: (p: (typeof rows)[number]) => (p.stock > 0 ? <Button size="sm" variant="secondary" onClick={() => sheets.open(TransferSheet, { productId: p.id, from: st.sites.find((w) => (st.qty.get(p.id)?.[w.id] || 0) > 0)?.id })}>Move</Button> : null) }] : []),
        ]} />
    </Card>
  )
}

/** Goods moved between warehouses. A move can be undone while the goods are still where they went. */
function Moves() {
  const { db, act } = useBooks()
  const { level } = useAccess()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const name = (id: string) => byId(db.warehouses || [], id)?.name || 'Removed warehouse'
  const list = [...(db.stockTransfers || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts))
  const canEdit = level('warehouse') === 'edit' && !accessGuard.readonly
  return (
    <Card icon="truck" title="Moves between warehouses" sub={`${list.length} move${list.length === 1 ? '' : 's'}`}
      action={canEdit && (db.warehouses || []).length > 1 && <Button icon="plus" onClick={() => sheets.open(TransferSheet, {})}>Move stock</Button>}>
      <DataTable rows={list} rowKey={(t) => t.id} pageSize={20} empty={(db.warehouses || []).length > 1 ? 'No goods moved yet.' : 'Add a second warehouse to move goods between them.'}
        columns={[
          { label: 'Move', primary: true, render: (t) => <span className="two-line"><b>{t.id}</b><small className="t-muted">{fdate(t.date)}{t.by ? ` · ${t.by}` : ''}</small></span> },
          { label: 'From → to', render: (t) => <span className="nowrap">{name(t.from)} <Icon name="arrowRight" size={13} /> {name(t.to)}</span> },
          { label: 'Goods', render: (t) => t.lines.map((l) => `${fmt(l.qty)} ${byId(db.products, l.productId)?.unit || ''} ${byId(db.products, l.productId)?.name || ''}`).join(', ') },
          { label: 'Note', render: (t) => <span className="t-muted">{t.note}</span> },
          ...(canEdit ? [{ label: '', align: 'right' as const, render: (t: (typeof list)[number]) => (
            <Button size="sm" variant="secondary" icon="undo" onClick={async () => {
              if (await confirm({ title: `Undo ${t.id}?`, message: `The goods count back in ${name(t.from)}.`, confirmLabel: 'Undo move' })) {
                const why = act('cancelTransfer', t.id)
                toast(why || 'Move undone')
              }
            }}>Undo</Button>
          ) }] : []),
        ]} />
    </Card>
  )
}
