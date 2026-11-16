import { byId, fmt, fshort, num, todayISO, tk, transporters, trips } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Pay a transport agency or truck owner for hired trips. Paying against one trip settles that trip first. */
export function PayTransporterSheet({ transporter, tripId, crumb = 'Transport' }: { transporter?: string; tripId?: string; crumb?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const list = transporters(db)
  const trip = byId(trips(db), tripId)
  const first = trip?.hire?.transporter || transporter || list.find((t) => t.due > 0)?.name || list[0]?.name || ''
  const row = (name: string) => list.find((t) => t.name === name)
  const dueOf = (name: string, id: string) => (id ? row(name)?.open.find((o) => o.trip.id === id)?.due || 0 : row(name)?.due || 0)
  const [v, set, bind, nbind] = useForm({ transporter: first, tripId: trip?.id || '', amount: String(dueOf(first, trip?.id || '') || ''), method: 'Cash', date: todayISO() })
  const r = row(v.transporter)
  const due = dueOf(v.transporter, v.tripId)
  return (
    <FormSheet title="Pay transporter" crumb={crumb} submit="Save payment"
      note={r ? `${fmt(r.trips)} hired trip${r.trips === 1 ? '' : 's'} · ${tk(r.fare)} agreed · ${tk(r.paid)} paid · ${tk(r.due)} due` : 'No hired trips yet. Book a trip with a hired vehicle first.'}
      onSubmit={() => {
        const amount = num(v.amount)
        if (!v.transporter) return 'Pick the transporter.'
        if (amount <= 0) return 'Enter the amount.'
        if (amount > due + 0.5) return `Only ${tk(due)} is due${v.tripId ? ' on this trip' : ''}.`
        act('addTransportCost', { date: v.date || todayISO(), amount, method: v.method, details: '', link: { kind: 'Hire charge', transporter: v.transporter, tripId: v.tripId || undefined } })
        toast(`${tk(amount)} paid to ${v.transporter}`)
      }}>
      <Field label="Transporter">
        <select className="in" value={v.transporter} onChange={(e) => { set('transporter', e.target.value); set('tripId', ''); set('amount', String(dueOf(e.target.value, '') || '')) }}>
          {list.map((t) => <option key={t.name} value={t.name}>{t.name}{t.due ? ` · ${tk(t.due)} due` : ''}</option>)}
        </select>
      </Field>
      <Field label="For trip">
        <select className="in" value={v.tripId} onChange={(e) => { set('tripId', e.target.value); set('amount', String(dueOf(v.transporter, e.target.value) || '')) }}>
          <option value="">All dues, oldest first</option>
          {r?.open.map((o) => <option key={o.trip.id} value={o.trip.id}>{o.trip.id} · {fshort(o.trip.date)} · {o.trip.to} · {tk(o.due)}</option>)}
        </select>
      </Field>
      <Field label="Amount (Tk)" hint={due ? `${tk(due)} due` : 'Nothing due'}><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
    </FormSheet>
  )
}
