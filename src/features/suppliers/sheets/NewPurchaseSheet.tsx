import { useSee } from '@/app/useSee'
import { useState } from 'react'
import { activeProducts, byId, fmt, num, tk, todayISO, type Attachment, type SupplierTerms, fullAddress, siteStock } from '@shared/domain'
import { AttachField } from '@/components/attachments/Attachments'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { SitePicker } from '@/components/SitePicker'
import { Field, FormSheet, useForm, useToast } from '@/ui'
import { useReceiveAccess } from '@/features/warehouse/receiveAccess'

/**
 * Record a local supplier's bill. `productId` picks the item, and its usual supplier, in advance.
 * The goods wait in the warehouse's "To receive" list until an admin or warehouse manager confirms them;
 * someone who may receive can confirm at once (`inNow` ticks that by default, from the warehouse screen).
 */
export function NewPurchaseSheet({ supplierId, productId, inNow }: { supplierId?: string; productId?: string; inNow?: boolean }) {
  const { db, act, saveNow } = useBooks()
  const rx = useReceiveAccess()
  // without cost permission, goods are received by quantity and the price comes from the item's current cost
  const see = useSee()
  const toast = useToast()
  const preset = byId(db.products, productId)
  const sup = byId(db.suppliers, supplierId) || byId(db.suppliers, preset?.supplierIds?.[0]) || db.suppliers[0]
  // materials first, then finished goods: traders also buy ready goods locally
  const pool = [...activeProducts(db)].sort((a, b) => Number(a.kind === 'finished') - Number(b.kind === 'finished'))
  const first = preset || pool[0]
  const [v, set, bind, nbind] = useForm({
    siteId: siteStock(db).mainId,
    supplierId: sup?.id || '', billNo: 'PB-' + db.seq.pb, date: todayISO(), productId: first?.id || '', qty: '',
    rate: first?.cost ? String(first.cost) : '', terms: (sup?.terms || 'credit') as SupplierTerms, paid: '', method: 'Cash', tax: '',
    now: !!inNow && rx.can, expected: todayISO(),
  })
  const [files, setFiles] = useState<Attachment[]>([])
  const purchaseRates = (db.taxRates || []).filter((r) => r.active && r.appliesTo !== 'sales' && r.rate > 0 && r.kind !== 'withholding')
  const product = byId(db.products, v.productId)
  const goods = num(v.qty) * num(v.rate)
  const tax = num(v.tax)
  const amount = goods + tax
  return (
    <FormSheet title="New purchase" crumb={preset ? preset.name : "Suppliers"} submit={v.now ? 'Save and receive' : 'Save, send to warehouse'} busyLabel="Saving…"
      note={v.now ? 'The goods go into warehouse stock now, checked in by you. On credit, the unpaid part is added to what we owe this supplier.'
        : `The goods wait under Warehouse → To receive until ${rx.who.length ? rx.who.slice(0, 3).join(', ') : 'an admin or warehouse manager'}${rx.who.length > 3 ? ' or another warehouse manager' : ''} counts them in. Only then are they in stock. On credit, the unpaid part is added to what we owe this supplier.`}
      onSubmit={async () => {
        if (!v.supplierId) return 'Add a supplier first.'
        if (!v.date) return 'Pick the bill date.'
        if (!v.now && v.expected && v.expected < v.date) return 'The goods cannot be due before the bill date.'
        if (!product) return 'Add the item first, under Products and stock.'
        if (!see.cost && !(product.cost > 0)) return 'This item has no cost yet. Ask someone who can see prices to record its first purchase.'
        const rate = see.cost ? num(v.rate) : product.cost
        if (num(v.qty) <= 0 || rate <= 0) return 'Enter the quantity and the rate.'
        if (tax < 0) return 'VAT cannot be negative.'
        const paid = !see.cost ? 0 : v.terms === 'cash' ? amount : num(v.paid)
        if (paid > amount) return `Paid now cannot be more than the bill of ${tk(amount)}.`
        const now = v.now && rx.can
        if (now && v.date > todayISO()) return 'Goods cannot be received on a future date. Untick “received now” or change the date.'
        const why = act('newPurchase', { supplierId: v.supplierId, billNo: v.billNo.trim() || 'PB-' + db.seq.pb, date: v.date, productId: v.productId, qty: num(v.qty), rate, terms: see.cost ? v.terms : 'credit', paid, method: v.method, tax: tax || undefined, attachments: files.length ? files : undefined, siteId: v.siteId || undefined, pending: !now, expected: now ? undefined : v.expected || undefined, by: rx.me })
        if (why) return why
        const saved = await saveNow()
        if (saved) return saved
        toast(now ? `${fmt(num(v.qty))} ${product.unit} added to stock` : `Bill saved. ${fmt(num(v.qty))} ${product.unit} waiting for the warehouse to check in`)
      }}>
      <Field label="Supplier" hint={(() => { const x = byId(db.suppliers, v.supplierId); return x ? [fullAddress(x), x.phone].filter(Boolean).join(' · ') || undefined : undefined })()}>
        <select {...bind('supplierId')}>
          {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city || s.area ? ` · ${s.city || s.area}` : ''}</option>)}
        </select>
      </Field>
      <Field label="Bill number"><input {...bind('billNo')} placeholder="e.g. PB-222" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <SitePicker db={db} bind={bind('siteId')} />
      {rx.can && (
        <label className="check field wide">
          <input type="checkbox" checked={v.now} onChange={(e) => set('now', e.target.checked)} />
          <span>The goods are here and counted — receive them into stock now<small className="t-muted"> (leave unticked to confirm later from To receive)</small></span>
        </label>
      )}
      {!v.now && <Field label="Goods expected on" hint="Shows as late in To receive after this day"><input type="date" min={v.date} {...bind('expected')} /></Field>}
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
