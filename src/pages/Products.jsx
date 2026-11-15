import { useState } from 'react'
import { fmt, tk } from '../lib/format.js'
import { atFactory, catPath, isLow } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Pill, cls, useSheets } from '../ui.jsx'
import { PageHead } from './common.jsx'

export default function Products() {
  const { db } = useStore()
  const sheets = useSheets()
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const tops = db.categories.filter((c) => !c.parentId)
  const inCat = (p, id) => p.categoryId === id || db.categories.some((c) => c.id === p.categoryId && c.parentId === id)
  const count = (id) => db.products.filter((p) => inCat(p, id)).length
  const needle = q.trim().toLowerCase()
  const rows = db.products
    .filter((p) => (!cat || inCat(p, cat)) && (p.name + ' ' + p.code).toLowerCase().includes(needle))
    .map((p) => ({ ...p, f: atFactory(db, p.id) }))

  const catBtn = (id, name, sub) => (
    <button key={id} type="button" className={cls('cat', sub && 'sub', cat === id && 'active')} onClick={() => setCat(id)} aria-pressed={cat === id}>
      <span>{name}</span>
      <span className="t-muted">{id ? count(id) : db.products.length}</span>
    </button>
  )

  return (
    <>
      <PageHead title="Products and stock" sub="Finished goods, raw materials and packaging, grouped by category and sub category." actions={
        <>
          <Button variant="secondary" onClick={() => sheets.open('addCategory')}>Add category</Button>
          <Button onClick={() => sheets.open('product')}>Add product</Button>
        </>
      } />
      <div className="grid-cat">
        <Card title="Categories" className="cat-card">
          <div className="cat-list">
            {catBtn('', 'All products')}
            {tops.map((t) => (
              <div key={t.id} className="cat-group">
                {catBtn(t.id, t.name)}
                {db.categories.filter((c) => c.parentId === t.id).map((c) => catBtn(c.id, c.name, true))}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="card-body">
            <label className="field narrow">
              <span className="field-label">Search products</span>
              <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or code" />
            </label>
          </div>
          <DataTable
            rows={rows}
            onRow={(r) => sheets.open('product', { productId: r.id })}
            empty={db.products.length ? 'No product matches.' : 'No products yet. Add the first one.'}
            columns={[
              { label: 'Product', primary: true, render: (r) => (
                <span className="two-line">
                  <b>{r.name}</b>
                  <small>{[r.code, r.pack || r.unit].filter(Boolean).join(' · ')}</small>
                </span>
              ) },
              { label: 'Category', render: (r) => catPath(db, r.categoryId) },
              { label: 'In warehouse', align: 'right', render: (r) => (
                <span className="nowrap"><b>{fmt(r.stock)} {r.unit}</b> {isLow(r) && <Pill tone="warn">Low</Pill>}</span>
              ) },
              { label: 'At or due from factory', align: 'right', render: (r) => (
                r.f.due > 0 ? <span className="t-warn">{fmt(r.f.due)} {r.unit} due</span>
                  : r.f.lyingQty > 0 ? <span className="t-muted">{fmt(r.f.lyingQty)} {r.unit} at {r.f.lying.length === 1 ? r.f.lying[0].factory : 'factories'}</span>
                  : <span className="t-muted">None</span>
              ) },
              { label: 'Cost per unit', align: 'right', render: (r) => (r.cost ? tk(r.cost) : '') },
              { label: 'Dealer price', align: 'right', render: (r) => (r.kind === 'finished' && r.price ? tk(r.price) : <span className="t-muted">Not for sale</span>) },
            ]}
          />
        </Card>
      </div>
    </>
  )
}
