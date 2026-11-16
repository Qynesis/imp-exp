import { activeProducts, byId, fmt, materialsFor, num, tk, todayISO, type CustomValues, type MaterialGiven } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { MethodSelect } from '@/components/MethodSelect'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Field, FormSheet, Icon, useForm, useSheets, useToast } from '@/ui'
import { AddFactorySheet } from './AddFactorySheet'

interface MaterialRow {
  productId: string
  given: string
}

/** Place an order with a factory. `productId` picks what to order; materials and packaging default to a direct order. */
export function NewFactoryOrderSheet({ productId }: { productId?: string } = {}) {
  const { db, act } = useBooks()
  const toast = useToast()
  const sheets = useSheets()
  const preset = byId(db.products, productId)
  const [v, set, bind, nbind] = useForm(() => ({
    // the factory that made this item last time, when known
    factoryId: db.factoryOrders.find((o) => o.productId === preset?.id)?.factoryId || db.factories[0]?.id || '',
    type: (preset && preset.kind !== 'finished' ? '2' : '1') as '1' | '2',
    productId: preset?.id || activeProducts(db).find((p) => p.kind === 'finished')?.id || activeProducts(db)[0]?.id || '',
    qty: '', rate: '', expected: '', advance: '', method: 'Cash',
    materials: [] as MaterialRow[],
    custom: {} as CustomValues,
  }))
  const product = byId(db.products, v.productId)
  const stockables = activeProducts(db).filter((p) => p.kind !== 'finished')
  const setMat = (i: number, patch: Partial<MaterialRow>) => set('materials', v.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const total = num(v.qty) * num(v.rate)
  const hasRecipe = !!product?.recipe?.some((r) => r.qty > 0)
  const fillFromRecipe = () => {
    if (product) set('materials', materialsFor(product, num(v.qty)).map((m) => ({ productId: m.productId, given: num(v.qty) > 0 ? String(m.given) : '' })))
  }

  const submit = () => {
    if (!v.factoryId) return 'Add a factory first.'
    if (!v.productId) return 'Add the product first, under Products and stock.'
    if (num(v.qty) <= 0) return 'Enter how many you are ordering.'
    if (num(v.rate) <= 0) return 'Enter the rate per unit.'
    const materials: MaterialGiven[] = []
    if (v.type === '1') {
      for (const m of v.materials) {
        const p = byId(db.products, m.productId)
        const given = num(m.given)
        if (!p || given <= 0) continue
        const already = materials.filter((x) => x.productId === p.id).reduce((s, x) => s + x.given, 0)
        if (given + already > p.stock) return `Only ${fmt(p.stock)} ${p.unit} of ${p.name} in the warehouse.`
        materials.push({ productId: p.id, given })
      }
    }
    const id = 'FO-' + db.seq.fo
    act('newFactoryOrder', {
      factoryId: v.factoryId, type: v.type === '1' ? 1 : 2, productId: v.productId, qty: num(v.qty), rate: num(v.rate),
      placed: todayISO(), expected: v.expected, advance: num(v.advance), method: v.method, materials, custom: v.custom,
    })
    toast(`Order ${id} placed`)
    go('factory-orders/' + id)
  }

  return (
    <FormSheet title="New factory order" crumb="Factory orders" submit="Place order" onSubmit={submit}
      note="Type 1: we hand over raw materials and pay only a making charge. Type 2: the factory uses its own materials and bills the full price.">
      <Field label="Factory" hint={<button type="button" className="link" onClick={() => sheets.open(AddFactorySheet)}>Add a new factory</button>}>
        <select {...bind('factoryId')}>
          {!db.factories.length && <option value="">No factories yet</option>}
          {db.factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>
      <Field label="Order type">
        <select {...bind('type')}>
          <option value="1">Type 1 · Raw material supplied</option>
          <option value="2">Type 2 · Direct order</option>
        </select>
      </Field>
      <Field label="Product">
        <select value={v.productId} className="in" onChange={(e) => { set('productId', e.target.value); set('materials', []) }}>
          {activeProducts(db).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 50" /></Field>
      <Field label={v.type === '1' ? 'Making charge per unit (Tk)' : 'Price per unit (Tk)'} hint={total > 0 ? `Order value ${tk(total)}` : undefined}>
        <input {...nbind('rate')} placeholder="0" />
      </Field>
      <Field label="Expected delivery date"><input type="date" {...bind('expected')} /></Field>
      <Field label="Advance paid now (Tk)"><input {...nbind('advance')} placeholder="0" /></Field>
      <Field label="Advance paid by"><MethodSelect {...bind('method')} /></Field>
      <CustomFields entity="factoryOrder" value={v.custom} onChange={(c) => set('custom', c)} />

      {v.type === '1' && (
        <div className="field wide">
          <span className="field-label">Raw materials handed over</span>
          {hasRecipe && (
            <Button variant="secondary" size="sm" onClick={fillFromRecipe}>
              {num(v.qty) > 0 ? `Fill from recipe for ${fmt(num(v.qty))} ${product?.unit}` : 'Fill materials from recipe'}
            </Button>
          )}
          {v.materials.map((m, i) => {
            const p = byId(db.products, m.productId)
            return (
              <div className="mat-row" key={i}>
                <select className="in" value={m.productId} onChange={(e) => setMat(i, { productId: e.target.value })} aria-label="Material">
                  {stockables.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmt(s.stock)} {s.unit} in warehouse</option>)}
                </select>
                <input className="in" inputMode="decimal" value={m.given} onChange={(e) => setMat(i, { given: e.target.value })} placeholder={p ? p.unit : 'Qty'} aria-label="Quantity handed over" />
                <button type="button" className="icon-btn" aria-label="Remove material" onClick={() => set('materials', v.materials.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
              </div>
            )
          })}
          {stockables.length ? (
            <Button icon="plus" variant="dashed" size="sm" onClick={() => set('materials', [...v.materials, { productId: stockables[0].id, given: '' }])}>Add material</Button>
          ) : <small>No raw materials or packaging in Products and stock yet.</small>}
          <small>Handed-over materials leave the warehouse and are tracked at the factory.</small>
        </div>
      )}
    </FormSheet>
  )
}
