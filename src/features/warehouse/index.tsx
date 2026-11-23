import { useMemo, useState } from 'react'
import { addDays, byId, expectedIn, fdate, fmonth, fmt, fullAddress, inboundLog, siteLabel, siteStock, siteSummaries, sourceDirectory, sourceStock, SOURCE_KINDS, thisMonth, tk, todayISO, type Incoming, type InboundRow, type SourceKind, type SourceRow } from '@shared/domain'
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
import { ConfirmPurchaseSheet, PickFactoryOrderSheet } from './sheets/ReceiveSheets'
import { useReceiveAccess } from './receiveAccess'
import { FilterDates, FilterPanel, FilterSelect } from '@/components/filters/Filters'
import { useFilters } from '@/components/filters/filterState'

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
  const rx = useReceiveAccess()
  const waiting = incoming.filter((i) => i.source === 'supplier')
  return (
    <>
      <PageHead title="Warehouse" sub={main ? `Receiving at ${main.name}${fullAddress(main) ? `, ${fullAddress(main)}` : ''}.` : 'Goods coming in from suppliers, factories and imports, and where each comes from.'}
        actions={
          <>
            {sites.length > 1 && level('warehouse') === 'edit' && <Button icon="truck" variant="secondary" onClick={() => sheets.open(TransferSheet, {})}>Move stock</Button>}
            {rx.can && <Button icon="factory" variant="secondary" onClick={() => sheets.open(PickFactoryOrderSheet, {})}>Receive from factory</Button>}
            {canBuy && <Button icon="cart" onClick={() => sheets.open(NewPurchaseSheet, { inNow: rx.can })}>Receive from supplier</Button>}
          </>
        } />
      <div className="stats">
        <Stat icon="truck" label="On the way" value={fmt(incoming.length)} sub={`${waiting.length} supplier · ${incoming.filter((i) => i.source === 'factory').length} factory · ${incoming.filter((i) => i.source === 'import').length} import`} tone={incoming.some((i) => i.expected && i.expected < todayISO()) ? 'warn' : undefined} href="#/warehouse/in" />
        <Stat icon="box" label="Received this month" value={fmt(inMonth.length)} sub={`${fmt(inMonth.reduce((s, r) => s + r.qty, 0))} units in`} href="#/warehouse/log" />
        <Stat icon="store" label="Sources" value={fmt(sources.length)} sub={`${sources.filter((s) => s.kind === 'supplier').length} suppliers · ${sources.filter((s) => s.kind === 'factory').length} factories · ${sources.filter((s) => s.kind === 'import').length} abroad`} href="#/warehouse/sources" />
        <Stat icon="building" label="Warehouses" value={fmt(sites.length)} sub={main ? `Main: ${siteLabel(main)}` : 'Add your godown'} href="#/warehouse/sites" />
      </div>
      {waiting.length > 0 && tab !== 'in' && (
        <div className="note attention-row" role="status">
          <span><b>{waiting.length} supplier bill{waiting.length === 1 ? '' : 's'}</b> waiting for the warehouse to check the goods in{rx.can ? '' : ` (${rx.who.slice(0, 2).join(', ') || 'an admin'} can confirm)`}.</span>
          <Button size="sm" variant="secondary" onClick={() => go('warehouse/in')}>Open To receive</Button>
        </div>
      )}
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
  const rx = useReceiveAccess()
  const { act } = useBooks()
  const confirm = useConfirm()
  const toast = useToast()
  const canFactory = rx.can
  const canImport = level('warehouse') === 'edit' || level('imports') === 'edit'
  const canBuy = level('suppliers') === 'edit'
  const receive = (r: Incoming) => {
    if (r.source === 'supplier') return sheets.open(ConfirmPurchaseSheet, { purchaseId: r.ref })
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
  const [q, setQ] = useState('')
  const f = useFilters({ kind: '', when: '', from: '', item: '' })
  const n = q.trim().toLowerCase()
  const shown = rows.filter((r) => (!f.v.kind || r.source === f.v.kind)
    && (!f.v.from || r.from === f.v.from) && (!f.v.item || r.productId === f.v.item)
    && (!f.v.when || (f.v.when === 'late' ? !!r.expected && r.expected < today : f.v.when === 'week' ? !!r.expected && r.expected >= today && r.expected <= addDays(today, 7) : !r.expected))
    && (!n || `${r.ref} ${byId(db.purchases, r.ref)?.billNo || ''} ${r.from} ${r.status} ${byId(db.products, r.productId)?.name || ''}`.toLowerCase().includes(n)))
  const opt = (xs: string[]) => [...new Set(xs)].sort().map((x) => ({ value: x, label: x }))
  return (
    <Card icon="truck" title="To receive" sub={rx.can ? 'Supplier bills, factory goods and imports not yet in. Tap one to check it in.' : `Supplier bills, factory goods and imports not yet in. ${rx.who.slice(0, 3).join(', ') || 'An admin'} can confirm them.`}>
      <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }}
        summary={<span><b>{fmt(shown.length)}</b> of {fmt(rows.length)} · <b>{fmt(shown.filter((r) => r.expected && r.expected < today).length)}</b> late</span>}
        main={<>
          <SearchBox value={q} onChange={setQ} placeholder="Order, shipment, item or source" />
          <Segmented label="From" value={f.v.kind} onChange={(x) => f.set('kind', x)} options={[{ value: '', label: 'All' }, { value: 'supplier', label: 'Supplier' }, { value: 'factory', label: 'Factory' }, { value: 'import', label: 'Import' }]} />
        </>}>
        <FilterSelect label="Expected" value={f.v.when} onChange={(x) => f.set('when', x)} all="Any time" options={[{ value: 'late', label: 'Late' }, { value: 'week', label: 'Due in the next 7 days' }, { value: 'none', label: 'No date given' }]} />
        <FilterSelect label="Source" value={f.v.from} onChange={(x) => f.set('from', x)} all="Every source" options={opt(rows.map((r) => r.from))} />
        <FilterSelect label="Item" value={f.v.item} onChange={(x) => f.set('item', x)} all="Every item" options={[...new Set(rows.map((r) => r.productId))].map((id) => ({ value: id, label: byId(db.products, id)?.name || id }))} />
      </FilterPanel>
      <DataTable rows={shown} rowKey={(r) => r.key} pageSize={15} onRow={receive} empty={rows.length ? 'Nothing matches these filters.' : 'Nothing on the way. Supplier bills, factory orders and shipments show up here.'}
        columns={[
          { label: 'Item', primary: true, render: (r) => { const p = byId(db.products, r.productId); return <span className="two-line"><b>{p?.name || 'Item'}</b><small className="t-muted">{r.source === 'supplier' ? `Bill ${byId(db.purchases, r.ref)?.billNo || ''}` : r.ref} · {r.from}</small></span> } },
          { label: 'From', render: (r) => <Pill tone={KIND_TONE[r.source]}>{SOURCE_KINDS[r.source]}</Pill> },
          { label: 'Quantity', align: 'right', render: (r) => <b>{fmt(r.qty)} {byId(db.products, r.productId)?.unit}</b> },
          { label: 'Where it is', render: (r) => <span className="t-muted">{r.status}</span> },
          { label: 'Expected', align: 'right', render: (r) => (r.expected ? <span className={r.expected < today ? 't-warn strong nowrap' : 'nowrap'}>{fdate(r.expected)}{r.expected < today ? ' · late' : ''}</span> : '—') },
          { label: '', align: 'right', render: (r) => (
            <span className="row-actions">
              {r.source === 'supplier' && canBuy && <Button size="sm" variant="ghost" onClick={async (e) => {
                e.stopPropagation()
                const x = byId(db.purchases, r.ref)
                if (!x || !(await confirm({ title: `Cancel bill ${x.billNo}?`, message: `The goods never came. The bill from ${r.from} is removed and nothing goes into stock.`, confirmLabel: 'Cancel bill', destructive: true }))) return
                const why = act('cancelPurchase', x.id)
                if (!why) toast(`Bill ${x.billNo} cancelled`)
              }}>Cancel</Button>}
              <Button size="sm" variant={r.source === 'supplier' && rx.can ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); receive(r) }}>{r.source === 'supplier' ? (rx.can ? 'Confirm received' : 'Waiting') : r.source === 'factory' ? (canFactory ? 'Receive' : 'View') : canImport ? 'Mark arrived' : 'View'}</Button>
            </span>
          ) },
        ]} />
    </Card>
  )
}

