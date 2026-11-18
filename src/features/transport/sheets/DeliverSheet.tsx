import { byId, fmt, invoiceDelivery, todayISO, trips } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Close a trip as delivered, with who received the goods. */
export function DeliverSheet({ tripId }: { tripId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const t = byId(trips(db), tripId)
  const dealer = byId(db.dealers, t?.dealerId)
  const inv = byId(db.invoices, t?.invoiceId)
  const left = inv ? invoiceDelivery(db, inv) : null
  const [v, , bind] = useForm({ date: todayISO(), receivedBy: dealer?.owner || '', note: '', goods: 'all' })
  if (!t) return null
  return (
    <FormSheet title="Mark delivered" crumb={`Trip ${t.id}`} submit="Mark delivered"
      onSubmit={() => {
        act('setTripStatus', { id: t.id, status: 'done', date: v.date || todayISO(), receivedBy: v.receivedBy.trim(), deliveryNote: v.note.trim() })
        // the bill's goods leave stock with the trip, unless they are recorded separately
        if (inv && left && left.remainingUnits > 0 && v.goods === 'all') {
          act('recordDelivery', { invoiceId: inv.id, date: v.date || todayISO(), lines: left.lines.filter((l) => l.remaining > 0).map((l) => ({ productId: l.productId, qty: l.remaining })), via: 'own', tripId: t.id, receivedBy: v.receivedBy.trim(), note: v.note.trim() })
        }
        toast(`${t.id} delivered`)
      }}>
      <Field label="Delivered on"><input type="date" {...bind('date')} /></Field>
      <Field label="Received by" hint="Who signed the challan"><input {...bind('receivedBy')} placeholder="Name" /></Field>
      {inv && left && left.remainingUnits > 0 && (
        <Field label={`Goods on bill ${inv.id}`} hint={`${fmt(left.remainingUnits)} units still to deliver on this bill`}>
          <select {...bind('goods')}><option value="all">All of it went on this trip</option><option value="none">Record the goods separately (part delivery)</option></select>
        </Field>
      )}
      <Field label="Delivery note" wide><input {...bind('note')} placeholder="e.g. 2 cartons wet, taken back" /></Field>
    </FormSheet>
  )
}
