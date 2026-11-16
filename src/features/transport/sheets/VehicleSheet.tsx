import { byId, num, PAPERS, VEHICLE_TYPES, type PaperKey, type VehicleOwnership, type VehicleType } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

/** Add a vehicle to the fleet, or edit one. Rented means hired by the month. */
export function VehicleSheet({ vehicleId, ownership = 'own' }: { vehicleId?: string; ownership?: VehicleOwnership }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.vehicles || [], vehicleId)
  const drivers = db.employees
  const [v, set, bind, nbind] = useForm(() => ({
    name: cur?.name || '', regNo: cur?.regNo || '', type: (cur?.type || 'truck') as VehicleType, capacity: cur?.capacity || '',
    ownership: (cur?.ownership || ownership) as VehicleOwnership, owner: cur?.owner || '', monthlyRent: cur?.monthlyRent ? String(cur.monthlyRent) : '',
    driverId: cur?.driverId || '', driverName: cur?.driverName || '', driverPhone: cur?.driverPhone || '', note: cur?.note || '',
    phone: cur?.phone || '', serviceKm: cur?.serviceKm ? String(cur.serviceKm) : '', serviceDays: cur?.serviceDays ? String(cur.serviceDays) : '',
    papers: { ...(cur?.papers || {}) } as Partial<Record<PaperKey, string>>,
  }))
  const rented = v.ownership === 'rented'
  return (
    <FormSheet title={cur ? 'Edit vehicle' : 'Add vehicle'} crumb="Transport" submit="Save vehicle" wide
      note={rented ? 'A vehicle hired by the month. Pay its rent as a transport cost. For a truck hired for a single trip, just book the trip.' : undefined}
      onSubmit={() => {
        const name = v.name.trim() || v.regNo.trim()
        if (!name) return 'Give the vehicle a name or its registration number.'
        if ((db.vehicles || []).some((x) => x.id !== cur?.id && x.regNo && x.regNo.toLowerCase() === v.regNo.trim().toLowerCase())) return `${v.regNo} is already in the fleet.`
        if (rented && !v.owner.trim()) return 'Say who the vehicle is rented from.'
        const papers = Object.fromEntries(Object.entries(v.papers).filter(([, d]) => d)) as Partial<Record<PaperKey, string>>
        act('saveVehicle', {
          id: cur?.id, name, regNo: v.regNo.trim(), type: v.type, capacity: v.capacity.trim(), ownership: v.ownership, owner: rented ? v.owner.trim() : '',
          monthlyRent: rented ? num(v.monthlyRent) : 0, driverId: v.driverId, driverName: v.driverId ? '' : v.driverName.trim(), driverPhone: v.driverPhone.trim(),
          phone: v.phone.trim(), serviceKm: num(v.serviceKm) || undefined, serviceDays: num(v.serviceDays) || undefined, papers, note: v.note.trim(), archived: cur?.archived,
        })
        toast(cur ? 'Vehicle saved' : `${name} added to the fleet`)
      }}>
      <div className="field wide">
        <Segmented<VehicleOwnership> label="Ownership" value={v.ownership} onChange={(o) => set('ownership', o)} options={[{ value: 'own', label: 'Our own vehicle' }, { value: 'rented', label: 'Rented by the month' }]} />
      </div>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. Truck 1" /></Field>
      <Field label="Registration number"><input {...bind('regNo')} placeholder="e.g. Chatta Metro-Ta 11-2345" /></Field>
      <Field label="Type"><select {...bind('type')}>{Object.entries(VEHICLE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Capacity"><input {...bind('capacity')} placeholder="e.g. 5 ton or 400 cartons" /></Field>
      {rented && <Field label="Rented from"><input {...bind('owner')} placeholder="Owner or agency" /></Field>}
      {rented && <Field label="Rent per month (Tk)"><input {...nbind('monthlyRent')} placeholder="0" /></Field>}
      <Field label="Driver">
        <select {...bind('driverId')}>
          <option value="">Outside driver (type the name)</option>
          {drivers.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
        </select>
      </Field>
      {!v.driverId && <Field label="Driver name"><input {...bind('driverName')} placeholder="Name" /></Field>}
      <Field label="Driver phone"><input {...bind('driverPhone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
      <Field label="Vehicle phone" hint="SIM kept in the cab, or the GPS tracker number"><input {...bind('phone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
      <Field label="Service every (km)" hint="Counted from the last Servicing cost"><input {...nbind('serviceKm')} placeholder="e.g. 5000" /></Field>
      <Field label="Service every (days)"><input {...nbind('serviceDays')} placeholder="e.g. 90" /></Field>
      <div className="field wide"><span className="field-label">Papers: expiry dates</span><small>You are warned 30 days before each runs out.</small></div>
      {(Object.keys(PAPERS) as PaperKey[]).map((k) => (
        <Field key={k} label={PAPERS[k]}>
          <input className="in" type="date" value={v.papers[k] || ''} onChange={(e) => set('papers', { ...v.papers, [k]: e.target.value })} />
        </Field>
      ))}
      <Field label="Note" wide><input {...bind('note')} placeholder="Optional" /></Field>
    </FormSheet>
  )
}
