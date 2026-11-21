import { useState } from 'react'
import { categoryPath, fmt, inCategory, productBarcode, tk, type Product } from '@shared/domain'
import { Barcode } from '@/components/barcode/Barcode'
import { useBooks } from '@/core/store/context'
import { Button, cls, Field, Segmented, Sheet, usePrint, useToast, type SheetComponent } from '@/ui'

export type LabelSize = 'a4-21' | 'a4-40' | 'roll'
const SIZES: Record<LabelSize, string> = {
  'a4-21': 'A4 sheet, 3 × 7 (63.5 × 38 mm)',
  'a4-40': 'A4 sheet, 4 × 10 (48.5 × 25.4 mm)',
  roll: 'Label printer roll (50 × 25 mm)',
}
type Kind = 'unit' | 'carton'
type Show = 'finished' | 'materials' | 'all'
/** More than this in one go would make the browser slow; print in batches instead. */
const MAX_LABELS = 3000

interface Pick {
  count: string
  kind: Kind
}
export interface LabelPreset {
  productId: string
  count: number
  kind?: Kind
}

/** Labels to cover what is in the warehouse: one per pack, or one per carton. */
const stockCount = (p: Product, kind: Kind) => Math.max(0, kind === 'carton' && p.perCarton ? Math.ceil(p.stock / p.perCarton) : Math.ceil(p.stock))

/**
 * Print barcode labels, one at a time or in bulk: pick by search, category or supplier, select all that
 * show, then give every selected item the same number of labels, or as many as are in stock.
 */
