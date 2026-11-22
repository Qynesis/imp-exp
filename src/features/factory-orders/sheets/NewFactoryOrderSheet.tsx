import { activeProducts, byId, fmt, materialsFor, num, tk, todayISO, type CustomValues, type MaterialGiven, activeFactories, fullAddress } from '@shared/domain'
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

interface Props {
  /** Pick what to order; materials and packaging default to a direct order. */
  productId?: string
  /** 'estimate' prepares a proposal to send the factory instead of placing the order. */
  mode?: 'order' | 'estimate'
  /** Edit this estimate (mode 'estimate'), or confirm it as an order (mode 'order'). */
  estimateId?: string
  /** Start with this factory. */
  factoryId?: string
}

/** Place an order with a factory, or prepare the estimate that goes to the factory for approval first. */
export function NewFactoryOrderSheet({ productId, mode = 'order', estimateId, factoryId }: Props) {
  const { db, act } = useBooks()
  const toast = useToast()
  const sheets = useSheets()
  const est = byId(db.estimates || [], estimateId)
  const preset = byId(db.products, productId || est?.productId)
  const estimating = mode === 'estimate'
  const confirming = !estimating && !!est
  const [v, set, bind, nbind] = useForm(() => ({
    // the factory that made this item last time, when known
    factoryId: factoryId || est?.factoryId || preset?.factoryIds?.find((id) => activeFactories(db).some((f) => f.id === id)) || db.factoryOrders.find((o) => o.productId === preset?.id)?.factoryId || activeFactories(db)[0]?.id || '',
    type: (est ? String(est.type) : preset && preset.kind !== 'finished' ? '2' : '1') as '1' | '2',
    productId: preset?.id || activeProducts(db).find((p) => p.kind === 'finished')?.id || activeProducts(db)[0]?.id || '',
    qty: est ? String(est.qty) : '', rate: est ? String(est.rate) : '', expected: est?.wanted || '', validUntil: est?.validUntil || '', note: est?.note || '',
    advance: '', method: 'Cash',
    materials: (est?.materials || []).map((m): MaterialRow => ({ productId: m.productId, given: String(m.given) })),
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
        // an estimate only proposes; stock is checked when the materials are actually handed over
        if (!estimating && given + already > p.stock) return `Only ${fmt(p.stock)} ${p.unit} of ${p.name} in the warehouse.`
        materials.push({ productId: p.id, given })
      }
    }
    if (estimating) {
      act('saveEstimate', {
        id: est?.id, date: est?.date || todayISO(), factoryId: v.factoryId, type: v.type === '1' ? 1 : 2, productId: v.productId, qty: num(v.qty), rate: num(v.rate),
        wanted: v.expected, validUntil: v.validUntil, materials, note: v.note.trim(),
      })
      toast(est ? `Estimate ${est.id} saved` : `Estimate EST-${db.seq.est ?? 101} ready to send`)
      return
    }
    const id = 'FO-' + db.seq.fo
    act('newFactoryOrder', {
      factoryId: v.factoryId, type: v.type === '1' ? 1 : 2, productId: v.productId, qty: num(v.qty), rate: num(v.rate),
      placed: todayISO(), expected: v.expected, advance: num(v.advance), method: v.method, materials, custom: v.custom, estimateId: est?.id,
    })
    toast(`Order ${id} placed`)
    go('factory-orders/' + id)
  }

  return (
    <FormSheet title={estimating ? (est ? `Edit estimate ${est.id}` : 'New estimate') : confirming ? `Confirm order from ${est?.id}` : 'New factory order'} crumb="Factory orders"
      submit={estimating ? 'Save estimate' : confirming ? 'Confirm order' : 'Place order'} onSubmit={submit}
      note={estimating
        ? 'An estimate is a proposal. Print it or send it on WhatsApp; once the factory approves, confirm it as an order. Nothing moves in stock or money until then.'
        : confirming ? 'Check the approved quantity and rate. An advance is optional: pay any amount now, later, or in parts.'
        : 'Type 1: we hand over raw materials and pay only a making charge. Type 2: the factory uses its own materials and bills the full price. An advance is optional.'}>
      <Field label="Factory" hint={<>{(() => { const x = byId(db.factories, v.factoryId); const line = x ? [fullAddress(x), x.phone].filter(Boolean).join(' · ') : ''; return line ? <>{line}<br /></> : null })()}<button type="button" className="link" onClick={() => sheets.open(AddFactorySheet, {})}>Add a new factory</button></>}>
        <select {...bind('factoryId')}>
          {!activeFactories(db, v.factoryId).length && <option value="">No factories yet</option>}
          {activeFactories(db, v.factoryId).map((f) => <option key={f.id} value={f.id}>{f.name}{f.city || f.area ? ` · ${f.city || f.area}` : ''}{f.makes ? ` · ${f.makes}` : ''}</option>)}
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
      <Field label={estimating ? 'Wanted by' : 'Expected delivery date'}><input type="date" {...bind('expected')} /></Field>
      {estimating ? (
        <>
          <Field label="Price valid until" hint="Optional"><input type="date" {...bind('validUntil')} /></Field>
          <Field label="Note for the factory" wide><input {...bind('note')} placeholder="e.g. same print as last lot, 60 boxes per carton" /></Field>
        </>
      ) : (
        <>
          <Field label="Advance paid now (Tk)" hint="Optional. Pay any amount later, in as many parts as you like."><input {...nbind('advance')} placeholder="0" /></Field>
          <Field label="Advance paid by"><MethodSelect {...bind('method')} /></Field>
          <CustomFields entity="factoryOrder" value={v.custom} onChange={(c) => set('custom', c)} />
        </>
      )}

      {v.type === '1' && (
        <div className="field wide">
          <span className="field-label">{estimating ? 'Raw materials we will hand over' : 'Raw materials handed over'}</span>
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
          <small>{estimating ? 'Listed on the estimate only. Stock moves when the order is confirmed.' : 'Handed-over materials leave the warehouse and are tracked at the factory.'}</small>
        </div>
      )}
    </FormSheet>
  )
}
