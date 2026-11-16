import {
  activeVehicles, busyWith, byId, driverOf, fshort, num, todayISO, tk, transporters, TRIP_PURPOSES, TRIP_STATUS, trips, WAREHOUSE_PLACE,
  type TransportCostKind, type TripPurpose, type TripStatus,
} from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

type Mode = 'fleet' | 'hired'
interface Preset {
  tripId?: string
  purpose?: TripPurpose
  dealerId?: string
  invoiceId?: string
  orderId?: string
  shipmentId?: string
}

const COST_FIELDS: [TransportCostKind, string][] = [['Fuel', 'fuel'], ['Driver allowance', 'allowance'], ['Toll and parking', 'toll'], ['Loading and unloading', 'loading']]

/** Book a trip, or edit one. Our own (or monthly-rented) vehicle, or a truck hired just for this trip. */
export function TripSheet(preset: Preset) {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(trips(db), preset.tripId)
  const fleet = activeVehicles(db).concat(cur && cur.vehicleId && !activeVehicles(db).some((v) => v.id === cur.vehicleId) ? (db.vehicles || []).filter((v) => v.id === cur.vehicleId) : [])
  const order = byId(db.factoryOrders, preset.orderId || cur?.orderId)
  const ship = byId(db.imports, preset.shipmentId || cur?.shipmentId)
  const inv = byId(db.invoices, preset.invoiceId || cur?.invoiceId)
  const dealer0 = byId(db.dealers, preset.dealerId || cur?.dealerId || inv?.dealerId)
  const purpose0: TripPurpose = cur?.purpose || preset.purpose || (order || ship ? 'pickup' : 'delivery')
  const from0 = cur?.from ?? (order ? byId(db.factories, order.factoryId)?.name || '' : ship ? ship.customs?.port || 'Port' : WAREHOUSE_PLACE)
  const to0 = cur?.to ?? (purpose0 === 'delivery' ? [dealer0?.name, dealer0?.area].filter(Boolean).join(', ') : WAREHOUSE_PLACE)
  const known = transporters(db).map((t) => t.name)

  const [v, set, bind, nbind] = useForm(() => ({
    mode: (cur ? (cur.hire ? 'hired' : 'fleet') : fleet.length ? 'fleet' : 'hired') as Mode,
    purpose: purpose0, status: (cur?.status || 'planned') as TripStatus, date: cur?.date || todayISO(),
    vehicleId: cur?.vehicleId || fleet[0]?.id || '', from: from0, to: to0,
    dealerId: dealer0?.id || '', invoiceId: inv?.id || '', orderId: order?.id || '', shipmentId: ship?.id || '',
    load: cur?.load ?? (inv ? inv.lines.map((l) => `${l.qty} ${l.unit || ''}`.trim()).join(', ') : order ? `${order.qty} ${byId(db.products, order.productId)?.unit || ''} ${byId(db.products, order.productId)?.name || ''}`.trim() : ship ? `${ship.qty} ${ship.unit} ${ship.productName}` : ''),
    kmStart: cur?.kmStart != null ? String(cur.kmStart) : '', kmEnd: cur?.kmEnd != null ? String(cur.kmEnd) : '', note: cur?.note || '',
    transporter: cur?.hire?.transporter || '', vehicleNo: cur?.hire?.vehicleNo || '', driver: cur?.hire?.driver || '', phone: cur?.hire?.phone || '', fare: cur?.hire ? String(cur.hire.fare) : '',
    paidNow: '', fuel: '', allowance: '', toll: '', loading: '', method: 'Cash',
  }))
  const hired = v.mode === 'hired'
  const dealerInvoices = db.invoices.filter((i) => i.status === 'final' && i.dealerId === v.dealerId).slice(-12).reverse()
  const openOrders = db.factoryOrders.filter((o) => o.receipts.reduce((s, r) => s + r.qty, 0) < o.qty || o.id === v.orderId)
  const imports = db.imports.filter((s) => s.direction !== 'export' && (!s.steps.warehouse?.date || s.id === v.shipmentId))

  const pickDealer = (id: string) => {
    set('dealerId', id)
    set('invoiceId', '')
    const d = byId(db.dealers, id)
    if (d && v.purpose === 'delivery') set('to', [d.name, d.area].filter(Boolean).join(', '))
  }

  return (
    <FormSheet title={cur ? `Edit trip ${cur.id}` : 'Book a trip'} crumb="Transport" submit={cur ? 'Save trip' : 'Book trip'} wide
      onSubmit={() => {
        if (!v.from.trim() || !v.to.trim()) return 'Enter where the trip starts and ends.'
        if (!hired && !v.vehicleId) return 'Pick a vehicle, or switch to a hired vehicle.'
        if (hired && !v.transporter.trim()) return 'Enter who the vehicle is hired from.'
        if (hired && num(v.fare) <= 0) return 'Enter the agreed hire charge.'
        if (num(v.paidNow) > num(v.fare)) return `Paid now cannot be more than the hire charge of ${tk(num(v.fare))}.`
        if (v.kmStart && v.kmEnd && num(v.kmEnd) < num(v.kmStart)) return 'Odometer at the end is lower than at the start.'
        const costs = hired
          ? [{ kind: 'Hire charge' as const, amount: num(v.paidNow), method: v.method }, { kind: 'Loading and unloading' as const, amount: num(v.loading), method: v.method }]
          : COST_FIELDS.map(([kind, key]) => ({ kind, amount: num(v[key as 'fuel']), method: v.method }))
        act('saveTrip', {
          trip: {
            id: cur?.id, purpose: v.purpose, status: v.status, date: v.date || todayISO(), vehicleId: hired ? '' : v.vehicleId,
            hire: hired ? { transporter: v.transporter.trim(), vehicleNo: v.vehicleNo.trim(), driver: v.driver.trim(), phone: v.phone.trim(), fare: num(v.fare) } : undefined,
            from: v.from.trim(), to: v.to.trim(), dealerId: v.purpose === 'delivery' ? v.dealerId : '', invoiceId: v.purpose === 'delivery' ? v.invoiceId : '',
            orderId: v.purpose === 'pickup' ? v.orderId : '', shipmentId: v.purpose === 'pickup' ? v.shipmentId : '', load: v.load.trim(),
            kmStart: hired || !v.kmStart ? undefined : num(v.kmStart), kmEnd: hired || !v.kmEnd ? undefined : num(v.kmEnd),
            doneOn: v.status === 'done' ? cur?.doneOn || v.date : undefined, note: v.note.trim(),
          },
          costs: cur ? [] : costs,
        })
        toast(cur ? 'Trip saved' : `Trip TR-${db.seq.trip ?? 1001} booked`)
      }}>
      <div className="field wide">
        <Segmented<Mode> label="Vehicle" value={v.mode} onChange={(m) => set('mode', m)} options={[
          { value: 'fleet', label: 'Our vehicle', disabled: !fleet.length },
          { value: 'hired', label: 'Hire for this trip' },
        ]} />
      </div>
      <Field label="Purpose"><select {...bind('purpose')}>{Object.entries(TRIP_PURPOSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>

      {!hired ? (
        <Field label="Vehicle" wide>
          <select {...bind('vehicleId')}>
            {fleet.map((x) => {
              const busy = busyWith(db, x.id)
              return <option key={x.id} value={x.id}>{x.name}{x.regNo ? ` · ${x.regNo}` : ''}{x.ownership === 'rented' ? ' · rented' : ''}{x.capacity ? ` · ${x.capacity}` : ''}{busy && busy.id !== cur?.id ? ` · busy with ${busy.id}` : ''}</option>
            })}
          </select>
          {(() => {
            const dr = driverOf(db, { vehicleId: v.vehicleId })
            return dr.name || dr.phone ? <small>Driver {[dr.name, dr.phone].filter(Boolean).join(' · ')}{dr.vehiclePhone ? ` · vehicle ${dr.vehiclePhone}` : ''}</small> : null
          })()}
        </Field>
      ) : (
        <>
          <Field label="Hired from" hint="Transport agency, truck stand or owner">
            <input {...bind('transporter')} list="transporter-names" placeholder="e.g. Chattogram Transport Agency" />
            <datalist id="transporter-names">{known.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Hire charge (Tk)"><input {...nbind('fare')} placeholder="0" /></Field>
          <Field label="Vehicle number"><input {...bind('vehicleNo')} placeholder="e.g. Chatta Metro-Ta 14-1180" /></Field>
          <Field label="Driver"><input {...bind('driver')} placeholder="Name" /></Field>
          <Field label="Driver phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
        </>
      )}

      {v.purpose === 'delivery' && (
        <>
          <Field label="Dealer">
            <select className="in" value={v.dealerId} onChange={(e) => pickDealer(e.target.value)}>
              <option value="">Not for one dealer</option>
              {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.area ? ` · ${d.area}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Invoice">
            <select {...bind('invoiceId')} disabled={!v.dealerId}>
              <option value="">{v.dealerId ? 'No invoice' : 'Pick a dealer first'}</option>
              {dealerInvoices.map((i) => <option key={i.id} value={i.id}>{i.id} · {fshort(i.date)}</option>)}
            </select>
          </Field>
        </>
      )}
      {v.purpose === 'pickup' && (
        <>
          <Field label="Factory order">
            <select {...bind('orderId')}>
              <option value="">None</option>
              {openOrders.map((o) => <option key={o.id} value={o.id}>{o.id} · {byId(db.factories, o.factoryId)?.name}</option>)}
            </select>
          </Field>
          <Field label="Import shipment">
            <select {...bind('shipmentId')}>
              <option value="">None</option>
              {imports.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.productName}</option>)}
            </select>
          </Field>
        </>
      )}
      <Field label="From"><input {...bind('from')} placeholder="e.g. Our warehouse" /></Field>
      <Field label="To"><input {...bind('to')} placeholder="e.g. Rahman Traders, Agrabad" /></Field>
      <Field label="Load" wide><input {...bind('load')} placeholder="e.g. 40 cartons coil, 60 jars" /></Field>
      <Field label="Status"><select {...bind('status')}>{Object.entries(TRIP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {!hired && <Field label="Odometer at start (km)"><input {...nbind('kmStart')} placeholder="Optional" /></Field>}
      {!hired && <Field label="Odometer at end (km)"><input {...nbind('kmEnd')} placeholder="Optional" /></Field>}

      {!cur && (
        <>
          <div className="field wide"><span className="field-label">{hired ? 'Paid now' : 'Trip costs paid now'}</span><small>Each one is saved in the cashbook as a Transport expense. Add more later from the trip.</small></div>
          {hired ? (
            <>
              <Field label="Hire paid now (Tk)" hint={num(v.fare) ? `${tk(Math.max(num(v.fare) - num(v.paidNow), 0))} left to pay` : undefined}><input {...nbind('paidNow')} placeholder="0" /></Field>
              <Field label="Loading and unloading (Tk)"><input {...nbind('loading')} placeholder="0" /></Field>
            </>
          ) : (
            <>
              <Field label="Fuel (Tk)"><input {...nbind('fuel')} placeholder="0" /></Field>
              <Field label="Driver allowance (Tk)"><input {...nbind('allowance')} placeholder="0" /></Field>
              <Field label="Toll and parking (Tk)"><input {...nbind('toll')} placeholder="0" /></Field>
              <Field label="Loading and unloading (Tk)"><input {...nbind('loading')} placeholder="0" /></Field>
            </>
          )}
          <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
        </>
      )}
      <Field label="Note" wide><input {...bind('note')} placeholder="Optional" /></Field>
    </FormSheet>
  )
}
