import { byId, num, tk, type Db } from '@shared/domain'
import { Button, Icon } from '@/ui'

export interface RecipeRowInput {
  productId: string
  qty: string
}

/** Materials and packaging that go into one unit of a product. */
export function RecipeEditor({ db, selfId, unit, rows, onChange }: { db: Db; selfId?: string; unit: string; rows: RecipeRowInput[]; onChange: (rows: RecipeRowInput[]) => void }) {
  const materials = db.products.filter((p) => p.kind !== 'finished' && p.id !== selfId && (!p.archived || rows.some((r) => r.productId === p.id)))
  const setRow = (i: number, patch: Partial<RecipeRowInput>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const cost = rows.reduce((s, r) => s + num(r.qty) * (byId(db.products, r.productId)?.cost || 0), 0)
  const one = unit.replace(/s$/, '') || 'unit'
  return (
    <div className="field wide">
      <span className="field-label">Recipe: raw materials and packaging for one {one}</span>
      {rows.map((r, i) => {
        const m = byId(db.products, r.productId)
        return (
          <div className="mat-row" key={i}>
            <select className="in" value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value })} aria-label="Material">
              {materials.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
            </select>
            <input className="in" inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} placeholder={m ? m.unit : 'Qty'} aria-label={`Quantity per ${one}`} />
            <button type="button" className="icon-btn" aria-label="Remove material" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
          </div>
        )
      })}
      {materials.length ? (
        <Button icon="plus" variant="dashed" size="sm" onClick={() => onChange([...rows, { productId: materials.find((m) => !rows.some((r) => r.productId === m.id))?.id || materials[0].id, qty: '' }])}>Add material</Button>
      ) : <small>Add raw materials or packaging as products first.</small>}
      <small>
        {cost > 0 ? `Materials cost ${tk(cost)} per ${one} at today's prices. ` : ''}
        The recipe fills in materials for factory orders and workshop batches, and shows how many you can make.
      </small>
    </div>
  )
}
