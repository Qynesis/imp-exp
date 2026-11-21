import { useState } from 'react'
import { fmt, productBarcode, tk, type Product } from '@shared/domain'
import { Barcode } from '@/components/barcode/Barcode'
import { useBooks } from '@/core/store/context'
import { Button, Field, Segmented, Sheet, usePrint, type SheetComponent } from '@/ui'

export type LabelSize = 'a4-21' | 'a4-40' | 'roll'
const SIZES: Record<LabelSize, string> = {
  'a4-21': 'A4 sheet, 3 × 7 (63.5 × 38 mm)',
  'a4-40': 'A4 sheet, 4 × 10 (48.5 × 25.4 mm)',
  roll: 'Label printer roll (50 × 25 mm)',
}
type Kind = 'unit' | 'carton'

interface Pick {
  count: string
  kind: Kind
}

/** Print barcode labels: unit labels for each pack, carton labels that count the whole carton in one scan. */
export const LabelsSheet: SheetComponent<{ productIds?: string[] }> = ({ productIds }) => {
  const { db } = useBooks()
  const print = usePrint()
  const [q, setQ] = useState('')
  const [size, setSize] = useState<LabelSize>('a4-21')
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [picked, setPicked] = useState<Record<string, Pick>>(() => Object.fromEntries((productIds || []).map((id) => [id, { count: '1', kind: 'unit' as Kind }])))
  const list = db.products.filter((p) => !p.archived && (!q || `${p.name} ${p.code} ${p.barcode || ''}`.toLowerCase().includes(q.toLowerCase())))
  const chosen = Object.entries(picked).map(([id, x]) => ({ p: db.products.find((p) => p.id === id)!, n: Math.max(0, Math.floor(Number(x.count) || 0)), kind: x.kind })).filter((x) => x.p && x.n > 0)
  const total = chosen.reduce((s, x) => s + x.n, 0)
  const toggle = (p: Product) => setPicked((s) => {
    const next = { ...s }
    if (next[p.id]) delete next[p.id]
    else next[p.id] = { count: '1', kind: 'unit' }
    return next
  })
  const labels = chosen.flatMap((x) => Array.from({ length: x.n }, () => ({ p: x.p, kind: x.kind })))

  return (
    <Sheet title="Print barcode labels" crumb="Products and stock" wide
      footer={
        <>
          <span className="t-muted grow">{total} label{total === 1 ? '' : 's'}</span>
          <Button icon="print" disabled={!total} onClick={() => print(<LabelsDoc labels={labels} size={size} showName={showName} showPrice={showPrice} />)}>Preview and print</Button>
        </>
      }>
      <div className="note">Stick a <b>unit label</b> on each pack, and a <b>carton label</b> on each carton: one scan of a carton counts all the packs inside. Labels without a barcode print the product code. A USB or Bluetooth scanner, or a phone camera, reads them at receiving, delivery and returns.</div>
      <div className="labels-options">
        <Field label="Label size"><select className="in" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>{Object.entries(SIZES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <label className="check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Show product name</label>
        <label className="check"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price</label>
      </div>
      <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or barcode" aria-label="Search products" />
      <div className="label-pick">
        {list.map((p) => {
          const x = picked[p.id]
          return (
            <div key={p.id} className="label-row">
              <label className="check grow"><input type="checkbox" checked={!!x} onChange={() => toggle(p)} /> <span className="two-line"><b>{p.name}</b><small className="t-muted mono">{productBarcode(p)}{p.perCarton ? ` · ${fmt(p.perCarton)} per carton` : ''}</small></span></label>
              {x && (
                <>
                  {p.perCarton ? <Segmented<Kind> label="Label type" value={x.kind} onChange={(kind) => setPicked({ ...picked, [p.id]: { ...x, kind } })} options={[{ value: 'unit', label: 'Unit' }, { value: 'carton', label: 'Carton' }]} /> : null}
                  <input className="in sm" inputMode="numeric" value={x.count} aria-label={`Labels for ${p.name}`} onChange={(e) => setPicked({ ...picked, [p.id]: { ...x, count: e.target.value } })} />
                </>
              )}
            </div>
          )
        })}
        {!list.length && <p className="t-muted">No products match.</p>}
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
            {showPrice && kind === 'unit' && <div className="label-price">{tk(p.price)}{p.unit ? ` / ${p.unit}` : ''}</div>}
          </div>
        )
      })}
    </div>
  )
}
