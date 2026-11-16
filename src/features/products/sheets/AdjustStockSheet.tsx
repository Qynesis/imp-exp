import { ADJUST_REASONS, byId, fmt, num, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

type Mode = 'count' | 'remove' | 'add'

/** Correct the stock of one product and keep a record of why. */
export function AdjustStockSheet({ productId }: { productId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const p = byId(db.products, productId)
  const [v, set, bind, nbind] = useForm({ mode: 'count' as Mode, qty: '', reason: 'Stock count', date: todayISO(), note: '' })
  if (!p) return null
  const change = v.mode === 'count' ? num(v.qty) - p.stock : v.mode === 'remove' ? -num(v.qty) : num(v.qty)
  const filled = v.qty.trim() !== ''
  return (
    <FormSheet title="Adjust stock" crumb={p.name} submit="Save adjustment"
      onSubmit={() => {
        if (!filled) return v.mode === 'count' ? 'Enter how many you counted.' : 'Enter the quantity.'
        if (v.mode !== 'count' && num(v.qty) <= 0) return 'Enter a quantity above zero.'
        if (!change) return 'That matches the stock already. Nothing to change.'
        if (p.stock + change < 0) return `Only ${fmt(p.stock)} ${p.unit} in the warehouse.`
        act('adjustStock', { productId: p.id, qty: change, reason: v.reason, date: v.date || todayISO(), note: v.note.trim() })
        toast(`Stock of ${p.name} is now ${fmt(p.stock + change)} ${p.unit}`)
      }}>
      <div className="field wide">
        <Segmented label="Kind of adjustment" value={v.mode} onChange={(m) => { set('mode', m); set('reason', m === 'count' ? 'Stock count' : m === 'remove' ? 'Damaged' : 'Returned by dealer') }}
          options={[{ value: 'count', label: 'Counted' }, { value: 'remove', label: 'Take out' }, { value: 'add', label: 'Put back' }]} />
      </div>
      <Field label={v.mode === 'count' ? `Counted in warehouse (${p.unit})` : `Quantity (${p.unit})`}
        hint={`Books show ${fmt(p.stock)} ${p.unit}.` + (filled && change ? ` Change: ${change > 0 ? '+' : ''}${fmt(change)}, new stock ${fmt(p.stock + change)}.` : '')}>
        <input {...nbind('qty')} placeholder="0" />
      </Field>
      <Field label="Reason">
        <select {...bind('reason')}>{ADJUST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      </Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="e.g. 3 cartons wet in store room" /></Field>
    </FormSheet>
  )
}
