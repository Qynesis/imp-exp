import { byId, fmt, foCalc, num, todayISO, tk } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Increase or reduce an order (or change its rate) while the factory is still working on it. */
export function AmendOrderSheet({ orderId }: { orderId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const o = byId(db.factoryOrders, orderId)
  const [v, , bind, nbind] = useForm({ qty: o ? String(o.qty) : '', rate: o ? String(o.rate) : '', date: todayISO(), reason: '' })
  if (!o) return null
  const c = foCalc(db, o)
  const qty = num(v.qty)
  const rate = num(v.rate)
  const diff = qty - o.qty
  return (
    <FormSheet title="Change order" crumb={o.id} submit="Save change"
      note={`Now ${fmt(o.qty)} ${c.unit} at ${tk(o.rate)}. ${fmt(c.received)} already received, so the order cannot go below that.`}
      onSubmit={() => {
        if (qty <= 0 || rate <= 0) return 'Enter the new quantity and rate.'
        if (qty < c.received) return `${fmt(c.received)} ${c.unit} have already arrived. The order cannot be less than that.`
        if (qty === o.qty && rate === o.rate) return 'Nothing changed.'
        if (!v.reason.trim()) return 'Say why the order changed, for the record.'
        act('amendOrder', { orderId: o.id, qty, rate, date: v.date || todayISO(), reason: v.reason.trim() })
        toast(`${o.id} changed to ${fmt(qty)} ${c.unit}`)
      }}>
      <Field label={`New quantity (${c.unit})`} hint={diff ? `${diff > 0 ? 'Up' : 'Down'} by ${fmt(Math.abs(diff))}` : undefined}><input {...nbind('qty')} /></Field>
      <Field label="Rate per unit (Tk)" hint={qty && rate ? `Order value ${tk(qty * rate)} (was ${tk(o.qty * o.rate)})` : undefined}><input {...nbind('rate')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Reason" wide><input {...bind('reason')} placeholder="e.g. dealer demand up for Eid, factory agreed 20 more" /></Field>
    </FormSheet>
  )
}
