import { byId, fmt, num } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm } from '@/ui'

export interface NewLine {
  productId: string
  qty: number
  price: number
}

export function InvoiceLineSheet({ onAdd, taken = [] }: { onAdd: (line: NewLine) => void; taken?: string[] }) {
  const { db } = useBooks()
  const pool = db.products.filter((p) => p.kind === 'finished' && !p.archived && !taken.includes(p.id))
  const [v, set, , nbind] = useForm({ productId: pool[0]?.id || '', qty: '', price: pool[0] ? String(pool[0].price) : '' })
  const p = byId(db.products, v.productId)
  return (
    <FormSheet title="Add product to invoice" crumb="Sell to dealer" submit="Add to invoice"
      note={p ? `${fmt(p.stock)} ${p.unit} in warehouse.` : 'No more finished goods to add.'}
      onSubmit={() => {
        if (!p) return 'Choose a product.'
        if (num(v.qty) <= 0) return 'Enter the quantity.'
        if (num(v.qty) > p.stock) return `Only ${fmt(p.stock)} ${p.unit} in the warehouse.`
        if (num(v.price) <= 0) return 'Enter the dealer price.'
        onAdd({ productId: p.id, qty: num(v.qty), price: num(v.price) })
      }}>
      <Field label="Product" wide>
        <select className="in" value={v.productId} onChange={(e) => {
          set('productId', e.target.value)
          set('price', String(byId(db.products, e.target.value)?.price || ''))
        }}>
          {pool.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label={`Quantity${p ? ` (${p.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 5" /></Field>
      <Field label="Dealer price (Tk)"><input {...nbind('price')} placeholder="Filled from product" /></Field>
    </FormSheet>
  )
}