function ReceivedLog({ rows }: { rows: InboundRow[] }) {
  const { db } = useBooks()
  const st = siteStock(db)
  const sites = st.sites
  const [kind, setKind] = useState<'all' | SourceKind>('all')
  const [q, setQ] = useState('')
  const [month, setMonth] = useState('')
  const [site, setSite] = useState('')
  const siteOf = (r: InboundRow) => (r.siteId && sites.some((w) => w.id === r.siteId) ? r.siteId : st.mainId)
  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && (!month || r.date.slice(0, 7) === month) && (!site || siteOf(r) === site) && (!n || `${r.productName} ${r.sourceName} ${r.ref} ${r.note}`.toLowerCase().includes(n)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind, q, month, site, st])
  const kinds = (Object.keys(SOURCE_KINDS) as SourceKind[]).filter((k) => rows.some((r) => r.kind === k))
  return (
    <Card icon="box" title="Received into the warehouse" sub={`${fmt(shown.length)} entr${shown.length === 1 ? 'y' : 'ies'} · ${fmt(shown.reduce((s, r) => s + r.qty, 0))} units`}>
      <div className="card-body pt0 stock-filters">
        <SearchBox value={q} onChange={setQ} placeholder="Item, source, bill no. or note" />
        <label className="field"><span className="field-label">Month</span>
          <select className="in" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">Every month</option>
            {months.map((m) => <option key={m} value={m}>{fmonth(m)}</option>)}
          </select>
        </label>
        {sites.length > 1 && (
          <label className="field"><span className="field-label">Warehouse</span>
            <select className="in" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Warehouse">
              <option value="">All warehouses</option>
              {sites.map((w) => <option key={w.id} value={w.id}>{siteLabel(w)}</option>)}
            </select>
          </label>
        )}
        <Segmented<'all' | SourceKind> label="Source" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...kinds.map((k) => ({ value: k, label: SOURCE_KINDS[k] }))]} />
      </div>
      <DataTable rows={shown} rowKey={(r) => r.key} pageSize={20} exportName="received-goods" empty="Nothing received matches."
        columns={[
          { label: 'Date', primary: true, render: (r) => <span className="nowrap">{fdate(r.date)}</span>, exportValue: (r) => r.date },
          { label: 'Item', render: (r) => <b>{r.productName}</b> },
          { label: 'From', render: (r) => <span className="two-line"><span>{r.sourceName}</span><small><Pill tone={KIND_TONE[r.kind]}>{SOURCE_KINDS[r.kind]}</Pill></small></span>, exportValue: (r) => r.sourceName },
          { label: 'Quantity', align: 'right', render: (r) => <b className="nowrap">{fmt(r.qty)} {r.unit}</b>, exportValue: (r) => r.qty },
          ...(sites.length ? [{ label: 'Warehouse', render: (r: InboundRow) => { const w = byId(sites, siteOf(r)); return w ? <span className="nowrap">{w.code ? <span className="wh-code">{w.code}</span> : null} <span className="t-muted">{w.name}</span></span> : '—' }, exportValue: (r: InboundRow) => siteLabel(byId(sites, siteOf(r))) }] : []),
          { label: 'Ref', render: (r) => <span className="mono t-muted">{r.ref}</span>, exportValue: (r) => r.ref },
          { label: 'Note', render: (r) => <span className="t-muted">{r.note}</span>, exportValue: (r) => r.note },
        ]} />
    </Card>
  )
}

