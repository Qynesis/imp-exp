import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { useMemo, useState } from 'react'
import {
  atFactory, byId, categoryPath, fmt, fshort, inCategory, incomingStock, isLowStock, lastsFor, PRODUCT_SOURCES, productSources, productSuppliers, stockSummary, tk,
  todayISO, usageRate, usedIn, type ProductKind, type ProductSource,
} from '@shared/domain'
import { downloadCsv } from '@/components/downloadCsv'
import { PageHead } from '@/components/PageHead'
import { LabelsSheet } from '@/features/products/sheets/LabelsSheet'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { NewFactoryOrderSheet } from '@/features/factory-orders/sheets/NewFactoryOrderSheet'
import { CategoryPanel } from '@/features/products/CategoryPanel'
import { AddCategorySheet } from '@/features/products/sheets/AddCategorySheet'
import { ProductDetailSheet } from '@/features/products/sheets/ProductDetailSheet'
import { ProductSheet } from '@/features/products/sheets/ProductSheet'
import { StockTabs } from '@/features/products/StockTabs'
import { NewShipmentSheet } from '@/features/shipments/sheets/NewShipmentSheet'
import { NewPurchaseSheet } from '@/features/suppliers/sheets/NewPurchaseSheet'
import { Button, Card, cls, DataTable, IconBadge, Pill, Segmented, Stat, useSheets, type IconName } from '@/ui'

const MATERIAL_KINDS: readonly ProductKind[] = ['raw', 'packaging']
type KindFilter = 'all' | 'raw' | 'packaging' | 'low' | 'archived'

/** The three ways materials reach us, as shown on the source cards. */
const ROUTES: { source: ProductSource; icon: IconName; title: string; text: string; action: string }[] = [
  { source: 'import', icon: 'ship', title: 'Imported', text: 'Bought from abroad on LC, landed cost includes freight, duty and clearing.', action: 'Start an import' },
  { source: 'supplier', icon: 'truck', title: 'Local suppliers', text: 'Bought in the country on cash or credit, straight into the warehouse.', action: 'Buy from a supplier' },
  { source: 'factory', icon: 'factory', title: 'Local factories', text: 'Made for us by a factory, such as printed cartons, boxes and labels.', action: 'Order from a factory' },
]

