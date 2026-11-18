import { byId, fmt, invoiceDelivery, num, tk, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** The dealer no longer wants what is left on a bill: close it without delivering, with a credit if they paid or owe for it. */
export function CloseRestSheet({ invoiceId }: { invoiceId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const inv = byId(db.invoices, invoiceId)
  const d = inv ? invoiceDelivery(db, inv) : null
  const value = d ? d.lines.reduce((s, l) => s + l.remaining * l.price, 0) : 0
  const [v, , bind, nbind] = useForm({ date: todayISO(), credit: String(Math.round(value)), note: '' })
  if (!inv || !d) return null
  return (
    <FormSheet title="Close the rest of the bill" crumb={inv.id} submit="Close the rest"
      note="What is left will not be delivered. It stays in the warehouse, the bill stops waiting, and the credit comes off what the dealer owes (0 if nothing was charged for it)."
      onSubmit={() => {
        if (!v.note.trim()) return 'Say why the rest is not going, for the record.'
        const refused = act('closeRemainder', { invoiceId: inv.id, date: v.date || todayISO(), credit: num(v.credit), note: v.note.trim() })
        if (refused) return refused
        toast(`${inv.id} closed${num(v.credit) ? ` · ${tk(num(v.credit))} credited` : ''}`)
      }}>
      <div className="field wide">
        <span className="field-label">Not going</span>
        <div className="rows flush">
          {d.lines.filter((l) => l.remaining > 0).map((l) => <div key={l.productId} className="row"><span className="name normal">{l.name}</span><span className="meta">{tk(l.price)} each</span><span className="amt">{fmt(l.remaining)} {l.unit}</span></div>)}
        </div>
      </div>
      <Field label="Credit to the dealer (Tk)" hint={`Value of what is left ${tk(value)}`}><input {...nbind('credit')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Why" wide><input {...bind('note')} placeholder="e.g. dealer cancelled 30 cartons, market slow" /></Field>
    </FormSheet>
  )
}