function Sources({ rows }: { rows: SourceRow[] }) {
  const { level } = useAccess()
  const sheets = useSheets()
  const [kind, setKind] = useState<'all' | SourceRow['kind']>('all')
  const [q, setQ] = useState('')
  const f = useFilters({ place: '', item: '', activity: '' })
  const placeOf = (r: SourceRow) => (r.details.city || r.details.area || r.country || '').trim()
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    const v = f.v
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && (!n || `${r.name} ${r.contact} ${r.phone} ${r.address} ${r.items.join(' ')}`.toLowerCase().includes(n))
      && (!v.place || placeOf(r) === v.place) && (!v.item || r.items.includes(v.item))
      && (!v.activity || (v.activity === 'pending' ? r.pending > 0 : v.activity === 'none' ? !r.deliveries : !!r.lastDate && r.lastDate >= addDays(todayISO(), -90))))
  }, [rows, kind, q, f.v])
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
      <FilterPanel active={f.active} onReset={() => { f.reset(); setQ(''); setKind('all') }}
        summary={<span><b>{fmt(shown.length)}</b> of {fmt(rows.length)} sources</span>}
        main={<>
          <SearchBox value={q} onChange={setQ} placeholder="Name, area, phone or item" />
          <Segmented<'all' | SourceRow['kind']> label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'supplier', label: 'Suppliers' }, { value: 'factory', label: 'Factories' }, { value: 'import', label: 'Abroad' }]} />
        </>}>
        <FilterSelect label="City, area or country" value={f.v.place} onChange={(x) => f.set('place', x)} all="Everywhere" options={[...new Set(rows.map(placeOf).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))} />
        <FilterSelect label="Sends us" value={f.v.item} onChange={(x) => f.set('item', x)} all="Any item" options={[...new Set(rows.flatMap((r) => r.items))].sort().map((x) => ({ value: x, label: x }))} />
        <FilterSelect label="Activity" value={f.v.activity} onChange={(x) => f.set('activity', x)} all="Any" options={[{ value: 'recent', label: 'Delivered in the last 90 days' }, { value: 'pending', label: 'Goods on the way' }, { value: 'none', label: 'No delivery yet' }]} />
      </FilterPanel>
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
              <span className="site-top"><span className="site-ic"><Icon name="building" size={20} /></span><b>{x.site.name}</b>{x.site.code && <span className="wh-code">{x.site.code}</span>}{x.site.main && <Pill tone="good">Main</Pill>}</span>
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
                <Button size="sm" variant="secondary" icon="layers" onClick={() => sheets.open(SiteDetailSheet, { siteId: x.site.id })}>Inventory</Button>
                {list.length > 1 && <Button size="sm" variant="secondary" icon="truck" onClick={() => sheets.open(TransferSheet, { from: x.site.id })}>Move stock</Button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </Card>
  )
}

