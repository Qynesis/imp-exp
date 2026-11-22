import { useSee } from '@/app/useSee'
import { activeFactories, byId, duplicateOf, fullAddress, importSourceName, newBarcode, num, PRODUCT_KINDS, PRODUCT_SOURCES, UNITS, type CustomValues, type ProductKind, type ProductSource, type RecipeLine } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { useBooks } from '@/core/store/context'
import { useState } from 'react'
import { AddFactorySheet } from '@/features/factory-orders/sheets/AddFactorySheet'
import { AddSupplierSheet } from '@/features/suppliers/sheets/AddSupplierSheet'
import { Field, FormSheet, Icon, useForm, useSheets, useToast } from '@/ui'
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
        sources: cur.sources || [], supplierIds: cur.supplierIds || [], factoryIds: cur.factoryIds || [], importFrom: cur.importFrom || [], barcode: cur.barcode || '', perCarton: cur.perCarton ? String(cur.perCarton) : '', costNote: '',
        recipe: (cur.recipe || []).map((r): RecipeRowInput => ({ productId: r.productId, qty: String(r.qty) })),
      }
    : {
        name: '', code: '', top: curCat?.parentId || curCat?.id || tops[0]?.id || '', sub: '', kind, unit: kind === 'finished' ? 'cartons' : kind === 'raw' ? 'kg' : 'pcs', pack: '',
        cost: '', price: '', stock: '', lowAt: '', custom: {} as CustomValues,
        sources: [] as ProductSource[], supplierIds: [] as string[], factoryIds: [] as string[], importFrom: [] as string[], recipe: [] as RecipeRowInput[], barcode: '', perCarton: '', costNote: '',
      })
  const sheets = useSheets()
  // a supplier or factory added from here is ticked as soon as it exists
  const [want, setWant] = useState<{ kind: 'supplier' | 'factory'; key: string } | null>(null)
  if (want) {
    const list = want.kind === 'factory' ? db.factories : db.suppliers
    const hit = list.find((x) => x.id === want.key || x.name.toLowerCase() === want.key)
    if (hit) {
      setWant(null)
      if (want.kind === 'factory') set('factoryIds', v.factoryIds.includes(hit.id) ? v.factoryIds : [...v.factoryIds, hit.id])
      else set('supplierIds', v.supplierIds.includes(hit.id) ? v.supplierIds : [...v.supplierIds, hit.id])
    }
  }
  const [newImport, setNewImport] = useState('')
  const knownImports = [...new Set([...db.imports.filter((x) => x.direction !== 'export').map(importSourceName), ...db.products.flatMap((x) => x.importFrom || []), ...v.importFrom])]
  const addImport = () => {
    const n = newImport.trim()
    if (n && !v.importFrom.some((x) => x.toLowerCase() === n.toLowerCase())) set('importFrom', [...v.importFrom, n])
    setNewImport('')
  }
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
      sources: v.sources, supplierIds: v.sources.includes('supplier') ? v.supplierIds.filter((id) => byId(db.suppliers, id)) : [],
      factoryIds: v.sources.includes('factory') ? v.factoryIds.filter((id) => byId(db.factories, id)) : [], importFrom: v.sources.includes('import') ? v.importFrom : [], recipe,
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
        <div className="field wide src-pick">
          <span className="field-label">Usual suppliers <small className="t-muted">· tap to pick</small></span>
          <div className="chips" role="group" aria-label="Usual suppliers">
            {db.suppliers.map((x) => (
              <button key={x.id} type="button" title={fullAddress(x)} className={'chip' + (v.supplierIds.includes(x.id) ? ' on' : '')} aria-pressed={v.supplierIds.includes(x.id)} onClick={() => set('supplierIds', toggle(v.supplierIds, x.id))}>
                {x.name}{x.city || x.area ? <small> · {x.city || x.area}</small> : null}
              </button>
            ))}
            <button type="button" className="chip add" onClick={() => sheets.open(AddSupplierSheet, { onSaved: (key: string) => setWant({ kind: 'supplier', key }) })}><Icon name="plus" size={14} /> New supplier</button>
          </div>
          <PickedList rows={v.supplierIds.map((id) => byId(db.suppliers, id)).filter((x) => !!x).map((x) => ({ id: x.id, name: x.name, line: [x.phone, fullAddress(x)].filter(Boolean).join(' · ') }))} />
        </div>
      )}

      {v.sources.includes('factory') && (
        <div className="field wide src-pick">
          <span className="field-label">Factories that make it <small className="t-muted">· tap to pick</small></span>
          <div className="chips" role="group" aria-label="Factories that make it">
            {activeFactories(db).concat(db.factories.filter((f) => f.archived && v.factoryIds.includes(f.id))).map((f) => (
              <button key={f.id} type="button" title={fullAddress(f)} className={'chip' + (v.factoryIds.includes(f.id) ? ' on' : '')} aria-pressed={v.factoryIds.includes(f.id)} onClick={() => set('factoryIds', toggle(v.factoryIds, f.id))}>
                {f.name}{f.city || f.area ? <small> · {f.city || f.area}</small> : null}
              </button>
            ))}
            <button type="button" className="chip add" onClick={() => sheets.open(AddFactorySheet, { onSaved: (key: string) => setWant({ kind: 'factory', key }) })}><Icon name="plus" size={14} /> New factory</button>
          </div>
          <PickedList rows={v.factoryIds.map((id) => byId(db.factories, id)).filter((x) => !!x).map((f) => ({ id: f.id, name: f.name, line: [f.makes, f.phone, fullAddress(f)].filter(Boolean).join(' · ') }))} />
        </div>
      )}

      {v.sources.includes('import') && (
        <div className="field wide src-pick">
          <span className="field-label">Imported from <small className="t-muted">· overseas suppliers</small></span>
          <div className="chips" role="group" aria-label="Imported from">
            {knownImports.map((n) => (
              <button key={n} type="button" className={'chip' + (v.importFrom.includes(n) ? ' on' : '')} aria-pressed={v.importFrom.includes(n)} onClick={() => set('importFrom', toggle(v.importFrom, n))}>{n}</button>
            ))}
          </div>
          <div className="src-add">
            <input className="in" value={newImport} onChange={(e) => setNewImport(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImport() } }} placeholder="Another overseas supplier, e.g. Guangzhou Tianli Co." aria-label="Overseas supplier name" />
            <button type="button" className="btn btn-secondary" onClick={addImport} disabled={!newImport.trim()}>Add</button>
          </div>
        </div>
      )}

      {(forSale || madeByUs) && (
        <RecipeEditor db={db} selfId={cur?.id} unit={v.unit} rows={v.recipe} onChange={(rows) => set('recipe', rows)} />
      )}

      <CustomFields entity="product" value={v.custom} onChange={(c) => set('custom', c)} />
    </FormSheet>
  )
}

/** The picked suppliers or factories with their contact and address, so the right one is chosen. */
function PickedList({ rows }: { rows: { id: string; name: string; line: string }[] }) {
  if (!rows.length) return null
  return (
    <ul className="src-picked">
      {rows.map((r) => <li key={r.id}><Icon name="pin" size={14} /><span><b>{r.name}</b>{r.line && <small className="t-muted">{r.line}</small>}</span></li>)}
    </ul>
  )
}
