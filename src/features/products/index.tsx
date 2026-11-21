import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { useMemo, useState } from 'react'
import {
  byId, categoryPath, reservedQty, fmt, inCategory, incomingStock, isLowStock, lastsFor, PRODUCT_SOURCES, productSources, recipeInfo, stockSummary, tk, todayISO, usageRate,
  type ProductKind,
} from '@shared/domain'
import { downloadCsv } from '@/components/downloadCsv'
import { PageHead } from '@/components/PageHead'
import { LabelsSheet } from './sheets/LabelsSheet'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, IconBadge, Pill, Segmented, Stat, useSheets } from '@/ui'
import { CategoryPanel } from './CategoryPanel'
import { AddCategorySheet } from './sheets/AddCategorySheet'
import { ProductDetailSheet } from './sheets/ProductDetailSheet'
import { ProductSheet } from './sheets/ProductSheet'
import { StockTabs } from './StockTabs'

type Show = 'all' | 'low' | 'recipe' | 'archived'
const FINISHED: readonly ProductKind[] = ['finished']

/** Finished goods we sell. Raw materials and packaging have their own screen. */
export default function ProductsPage() {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const [catPick, setCat] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [q, setQ] = useState('')
  // a deleted category falls back to "all"
  const cat = byId(db.categories, catPick) ? catPick : ''
  const sum = stockSummary(db)
  const all = useMemo(() => db.products.filter((p) => p.kind === 'finished'), [db])
  const finished = useMemo(() => all.filter((p) => !p.archived), [all])
  const archivedCount = all.length - finished.length
  const lowCount = finished.filter(isLowStock).length
  const incoming = incomingStock(db, FINISHED)
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (show === 'archived' ? all.filter((p) => p.archived) : finished)
      .map((p) => ({ ...p, from: productSources(db, p), make: recipeInfo(db, p), pace: usageRate(db, p.id), coming: incoming.filter((i) => i.productId === p.id) }))
      .filter((p) => (show === 'all' || show === 'archived' || (show === 'low' ? isLowStock(p) : p.make.rows.length === 0)) && (!cat || inCategory(db, p, cat)) && (p.name + ' ' + p.code).toLowerCase().includes(needle))
  }, [db, all, finished, incoming, cat, show, q])

  const download = () => downloadCsv(`finished-goods-${todayISO()}.csv`,
    ['Product', 'Code', 'Category', 'Comes from', 'Unit', 'In warehouse', 'On the way', 'Out in 90 days', 'Cost per unit', 'Stock value', 'Dealer price'],
    rows.map((r) => [r.name, r.code, categoryPath(db, r.categoryId), r.from.map((s) => PRODUCT_SOURCES[s]).join('; '), r.unit, r.stock, r.coming.reduce((s, i) => s + i.qty, 0), r.pace.out, see.cost ? r.cost : '', see.cost ? Math.max(r.stock, 0) * r.cost : '', r.price]))

  return (
    <>
      <PageHead title="Products and stock" sub="Finished goods we sell: where each comes from, what goes into it, and every stock movement." actions={
        <>
          <Button icon="download" variant="secondary" onClick={download}>Download list</Button>
          <Button icon="barcode" variant="secondary" onClick={() => sheets.open(LabelsSheet, {})}>Barcode labels</Button>
          <Button icon="plus" variant="secondary" onClick={() => sheets.open(AddCategorySheet)}>Add category</Button>
          <Button icon="plus" onClick={() => sheets.open(ProductSheet, { kind: 'finished' })}>Add product</Button>
        </>
      } />
      <StockTabs current="products" />
      <div className="stats">
        <Stat icon="box" label="Finished goods value" value={see.cost ? tk(sum.value.finished) : <Hidden />} sub={`${fmt(sum.count.finished)} products at cost`} />
        <Stat icon="route" label="On the way" value={fmt(incoming.length)} sub={`${fmt(incoming.filter((i) => i.source === 'factory').length)} factory orders · ${fmt(incoming.filter((i) => i.source === 'import').length)} imports`} />
        <Stat icon="alert" label="Low stock" value={fmt(lowCount)} tone={lowCount ? 'warn' : undefined} sub={lowCount ? 'Need ordering or making' : 'All above their alert level'} />
        <button type="button" className="card stat has-icon stat-link" onClick={() => go('raw-materials')}>
          <IconBadge name="layers" tone="info" />
          <div className="stat-label">Raw materials and packaging</div>
          <div className="stat-value">{tk(sum.value.raw + sum.value.packaging)}</div>
          <div className="stat-sub">{fmt(sum.count.raw + sum.count.packaging)} items · open →</div>
        </button>
      </div>
      <div className="grid-cat">
        <CategoryPanel db={db} items={finished} value={cat} onChange={setCat} allLabel="All products" onEdit={(id) => sheets.open(AddCategorySheet, { categoryId: id })} />
        <Card>
          <div className="card-body tools-row">
            <Segmented label="Show" value={show} onChange={setShow} options={[
              { value: 'all', label: 'All' },
              { value: 'low', label: `Low stock${lowCount ? ` (${lowCount})` : ''}` },
              { value: 'recipe', label: 'No recipe yet' },
              ...(archivedCount || show === 'archived' ? [{ value: 'archived' as const, label: `Archived (${archivedCount})` }] : []),
            ]} />
            <input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or code" aria-label="Search products" />
          </div>
          <DataTable
            pageSize={25}
            rows={rows}
            onRow={(r) => sheets.open(ProductDetailSheet, { productId: r.id })}
            empty={show === 'archived' ? 'No archived products.' : finished.length ? 'No product matches.' : 'No finished products yet. Add the first one.'}
            columns={[
              { label: 'Product', primary: true, render: (r) => (
                <span className="two-line">
                  <b>{r.name}</b>
                  <small>{[r.code, categoryPath(db, r.categoryId)].filter(Boolean).join(' · ')}</small>
                </span>
              ) },
              { label: 'Comes from', render: (r) => <span className="t-muted">{r.from.length ? r.from.map((s) => PRODUCT_SOURCES[s]).join(', ') : 'Not set'}</span> },
              { label: 'In warehouse', align: 'right', render: (r) => (
                <span className="two-line right">
                  <span className="nowrap"><b>{fmt(r.stock)} {r.unit}</b> {isLowStock(r) && <Pill tone="warn">Low</Pill>}</span>
                  {reservedQty(db, r.id) > 0 && <small className="t-muted">{fmt(reservedQty(db, r.id))} held for delivery</small>}
                  {r.make.rows.length > 0 && <small className="t-muted">Materials for {fmt(r.make.canMake)} more</small>}
                </span>
              ) },
              { label: 'Stock lasts', align: 'right', render: (r) => (
                <span className="two-line right">
                  <span className={r.pace.daysLeft !== null && r.pace.daysLeft < 14 ? 't-warn' : ''}>{lastsFor(r.pace.daysLeft)}</span>
                  {r.pace.out > 0 && <small className="t-muted">{fmt(r.pace.out)} out in 90 days</small>}
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
              { label: 'Cost / price', align: 'right', render: (r) => (
                <span className="two-line right">
                  <span>{!see.cost ? <Hidden /> : r.cost ? tk(r.cost) : <span className="t-muted">No cost</span>}</span>
                  <small className="t-muted">{r.price ? `Sells at ${tk(r.price)}` : 'No price'}</small>
                </span>
              ) },
            ]}
          />
        </Card>
      </div>
    </>
  )
}