/** Every item and how much of it is in each warehouse; narrow it to one warehouse or to one supplier's goods. */
function StockBySite() {
  const { db } = useBooks()
  const sheets = useSheets()
  const see = useSee()
  const { level } = useAccess()
  const st = siteStock(db)
  const sources = sourceDirectory(db)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'have' | 'low'>('have')
  const [site, setSite] = useState('')
  const [src, setSrc] = useState('')
  const canMove = st.sites.length > 1 && level('warehouse') === 'edit' && !accessGuard.readonly
  const from = src ? sources.find((x) => `${x.kind}:${x.id}` === src) : undefined
  const fromRows = from ? sourceStock(db, from.kind, from.id) : []
  const byProduct = new Map(fromRows.map((r) => [r.productId, r]))
  const here = (id: string) => (site ? st.qty.get(id)?.[site] || 0 : byId(db.products, id)?.stock || 0)
  const n = q.trim().toLowerCase()
  const rows = db.products.filter((p) => !p.archived
    && (!from || byProduct.has(p.id))
    && (!n || `${p.name} ${p.code}`.toLowerCase().includes(n))
    && (only === 'all' || (only === 'have' ? Math.abs(here(p.id)) > 0.0001 : p.lowAt > 0 && p.stock <= p.lowAt)))
  const shownSites = site ? st.sites.filter((w) => w.id === site) : st.sites
  const units = rows.reduce((a, p) => a + here(p.id), 0)
  const value = rows.reduce((a, p) => a + here(p.id) * (p.cost || 0), 0)
  const w = byId(st.sites, site)
  const group = (k: SourceRow['kind'], label: string) => {
    const list = sources.filter((x) => x.kind === k)
    return list.length ? <optgroup label={label}>{list.map((x) => <option key={x.kind + x.id} value={`${x.kind}:${x.id}`}>{x.name}</option>)}</optgroup> : null
  }
  type P = (typeof rows)[number]
  return (
    <Card icon="layers" title={w ? `Stock at ${siteLabel(w)}` : from ? `Stock of ${from.name}’s goods` : 'Stock by warehouse'}
      sub={st.sites.length ? 'Goods received into a warehouse or moved there stay there; sales and deliveries go out from the main one.' : 'Add your warehouses under the Warehouses tab to see stock in each one.'}>
      <div className="card-body pt0 stock-filters">
        <SearchBox value={q} onChange={setQ} placeholder="Item name or code" />
        {st.sites.length > 0 && (
          <label className="field"><span className="field-label">Warehouse</span>
            <select className="in" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Warehouse">
              <option value="">All warehouses</option>
              {st.sites.map((x) => <option key={x.id} value={x.id}>{siteLabel(x)}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span className="field-label">Supplier or source</span>
          <select className="in" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Supplier or source">
            <option value="">Every source</option>
            {group('supplier', 'Suppliers')}
            {group('factory', 'Factories')}
            {group('import', 'Abroad (imports)')}
          </select>
        </label>
        <Segmented label="Show" value={only} onChange={setOnly} options={[{ value: 'have', label: 'In stock' }, { value: 'all', label: 'All items' }, { value: 'low', label: 'Low' }]} />
      </div>
      <div className="stock-sum">
        <span><b>{fmt(rows.length)}</b> item{rows.length === 1 ? '' : 's'}</span>
        <span><b>{fmt(units)}</b> units {w ? `at ${w.name}` : 'in all'}</span>
        <span>value <b>{see.cost ? tk(value) : <Hidden />}</b></span>
        {from && <span><b>{fmt(fromRows.reduce((a, r) => a + r.received, 0))}</b> units received from {from.name} in all</span>}
        {(site || src) && <button type="button" className="link" onClick={() => { setSite(''); setSrc('') }}>Clear filters</button>}
      </div>
      <DataTable rows={rows} rowKey={(p) => p.id} pageSize={20} exportName={w ? `stock-${(w.code || w.name).toLowerCase().replace(/\W+/g, '-')}` : 'stock-by-warehouse'} empty={from ? `Nothing from ${from.name} matches.` : 'No item matches.'}
        columns={[
          { label: 'Item', primary: true, render: (p) => <span className="two-line"><b>{p.name}</b><small className="t-muted">{p.code}</small></span>, exportValue: (p) => p.name },
          { label: 'Code', render: (p) => <span className="mono t-muted">{p.code}</span>, exportValue: (p) => p.code },
          ...(from ? [
            { label: `From ${from.name}`, align: 'right' as const, render: (p: P) => { const r = byProduct.get(p.id); return r?.received ? <span className="two-line"><b>{fmt(site ? r.receivedBySite[site] || 0 : r.received)} {p.unit}</b><small className="t-muted">{r.deliveries} deliver{r.deliveries === 1 ? 'y' : 'ies'}{r.lastDate ? ` · last ${fdate(r.lastDate)}` : ''}</small></span> : <span className="t-muted">Not yet</span> }, exportValue: (p: P) => { const r = byProduct.get(p.id); return site ? r?.receivedBySite[site] || 0 : r?.received || 0 } },
          ] : []),
          ...shownSites.map((x) => ({ label: x.code || x.name, align: 'right' as const, render: (p: P) => { const v = st.qty.get(p.id)?.[x.id] || 0; return <span className={v < 0 ? 't-warn' : v === 0 ? 't-muted' : site ? 'strong' : undefined}>{fmt(v)}{site ? ` ${p.unit}` : ''}</span> }, exportValue: (p: P) => st.qty.get(p.id)?.[x.id] || 0 })),
          { label: site ? 'All warehouses' : 'Total', align: 'right', render: (p) => <b className={p.lowAt > 0 && p.stock <= p.lowAt ? 't-warn' : undefined}>{fmt(p.stock)} {p.unit}{p.lowAt > 0 && p.stock <= p.lowAt ? ' · low' : ''}</b>, exportValue: (p) => p.stock },
          { label: 'Value', align: 'right', render: (p) => (see.cost ? tk(here(p.id) * (p.cost || 0)) : <Hidden />), exportValue: (p) => (see.cost ? here(p.id) * (p.cost || 0) : '') },
          ...(canMove ? [{ label: '', align: 'right' as const, render: (p: P) => { const at = site || st.sites.find((x) => (st.qty.get(p.id)?.[x.id] || 0) > 0)?.id; return at && (st.qty.get(p.id)?.[at] || 0) > 0 ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); sheets.open(TransferSheet, { productId: p.id, from: at }) }}>Move</Button> : null } }] : []),
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
  const name = (id: string) => siteLabel(byId(db.warehouses || [], id)) || 'Removed warehouse'
  const [q, setQ] = useState('')
  const f = useFilters({ site: '', dir: '', item: '', from: '', to: '' })
  const v = f.v
  const all = [...(db.stockTransfers || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts))
  const n = q.trim().toLowerCase()
  const list = all.filter((t) => (!v.site || (v.dir === 'out' ? t.from === v.site : v.dir === 'in' ? t.to === v.site : t.from === v.site || t.to === v.site))
    && (!v.item || t.lines.some((l) => l.productId === v.item)) && (!v.from || t.date >= v.from) && (!v.to || t.date <= v.to)
    && (!n || `${t.id} ${t.note} ${t.by} ${name(t.from)} ${name(t.to)} ${t.lines.map((l) => byId(db.products, l.productId)?.name || '').join(' ')}`.toLowerCase().includes(n)))
  const sites = db.warehouses || []
  const canEdit = level('warehouse') === 'edit' && !accessGuard.readonly
  return (
    <Card icon="truck" title="Moves between warehouses" sub={`${all.length} move${all.length === 1 ? '' : 's'}`}
      action={canEdit && (db.warehouses || []).length > 1 && <Button icon="plus" onClick={() => sheets.open(TransferSheet, {})}>Move stock</Button>}>
      {all.length > 0 && (
        <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }} summary={<span><b>{fmt(list.length)}</b> of {fmt(all.length)} moves</span>}
          main={<SearchBox value={q} onChange={setQ} placeholder="Move no., item, vehicle or person" />}>
          <FilterSelect label="Warehouse" value={v.site} onChange={(x) => f.set('site', x)} all="Any warehouse" options={sites.map((w) => ({ value: w.id, label: siteLabel(w) }))} />
          <FilterSelect label="Direction" value={v.dir} onChange={(x) => f.set('dir', x)} all="In or out" options={[{ value: 'in', label: 'Moved into it' }, { value: 'out', label: 'Moved out of it' }]} />
          <FilterSelect label="Item" value={v.item} onChange={(x) => f.set('item', x)} all="Any item" options={[...new Set(all.flatMap((t) => t.lines.map((l) => l.productId)))].map((id) => ({ value: id, label: byId(db.products, id)?.name || id }))} />
          <FilterDates label="Date" from={v.from} to={v.to} onFrom={(x) => f.set('from', x)} onTo={(x) => f.set('to', x)} />
        </FilterPanel>
      )}
      <DataTable rows={list} exportName="stock-moves" rowKey={(t) => t.id} pageSize={20} empty={(db.warehouses || []).length > 1 ? 'No goods moved yet.' : 'Add a second warehouse to move goods between them.'}
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
