import { byId, todayISO, trips } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Close a trip as delivered, with who received the goods. */
export function DeliverSheet({ tripId }: { tripId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const t = byId(trips(db), tripId)
  const dealer = byId(db.dealers, t?.dealerId)
  const [v, , bind] = useForm({ date: todayISO(), receivedBy: dealer?.owner || '', note: '' })
  if (!t) return null
  return (
    <FormSheet title="Mark delivered" crumb={`Trip ${t.id}`} submit="Mark delivered"
      onSubmit={() => {
        act('setTripStatus', { id: t.id, status: 'done', date: v.date || todayISO(), receivedBy: v.receivedBy.trim(), deliveryNote: v.note.trim() })
        toast(`${t.id} delivered`)
      }}>
      <Field label="Delivered on"><input type="date" {...bind('date')} /></Field>
      <Field label="Received by" hint="Who signed the challan"><input {...bind('receivedBy')} placeholder="Name" /></Field>
      <Field label="Delivery note" wide><input {...bind('note')} placeholder="e.g. 2 cartons wet, taken back" /></Field>
    </FormSheet>
  )
}