export default function RawMaterialsPage() {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const [catPick, setCat] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [source, setSource] = useState<ProductSource | ''>('')
  const [q, setQ] = useState('')

  // a deleted category falls back to "all"
  const cat = byId(db.categories, catPick) ? catPick : ''
  const everything = useMemo(() => db.products.filter((p) => MATERIAL_KINDS.includes(p.kind)), [db])
  const materials = useMemo(() => everything.filter((p) => !p.archived), [everything])
  const archivedCount = everything.length - materials.length
  const incoming = incomingStock(db, MATERIAL_KINDS)
  const sum = stockSummary(db)
  const lowCount = materials.filter(isLowStock).length
  const lyingValue = materials.reduce((s, p) => s + atFactory(db, p.id).lyingQty * p.cost, 0)
  const bySource = (s: ProductSource) => materials.filter((p) => productSources(db, p).includes(s)).length

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (kind === 'archived' ? everything.filter((p) => p.archived) : materials)
      .map((p) => ({ ...p, from: productSources(db, p), f: atFactory(db, p.id), uses: usedIn(db, p.id), offers: productSuppliers(db, p), pace: usageRate(db, p.id), coming: incoming.filter((i) => i.productId === p.id) }))
      .filter((p) =>
        (kind === 'all' || kind === 'archived' || (kind === 'low' ? isLowStock(p) : p.kind === kind)) &&
        (!source || p.from.includes(source)) &&
        (!cat || inCategory(db, p, cat)) &&
        (p.name + ' ' + p.code).toLowerCase().includes(needle))
  }, [db, everything, materials, incoming, kind, source, cat, q])

  const download = () => downloadCsv(`raw-materials-${todayISO()}.csv`,
    ['Material', 'Code', 'Kind', 'Category', 'Comes from', 'Usual supplier', 'Unit', 'In warehouse', 'On the way', 'At factories', 'Used in 90 days', 'Cost per unit', 'Stock value', 'Goes into'],
    rows.map((r) => [r.name, r.code, r.kind === 'raw' ? 'Raw material' : 'Packaging', categoryPath(db, r.categoryId), r.from.map((s) => PRODUCT_SOURCES[s]).join('; '),
      r.offers.find((o) => o.preferred)?.name || '', r.unit, r.stock, r.coming.reduce((s, i) => s + i.qty, 0), r.f.lyingQty, r.pace.out, see.cost ? r.cost : '', see.cost ? Math.max(r.stock, 0) * r.cost : '',
      r.uses.map((u) => u.product.name).join('; ')]))

  const restock = (s: ProductSource, productId?: string) => {
    if (s === 'import') sheets.open(NewShipmentSheet, { productId })
    else if (s === 'factory') sheets.open(NewFactoryOrderSheet, { productId })
    else sheets.open(NewPurchaseSheet, { productId })
  }

  return (
    <>
      <PageHead title="Raw materials" sub="Materials and packaging that reach us by import, from local suppliers or from local factories." actions={
        <>
          <Button icon="download" variant="secondary" onClick={download}>Download list</Button>
          <Button icon="barcode" variant="secondary" onClick={() => sheets.open(LabelsSheet, {})}>Barcode labels</Button>
          <Button icon="plus" variant="secondary" onClick={() => sheets.open(AddCategorySheet)}>Add category</Button>
          <Button icon="plus" onClick={() => sheets.open(ProductSheet, { kind: 'raw' })}>Add raw material</Button>
        </>
      } />
      <StockTabs current="raw-materials" />

      <div className="stats">
        <Stat icon="layers" label="In the warehouse" value={see.cost ? tk(sum.value.raw + sum.value.packaging) : <Hidden />} sub={`${fmt(sum.count.raw)} raw materials · ${fmt(sum.count.packaging)} packaging`} />
        <Stat icon="ship" label="On the way" value={fmt(incoming.length)} sub={`${fmt(incoming.filter((i) => i.source === 'import').length)} imports · ${fmt(incoming.filter((i) => i.source === 'factory').length)} factory orders`} />
        <Stat icon="factory" label="Lying at factories" value={see.cost ? tk(lyingValue) : <Hidden />} sub="Handed over, not used yet" />
        <Stat icon="alert" label="Low stock" value={fmt(lowCount)} tone={lowCount ? 'warn' : undefined} sub={lowCount ? 'Time to reorder' : 'All above their alert level'} />
      </div>

      <div className="source-cards">
        {ROUTES.map((r) => (
          <div key={r.source} className={cls('card source-card', source === r.source && 'active')}>
            <button type="button" className="source-pick" aria-pressed={source === r.source} onClick={() => setSource(source === r.source ? '' : r.source)}>
              <IconBadge name={r.icon} tone={source === r.source ? 'good' : 'brand'} />
              <span className="source-title">{r.title}<span className="t-muted"> · {fmt(bySource(r.source))}</span></span>
              <small>{r.text}</small>
            </button>
            <Button icon={r.icon} variant="secondary" size="sm" className="edit-only" onClick={() => restock(r.source, materials.find((p) => productSources(db, p).includes(r.source))?.id)}>{r.action}</Button>
          </div>
        ))}
      </div>

      <div className="grid-cat">
        <CategoryPanel db={db} items={materials} value={cat} onChange={setCat} allLabel="All materials" onEdit={(id) => sheets.open(AddCategorySheet, { categoryId: id })} />
        <Card>
          <div className="card-body tools-row">
            <Segmented label="Kind" value={kind} onChange={setKind} options={[
              { value: 'all', label: 'All' },
              { value: 'raw', label: 'Raw materials' },
              { value: 'packaging', label: 'Packaging' },
              { value: 'low', label: `Low${lowCount ? ` (${lowCount})` : ''}` },
              ...(archivedCount || kind === 'archived' ? [{ value: 'archived' as const, label: `Archived (${archivedCount})` }] : []),
            ]} />
            <input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Material name or code" aria-label="Search materials" />
          </div>
          {source && (
            <div className="card-body pt0 filter-note">
              Showing materials {source === 'import' ? 'we import' : source === 'factory' ? 'made by local factories' : 'from local suppliers'}.
              <button type="button" className="link" onClick={() => setSource('')}>Show all</button>
            </div>
          )}
          <DataTable
            pageSize={25}
            rows={rows}
            onRow={(r) => sheets.open(ProductDetailSheet, { productId: r.id })}
            empty={kind === 'archived' ? 'No archived materials.' : materials.length ? 'No material matches.' : 'No raw materials yet. Add the first one.'}
            columns={[
              { label: 'Material', primary: true, render: (r) => (
                <span className="two-line">
                  <b>{r.name}</b>
                  <small>{[r.code, categoryPath(db, r.categoryId)].filter(Boolean).join(' · ')}</small>
                </span>
              ) },
              { label: 'Comes from', render: (r) => (
                <span className="two-line">
                  <span>{r.from.length ? r.from.map((s) => PRODUCT_SOURCES[s]).join(', ') : <span className="t-muted">Not set</span>}</span>
                  {r.offers[0]?.preferred && <small className="t-muted">Usually {r.offers[0].name}</small>}
                </span>
              ) },
              { label: 'In warehouse', align: 'right', render: (r) => (
                <span className="two-line right">
                  <span className="nowrap"><b>{fmt(r.stock)} {r.unit}</b> {isLowStock(r) && <Pill tone="warn">Low</Pill>}</span>
                  <small className={r.pace.daysLeft !== null && r.pace.daysLeft < 14 ? 't-warn' : 't-muted'}>{r.pace.out ? `Lasts: ${lastsFor(r.pace.daysLeft).toLowerCase()}` : 'No use in 90 days'}</small>
                </span>
              ) },
              { label: 'On the way', align: 'right', render: (r) => {
                const qty = r.coming.reduce((s, i) => s + i.qty, 0)
                return qty ? (
                  <span className="two-line right">
                    <b>{fmt(qty)} {r.unit}</b>
                    <small className="t-muted">{r.coming.map((i) => i.ref).join(', ')}</small>
                  </span>
                ) : <span className="t-muted">None</span>
              } },
              { label: 'At factories', align: 'right', render: (r) => (r.f.lyingQty > 0 ? <span>{fmt(r.f.lyingQty)} {r.unit}</span> : <span className="t-muted">None</span>) },
              { label: 'Goes into', render: (r) => (r.uses.length ? <span className="t-muted">{r.uses.map((u) => u.product.name).join(', ')}</span> : <span className="t-muted">Not in a recipe</span>) },
              { label: 'Cost per unit', align: 'right', render: (r) => (!see.cost ? <Hidden /> : r.cost ? tk(r.cost) : '') },
            ]}
          />
        </Card>
      </div>

      <Card icon="route" title="On the way" sub="Imports not yet in the warehouse and factory orders not yet fully received.">
        <div className="rows">
          {incoming.map((i) => {
            const p = byId(db.products, i.productId)
            return (
              <button key={i.key} type="button" className="row click" onClick={() => go((i.source === 'import' ? 'imports/' : 'factory-orders/') + i.ref)}>
                <span className="two-line">
                  <span className="name">{p?.name}</span>
                  <small className="t-muted">{i.ref} · {i.source === 'import' ? 'Import' : 'Local factory'} · {i.from}</small>
                </span>
                <span className="meta">{i.status}{i.expected ? ` · expected ${fshort(i.expected)}` : ''}</span>
                <span className="amt">{fmt(i.qty)} {p?.unit}</span>
              </button>
            )
          })}
          {!incoming.length && <div className="row"><span className="meta">Nothing on the way.</span></div>}
        </div>
      </Card>
    </>
  )
}
