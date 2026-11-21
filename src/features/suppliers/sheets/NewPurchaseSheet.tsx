import { useSee } from '@/app/useSee'
import { useState } from 'react'
import { activeProducts, byId, fmt, num, tk, todayISO, type Attachment, type SupplierTerms } from '@shared/domain'
import { AttachField } from '@/components/attachments/Attachments'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Record goods bought from a local supplier. `productId` picks the item, and its usual supplier, in advance. */
export function NewPurchaseSheet({ supplierId, productId }: { supplierId?: string; productId?: string }) {
  const { db, act } = useBooks()
  // without cost permission, goods are received by quantity and the price comes from the item's current cost
  const see = useSee()
  const toast = useToast()
  const preset = byId(db.products, productId)
  const sup = byId(db.suppliers, supplierId) || byId(db.suppliers, preset?.supplierIds?.[0]) || db.suppliers[0]
  // materials first, then finished goods: traders also buy ready goods locally
  const pool = [...activeProducts(db)].sort((a, b) => Number(a.kind === 'finished') - Number(b.kind === 'finished'))
  const first = preset || pool[0]
  const [v, set, bind, nbind] = useForm({
    supplierId: sup?.id || '', billNo: 'PB-' + db.seq.pb, date: todayISO(), productId: first?.id || '', qty: '',
    rate: first?.cost ? String(first.cost) : '', terms: (sup?.terms || 'credit') as SupplierTerms, paid: '', method: 'Cash', tax: '',
  })
  const [files, setFiles] = useState<Attachment[]>([])
  const purchaseRates = (db.taxRates || []).filter((r) => r.active && r.appliesTo !== 'sales' && r.rate > 0 && r.kind !== 'withholding')
  const product = byId(db.products, v.productId)
  const goods = num(v.qty) * num(v.rate)
  const tax = num(v.tax)
  const amount = goods + tax
  return (
    <FormSheet title="New purchase" crumb={preset ? preset.name : "Suppliers"} submit="Save purchase"
      note="Goods go straight into warehouse stock. On credit, the unpaid part is added to what we owe this supplier."
      onSubmit={() => {
        if (!v.supplierId) return 'Add a supplier first.'
        if (!product) return 'Add the item first, under Products and stock.'
        if (!see.cost && !(product.cost > 0)) return 'This item has no cost yet. Ask someone who can see prices to record its first purchase.'
        const rate = see.cost ? num(v.rate) : product.cost
        if (num(v.qty) <= 0 || rate <= 0) return 'Enter the quantity and the rate.'
        if (tax < 0) return 'VAT cannot be negative.'
        const paid = !see.cost ? 0 : v.terms === 'cash' ? amount : num(v.paid)
        if (paid > amount) return `Paid now cannot be more than the bill of ${tk(amount)}.`
        act('newPurchase', { supplierId: v.supplierId, billNo: v.billNo.trim() || 'PB-' + db.seq.pb, date: v.date, productId: v.productId, qty: num(v.qty), rate, terms: see.cost ? v.terms : 'credit', paid, method: v.method, tax: tax || undefined, attachments: files.length ? files : undefined })
        toast(`${fmt(num(v.qty))} ${product.unit} added to stock`)
      }}>
      <Field label="Supplier">
        <select {...bind('supplierId')}>
          {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Bill number"><input {...bind('billNo')} placeholder="e.g. PB-222" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Item">
        <select className="in" value={v.productId} onChange={(e) => {
          set('productId', e.target.value)
          const p = byId(db.products, e.target.value)
          if (p?.cost) set('rate', String(p.cost))
        }}>
          <optgroup label="Raw materials and packaging">{pool.filter((p) => p.kind !== 'finished').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          <optgroup label="Finished goods">{pool.filter((p) => p.kind === 'finished').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>
      </Field>
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 500" /></Field>
      {see.cost && <><Field label="Rate per unit (Tk)" hint={goods > 0 ? `Goods ${tk(goods)}${tax ? ` + VAT ${tk(tax)} = ${tk(amount)}` : ''}` : undefined}><input {...nbind('rate')} placeholder="0" /></Field>
      <Field label="VAT on the bill (Tk)" hint={purchaseRates.length ? <>Can be set off against VAT on sales. {purchaseRates.slice(0, 3).map((r) => <button key={r.id} type="button" className="link" onClick={() => set('tax', String(Math.round(goods * r.rate) / 100))}>{r.name}</button>).reduce<React.ReactNode[]>((a, b, i) => (i ? [...a, ' · ', b] : [b]), [])}</> : 'Leave 0 if the supplier charged none'}>
        <input {...nbind('tax')} placeholder="0" />
      </Field>
      <Field label="Terms">
        <select {...bind('terms')}>
          <option value="credit">Credit</option>
          <option value="cash">Cash, paid in full now</option>
        </select>
      </Field>
      {v.terms === 'credit' && <Field label="Paid now (Tk)"><input {...nbind('paid')} placeholder="0" /></Field>}
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      </>}
      {!see.cost && <p className="t-muted tight wide-note">Prices are hidden for your role: the goods are recorded at the item’s current cost, on credit. The accountant settles the bill.</p>}
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}
