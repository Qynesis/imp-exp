import { activeVehicles, byId, num, todayISO, tk, TRANSPORT_COSTS, trips, type TransportCostKind } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Fuel, a repair, tolls or any other transport cost. Saved as a Transport expense, so the cashbook shows it. */
export function TransportCostSheet({ vehicleId, tripId, kind }: { vehicleId?: string; tripId?: string; kind?: TransportCostKind }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const trip = byId(trips(db), tripId)
  const fleet = activeVehicles(db)
  const [v, , bind, nbind] = useForm({
    kind: (kind || 'Fuel') as TransportCostKind, vehicleId: vehicleId || trip?.vehicleId || '', amount: '', method: 'Cash', date: todayISO(), odometer: '', details: '',
  })
  return (
    <FormSheet title="Add transport cost" crumb={trip ? `Trip ${trip.id}` : byId(fleet, v.vehicleId)?.name || 'Transport'} submit="Save cost"
      note="Saved in the cashbook as a Transport expense on the date you pick."
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount.'
        if (v.kind === 'Hire charge' && !trip?.hire) return 'Hire charges belong to a hired trip. Use Pay transporter.'
        act('addTransportCost', {
          date: v.date || todayISO(), amount, method: v.method, details: v.details.trim(),
          link: { kind: v.kind, vehicleId: v.vehicleId || undefined, tripId: trip?.id, transporter: v.kind === 'Hire charge' ? trip?.hire?.transporter : undefined, odometer: num(v.odometer) || undefined },
        })
        toast(`${v.kind} · ${tk(amount)} saved`)
      }}>
      <Field label="Cost"><select {...bind('kind')}>{TRANSPORT_COSTS.map((k) => <option key={k}>{k}</option>)}</select></Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      {!trip?.hire && (
        <Field label="Vehicle">
          <select {...bind('vehicleId')}>
            <option value="">Not for one vehicle</option>
            {fleet.map((x) => <option key={x.id} value={x.id}>{x.name}{x.regNo ? ` · ${x.regNo}` : ''}</option>)}
          </select>
        </Field>
      )}
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      {v.vehicleId && <Field label="Odometer (km)" hint="Optional. Helps track cost per km."><input {...nbind('odometer')} placeholder="e.g. 48250" /></Field>}
      <Field label="Details" wide><input {...bind('details')} placeholder={v.kind === 'Repair' ? 'e.g. clutch plate changed at Bahaddarhat' : 'Optional'} /></Field>
    </FormSheet>
  )
}