export const LabelsSheet: SheetComponent<{ productIds?: string[]; preset?: LabelPreset[] }> = ({ productIds, preset }) => {
  const { db } = useBooks()
  const print = usePrint()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [cat, setCat] = useState('')
  const [supplier, setSupplier] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [size, setSize] = useState<LabelSize>('a4-21')
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [bulkQty, setBulkQty] = useState('1')
  const [picked, setPicked] = useState<Record<string, Pick>>(() => Object.fromEntries([
    ...(productIds || []).map((id) => [id, { count: '1', kind: 'unit' as Kind }]),
    ...(preset || []).map((x) => [x.productId, { count: String(x.count), kind: x.kind || 'unit' }]),
  ]))

  const list = db.products.filter((p) => !p.archived
    && (show === 'all' || (show === 'finished' ? p.kind === 'finished' : p.kind !== 'finished'))
    && (!cat || inCategory(db, p, cat))
    && (!supplier || p.supplierIds?.includes(supplier))
    && (!onlySelected || picked[p.id])
    && (!q || `${p.name} ${p.code} ${p.barcode || ''}`.toLowerCase().includes(q.toLowerCase())))
  const chosen = Object.entries(picked).map(([id, x]) => ({ p: db.products.find((p) => p.id === id)!, n: Math.max(0, Math.floor(Number(x.count) || 0)), kind: x.kind })).filter((x) => x.p && x.n > 0)
  const total = chosen.reduce((s, x) => s + x.n, 0)
  const allShownPicked = list.length > 0 && list.every((p) => picked[p.id])
  const selectedCount = Object.keys(picked).length

  const toggle = (p: Product) => setPicked((s) => {
    const next = { ...s }
    if (next[p.id]) delete next[p.id]
    else next[p.id] = { count: bulkQty || '1', kind: 'unit' }
    return next
  })
  const toggleAll = () => setPicked((s) => {
    const next = { ...s }
    if (allShownPicked) for (const p of list) delete next[p.id]
    else for (const p of list) next[p.id] = next[p.id] || { count: bulkQty || '1', kind: 'unit' }
    return next
  })
  /** The same change for every selected item. */
  const forSelected = (change: (p: Product, x: Pick) => Pick) => setPicked((s) => Object.fromEntries(Object.entries(s).map(([id, x]) => {
    const p = db.products.find((y) => y.id === id)
    return [id, p ? change(p, x) : x]
  })))
  const labels = chosen.flatMap((x) => Array.from({ length: x.n }, () => ({ p: x.p, kind: x.kind })))

  return (
    <Sheet title="Print barcode labels" crumb="Products and stock" wide
      footer={
        <>
          <span className={cls('grow', total > MAX_LABELS ? 't-warn' : 't-muted')}>{fmt(total)} label{total === 1 ? '' : 's'} for {selectedCount} item{selectedCount === 1 ? '' : 's'}{total > MAX_LABELS ? ` · print up to ${fmt(MAX_LABELS)} at a time` : ''}</span>
          {selectedCount > 0 && <Button variant="ghost" onClick={() => setPicked({})}>Clear selection</Button>}
          <Button icon="print" disabled={!total} onClick={() => {
            if (total > MAX_LABELS) return toast(`That is ${fmt(total)} labels. Print up to ${fmt(MAX_LABELS)} at a time.`)
            print(<LabelsDoc labels={labels} size={size} showName={showName} showPrice={showPrice} />)
          }}>Preview and print</Button>
        </>
      }>
      <div className="note">Stick a <b>unit label</b> on each pack and a <b>carton label</b> on each carton: one scan of a carton counts every pack inside. Labels without a barcode print the product code.</div>

      <div className="labels-options">
        <Field label="Label size"><select className="in" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>{Object.entries(SIZES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <label className="check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Show item name</label>
        <label className="check"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price</label>
      </div>

      <div className="labels-filters">
        <Segmented<Show> label="Items" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'finished', label: 'Products' }, { value: 'materials', label: 'Materials' }]} />
        <select className="in" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {db.categories.map((c) => <option key={c.id} value={c.id}>{categoryPath(db, c.id)}</option>)}
        </select>
        <select className="in" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="in grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan or search name, code, barcode" aria-label="Search items" />
      </div>

      <div className="labels-bulk">
        <label className="check"><input type="checkbox" checked={allShownPicked} onChange={toggleAll} /> <b>Select all {list.length} shown</b></label>
        <label className="check"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Selected only</label>
        <span className="labels-bulk-set">
          <span className="t-muted">For all selected:</span>
          <input className="in sm" inputMode="numeric" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} aria-label="Labels for each selected item" />
          <Button size="sm" variant="secondary" disabled={!selectedCount} onClick={() => forSelected((_, x) => ({ ...x, count: bulkQty }))}>Set labels</Button>
          <Button size="sm" variant="secondary" disabled={!selectedCount} onClick={() => forSelected((p, x) => ({ ...x, count: String(stockCount(p, x.kind)) }))}>As many as in stock</Button>
          <Button size="sm" variant="secondary" disabled={!selectedCount} onClick={() => forSelected((p, x) => ({ ...x, kind: p.perCarton ? 'carton' : x.kind }))}>All as cartons</Button>
          <Button size="sm" variant="ghost" disabled={!selectedCount} onClick={() => forSelected((_, x) => ({ ...x, kind: 'unit' }))}>All as units</Button>
        </span>
      </div>

      <div className="label-pick">
        {list.map((p) => {
          const x = picked[p.id]
          return (
            <div key={p.id} className={cls('label-row', x && 'on')}>
              <label className="check grow"><input type="checkbox" checked={!!x} onChange={() => toggle(p)} /> <span className="two-line"><b>{p.name}</b><small className="t-muted"><span className="mono">{productBarcode(p)}</span>{p.perCarton ? ` · ${fmt(p.perCarton)} per carton` : ''} · {fmt(p.stock)} {p.unit} in stock</small></span></label>
              {x && (
                <>
                  {p.perCarton ? <Segmented<Kind> label="Label type" value={x.kind} onChange={(kind) => setPicked({ ...picked, [p.id]: { ...x, kind } })} options={[{ value: 'unit', label: 'Unit' }, { value: 'carton', label: 'Carton' }]} /> : null}
                  <input className="in sm" inputMode="numeric" value={x.count} aria-label={`Labels for ${p.name}`} onChange={(e) => setPicked({ ...picked, [p.id]: { ...x, count: e.target.value } })} />
                </>
              )}
            </div>
          )
        })}
        {!list.length && <p className="t-muted">No items match.</p>}
      </div>
    </Sheet>
  )
}

/** The printed page: labels laid out to the chosen sheet or roll. */
function LabelsDoc({ labels, size, showName, showPrice }: { labels: { p: Product; kind: Kind }[]; size: LabelSize; showName: boolean; showPrice: boolean }) {
  return (
    <div className={`labels labels-${size}`}>
      {labels.map(({ p, kind }, i) => {
        const code = kind === 'carton' && p.perCarton ? `${productBarcode(p)}*${p.perCarton}` : productBarcode(p)
        return (
          <div key={i} className="label">
            {showName && <div className="label-name">{p.name}{kind === 'carton' ? ` · carton of ${fmt(p.perCarton)}` : ''}</div>}
            <Barcode value={code} height={size === 'a4-40' ? 28 : 36} />
            {showPrice && kind === 'unit' && p.price > 0 && <div className="label-price">{tk(p.price)}{p.unit ? ` / ${p.unit}` : ''}</div>}
          </div>
        )
      })}
    </div>
  )
}
