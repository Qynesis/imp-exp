import { useSee } from '@/app/useSee'
import { byId, duplicateOf, newBarcode, num, PRODUCT_KINDS, PRODUCT_SOURCES, UNITS, type CustomValues, type ProductKind, type ProductSource, type RecipeLine } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'
import { RecipeEditor, type RecipeRowInput } from '../RecipeEditor'

const toggle = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

/** Add a product, or edit one when `productId` is given. `kind` sets what a new one starts as. */
export function ProductSheet({ productId, kind = 'finished' }: { productId?: string; kind?: ProductKind }) {
  const { db, act, session } = useBooks()
  const see = useSee()
  const me = db.users.find((u) => u.id === session.userId)
  const toast = useToast()
  const cur = byId(db.products, productId)
  const tops = db.categories.filter((c) => !c.parentId)
  // a new item starts in the category where items of its kind already live
  const curCat = byId(db.categories, cur?.categoryId || db.products.find((p) => p.kind === kind)?.categoryId)
  const [v, set, bind, nbind] = useForm(() => cur
    ? {
        name: cur.name, code: cur.code, top: curCat?.parentId || curCat?.id || '', sub: curCat?.parentId ? curCat.id : '', kind: cur.kind, unit: cur.unit, pack: cur.pack || '',
        cost: String(cur.cost || ''), price: String(cur.price || ''), stock: String(cur.stock), lowAt: String(cur.lowAt || ''), custom: cur.custom || {},
        sources: cur.sources || [], supplierIds: cur.supplierIds || [], barcode: cur.barcode || '', perCarton: cur.perCarton ? String(cur.perCarton) : '', costNote: '',
        recipe: (cur.recipe || []).map((r): RecipeRowInput => ({ productId: r.productId, qty: String(r.qty) })),
      }
    : {
        name: '', code: '', top: curCat?.parentId || curCat?.id || tops[0]?.id || '', sub: '', kind, unit: kind === 'finished' ? 'cartons' : kind === 'raw' ? 'kg' : 'pcs', pack: '',
        cost: '', price: '', stock: '', lowAt: '', custom: {} as CustomValues,
        sources: [] as ProductSource[], supplierIds: [] as string[], recipe: [] as RecipeRowInput[], barcode: '', perCarton: '', costNote: '',
      })
  const subs = db.categories.filter((c) => c.parentId === v.top)
  const forSale = v.kind === 'finished'
  const material = (cur?.kind ?? kind) !== 'finished'
  const madeByUs = v.sources.includes('factory') || v.sources.includes('workshop')

  const submit = () => {
    if (!v.name.trim()) return 'Enter the product name.'
    const code = v.barcode.trim()
    if (code && /[^\x20-\x7e]/.test(code)) return 'A barcode can hold letters, digits and simple signs only.'
    if (code && db.products.some((p) => p.id !== cur?.id && (p.barcode === code || (!p.barcode && p.code === code)))) return 'Another product already uses that barcode.'
    const dup = duplicateOf(db, { id: cur?.id, name: v.name, code: v.code })
    if (dup) return dup
    const recipe: RecipeLine[] = []
    for (const r of v.recipe) {
      const qty = num(r.qty)
      if (!r.productId || qty <= 0) continue
      if (r.productId === cur?.id) return 'A product cannot be a material of itself.'
      if (recipe.some((x) => x.productId === r.productId)) return `${byId(db.products, r.productId)?.name || 'A material'} is in the recipe twice.`
      recipe.push({ productId: r.productId, qty })
    }
    act('saveProduct', {
      id: cur?.id, name: v.name.trim(), code: v.code.trim(), categoryId: v.sub || v.top, kind: v.kind, unit: v.unit, pack: v.pack.trim(),
      cost: num(v.cost), price: forSale ? num(v.price) : 0, stock: cur ? cur.stock : num(v.stock), lowAt: num(v.lowAt), custom: v.custom,
      sources: v.sources, supplierIds: v.sources.includes('supplier') ? v.supplierIds.filter((id) => byId(db.suppliers, id)) : [], recipe,
      barcode: code || undefined, perCarton: num(v.perCarton) > 0 ? num(v.perCarton) : undefined, archived: cur?.archived,
      costNote: v.costNote.trim(), by: me?.name || '',
    })
    toast(cur ? 'Product updated' : 'Product added')
  }

  return (
    <FormSheet title={(cur ? 'Edit ' : 'Add ') + (material ? 'raw material' : 'product')} crumb={material ? 'Raw materials' : 'Products and stock'} submit={material ? 'Save material' : 'Save product'} wide
      note={cur ? 'To correct the stock figure, use Adjust stock on the product so the change is recorded.' : undefined}
      onSubmit={submit}>
      <Field label="Product name"><input {...bind('name')} placeholder="e.g. Mustard oil 1 L" /></Field>
      <Field label="Product code"><input {...bind('code')} placeholder="e.g. MO-1L" /></Field>
      <Field label="Barcode" hint={<>Scanned at receiving, delivery and returns. Empty: the product code is used. <button type="button" className="link" onClick={() => set('barcode', newBarcode(db))}>Make a new barcode</button></>}>
        <input {...bind('barcode')} placeholder="Scan the pack’s barcode, or make one" autoComplete="off" />
      </Field>
      <Field label={`${v.unit || 'Units'} per carton`} hint="For carton labels: one scan counts the whole carton"><input {...nbind('perCarton')} placeholder="e.g. 24" /></Field>
      <Field label="Category">
        <select className="in" value={v.top} onChange={(e) => { set('top', e.target.value); set('sub', '') }}>
          {!tops.length && <option value="">No categories yet</option>}
          {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Sub category">
        <select {...bind('sub')}>
          <option value="">None</option>
          {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Kind">
        <select {...bind('kind')}>{Object.entries(PRODUCT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Unit">
        <select {...bind('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
      </Field>
      {see.cost && <Field label="Cost per unit (Tk)" hint={cur ? 'Updated by purchases, imports and workshop batches.' : undefined}><input {...nbind('cost')} placeholder="0" /></Field>}
      {cur && num(v.cost) !== cur.cost && <Field label="Why the cost changed" hint="Kept in Accounts → Update notes"><input {...bind('costNote')} placeholder="e.g. New supplier price from 1 Dec" /></Field>}
      {forSale && <Field label="Dealer price (Tk)"><input {...nbind('price')} placeholder="0" /></Field>}
      {!cur && <Field label="Opening stock"><input {...nbind('stock')} placeholder="0" /></Field>}
      <Field label="Low stock alert at"><input {...nbind('lowAt')} placeholder="e.g. 10" /></Field>
      <Field label="Pack note" wide><input {...bind('pack')} placeholder="e.g. carton of 60 boxes" /></Field>

      <div className="field wide">
        <span className="field-label">Comes from</span>
        <div className="chips" role="group" aria-label="Comes from">
          {(Object.keys(PRODUCT_SOURCES) as ProductSource[]).map((k) => (
            <button key={k} type="button" className={'chip' + (v.sources.includes(k) ? ' on' : '')} aria-pressed={v.sources.includes(k)} onClick={() => set('sources', toggle(v.sources, k))}>
              {PRODUCT_SOURCES[k]}
            </button>
          ))}
        </div>
        <small>Pick every way you get it. Purchases, imports and factory orders also fill this in by themselves.</small>
      </div>

      {v.sources.includes('supplier') && (
        <div className="field wide">
          <span className="field-label">Usual suppliers</span>
          {db.suppliers.length ? (
            <div className="chips" role="group" aria-label="Usual suppliers">
              {db.suppliers.map((s) => (
                <button key={s.id} type="button" className={'chip' + (v.supplierIds.includes(s.id) ? ' on' : '')} aria-pressed={v.supplierIds.includes(s.id)} onClick={() => set('supplierIds', toggle(v.supplierIds, s.id))}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : <small>No suppliers yet. Add them under Suppliers.</small>}
        </div>
      )}

      {(forSale || madeByUs) && (
        <RecipeEditor db={db} selfId={cur?.id} unit={v.unit} rows={v.recipe} onChange={(rows) => set('recipe', rows)} />
      )}

      <CustomFields entity="product" value={v.custom} onChange={(c) => set('custom', c)} />
    </FormSheet>
  )
}
