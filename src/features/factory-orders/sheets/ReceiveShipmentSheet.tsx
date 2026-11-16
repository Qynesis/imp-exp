import { byId, fmt, foCalc, num, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function ReceiveShipmentSheet({ orderId }: { orderId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({ date: todayISO(), challan: '', qty: '', damaged: '', note: '' })
  const o = byId(db.factoryOrders, orderId)
  if (!o) return null
  const c = foCalc(db, o)
  return (
    <FormSheet title={`Receive shipment · ${o.id}`} crumb="Factory order" submit="Receive goods"
      note={`Still due from ${c.factory?.name}: ${fmt(c.pending)} of ${fmt(o.qty)} ${c.unit}. Whatever is not received now stays pending on this order.`}
      onSubmit={() => {
        const qty = num(v.qty)
        if (qty <= 0) return 'Enter the quantity received.'
        if (qty > c.pending) return `Only ${fmt(c.pending)} ${c.unit} are still pending on this order.`
        act('receiveShipment', { orderId, date: v.date, challan: v.challan.trim(), qty, damaged: num(v.damaged), note: v.note.trim() })
        toast(`${fmt(qty)} ${c.unit} added to stock`)
      }}>
      <Field label="Date received"><input type="date" {...bind('date')} /></Field>
      <Field label="Challan number"><input {...bind('challan')} placeholder="e.g. CH-320" /></Field>
      <Field label={`Good quantity received (${c.unit})`}><input {...nbind('qty')} placeholder={`Up to ${fmt(c.pending)}`} /></Field>
      <Field label="Damaged or rejected" hint="Recorded on the challan, not added to stock."><input {...nbind('damaged')} placeholder="0" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Optional" /></Field>
    </FormSheet>
  )
}
