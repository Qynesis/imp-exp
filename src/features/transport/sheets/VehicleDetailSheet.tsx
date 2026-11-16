import { busyWith, byId, fdate, fmt, serviceDue, fshort, monthRange, paperState, PAPERS, todayISO, tk, transportExpenses, TRIP_STATUS, trips, VEHICLE_TYPES, vehicleStats, type PaperKey } from '@shared/domain'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Icon, Pill, Sheet, useConfirm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { STATUS_TONE } from '../tripTone'
import { TransportCostSheet } from './TransportCostSheet'
import { TripDetailSheet } from './TripDetailSheet'
import { TripSheet } from './TripSheet'
import { VehicleSheet } from './VehicleSheet'

/** Days left on a paper, as a pill. */
export function PaperPill({ date }: { date?: string }) {
  const s = paperState(date)
  if (s.state === 'missing') return <Pill tone="muted">Not set</Pill>
  if (s.state === 'expired') return <Pill tone="warn">Expired {fmt(-(s.days as number))} days ago</Pill>
  if (s.state === 'soon') return <Pill tone="warn">{s.days === 0 ? 'Runs out today' : `${s.days} days left`}</Pill>
  return <Pill tone="good">Valid to {fshort(date)}</Pill>
}

/** A vehicle: its papers, what it cost this month and before, and its recent trips. */
export const VehicleDetailSheet: SheetComponent<{ vehicleId: string }> = ({ vehicleId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const { close } = useSheetItem()
  const v = byId(db.vehicles || [], vehicleId)
  if (!v) return null
  const canEdit = !accessGuard.readonly
  const month = todayISO().slice(0, 7)
  const [from, to] = monthRange(month)
  const now = vehicleStats(db, v.id, from, to)
  const year = vehicleStats(db, v.id, `${todayISO().slice(0, 4)}-01-01`, to)
  const driver = byId(db.employees, v.driverId)?.name || v.driverName
  const recent = trips(db).filter((t) => t.vehicleId === v.id).slice(0, 8)
  const costs = transportExpenses(db).filter((e) => e.transport?.vehicleId === v.id).slice(-8).reverse()
  const archive = async () => {
    if (!(await confirm({ title: `Archive ${v.name}?`, message: 'It leaves the fleet list and trip booking. Its costs and trips stay in the books.', confirmLabel: 'Archive' }))) return
    act('archiveVehicle', { id: v.id, archived: true })
    toast(`${v.name} archived`)
    close()
  }
  return (
    <Sheet title={v.name} crumb={v.ownership === 'rented' ? 'Transport · rented vehicle' : 'Transport · our vehicle'} wide
      footer={!canEdit ? undefined : v.archived ? (
        <Button icon="restore" onClick={() => { act('archiveVehicle', { id: v.id, archived: false }); toast(`${v.name} is back in the fleet`) }}>Restore</Button>
      ) : (
        <>
          <Button variant="secondary" icon="edit" onClick={() => sheets.open(VehicleSheet, { vehicleId: v.id })}>Edit</Button>
          <Button variant="secondary" icon="plus" onClick={() => sheets.open(TransportCostSheet, { vehicleId: v.id })}>Add cost</Button>
          <Button icon="route" onClick={() => sheets.open(TripSheet, {})}>Book a trip</Button>
        </>
      )}>
      <p className="t-muted tight">
        {[v.regNo, VEHICLE_TYPES[v.type], v.capacity, v.ownership === 'rented' ? `Rented from ${v.owner}${v.monthlyRent ? ` · ${tk(v.monthlyRent)}/month` : ''}` : 'Our own'].filter(Boolean).join(' · ')}
      </p>
      <div className="contact-row">
        {driver && <span><Icon name="badge" size={16} /> Driver {driver}</span>}
        <PhoneLink phone={v.driverPhone || byId(db.employees, v.driverId)?.phone} label={`driver ${driver}`} />
        {v.phone && <span className="t-muted">Vehicle</span>}
        <PhoneLink phone={v.phone} label={`${v.name}`} />
        {(() => {
          const busy = busyWith(db, v.id)
          return busy
            ? <button type="button" className="chip" onClick={() => sheets.open(TripDetailSheet, { tripId: busy.id })}>Today: {busy.status === 'on-the-way' ? 'on the road' : 'booked'} · {busy.id} →</button>
            : <span className="chip static">Today: free</span>
        })()}
      </div>
      <div className="mini-stats">
        <div><span>Cost this month</span><b>{tk(now.cost)}</b><small className="t-muted">{fmt(now.trips)} trips{now.km ? ` · ${fmt(now.km)} km` : ''}</small></div>
        <div><span>Cost this year</span><b>{tk(year.cost)}</b><small className="t-muted">{fmt(year.trips)} trips</small></div>
        <div><span>Cost per km</span><b>{year.perKm ? tk(year.perKm) : 'Not known'}</b><small className="t-muted">{year.perKm ? 'This year, from trip odometers' : 'Enter odometer readings on trips'}</small></div>
        {year.lastOdometer && <div><span>Odometer</span><b>{fmt(year.lastOdometer)} km</b></div>}
      </div>
      {(() => {
        const s = serviceDue(db, v)
        if (!s) return null
        return (
          <>
            <h3 className="sheet-h"><Icon name="settings" size={17} />Servicing</h3>
            <div className="rows flush">
              <div className="row"><span className="name normal">Last service</span><span className="meta">{s.lastKm != null ? `${fmt(s.lastKm)} km` : ''}</span><span className="amt">{s.lastDate ? fdate(s.lastDate) : 'Not recorded'}</span></div>
              <div className="row">
                <span className="name normal">Next service</span>
                <span className="meta">{[v.serviceDays && `every ${v.serviceDays} days`, v.serviceKm && `every ${fmt(v.serviceKm)} km`].filter(Boolean).join(' or ')}</span>
                <span className="amt"><Pill tone={s.state === 'ok' ? 'good' : 'warn'}>
                  {!s.lastDate ? 'Record a service' : [s.daysLeft != null && (s.daysLeft < 0 ? `${-s.daysLeft} days late` : `in ${s.daysLeft} days`), s.kmLeft != null && (s.kmLeft < 0 ? `${fmt(-s.kmLeft)} km over` : `in ${fmt(s.kmLeft)} km`)].filter(Boolean).join(' · ')}
                </Pill></span>
              </div>
            </div>
          </>
        )
      })()}
      <h3 className="sheet-h"><Icon name="shield" size={17} />Papers</h3>
      <div className="rows flush">
        {(Object.keys(PAPERS) as PaperKey[]).map((k) => (
          <div key={k} className="row">
            <span className="name normal">{PAPERS[k]}</span>
            <span className="meta">{v.papers[k] ? fshort(v.papers[k]) : ''}</span>
            <span className="amt"><PaperPill date={v.papers[k]} /></span>
          </div>
        ))}
      </div>
      {year.byKind.length > 0 && (
        <>
          <h3 className="sheet-h"><Icon name="chart" size={17} />This year's costs</h3>
          <div className="rows flush">
            {year.byKind.map((k) => <div key={k.kind} className="row"><span className="name normal">{k.kind}</span><span className="meta" /><span className="amt">{tk(k.amount)}</span></div>)}
          </div>
        </>
      )}
      <h3 className="sheet-h"><Icon name="route" size={17} />Recent trips</h3>
      <div className="rows flush">
        {recent.map((t) => (
          <button key={t.id} type="button" className="row click" onClick={() => sheets.open(TripDetailSheet, { tripId: t.id })}>
            <span className="name normal">{t.from} → {t.to}</span>
            <span className="meta">{t.id} · {fshort(t.date)}</span>
            <span className="amt"><Pill tone={STATUS_TONE[t.status]}>{TRIP_STATUS[t.status]}</Pill></span>
          </button>
        ))}
        {!recent.length && <div className="row"><span className="meta">No trips yet.</span></div>}
      </div>
      <h3 className="sheet-h"><Icon name="wallet" size={17} />Latest costs</h3>
      <div className="rows flush">
        {costs.map((e) => (
          <div key={e.id} className="row">
            <span className="name normal">{e.transport?.kind}{e.transport?.tripId ? <small className="t-muted"> · {e.transport.tripId}</small> : null}</span>
            <span className="meta">{fshort(e.date)}{e.transport?.odometer ? ` · ${fmt(e.transport.odometer)} km` : ''}</span>
            <span className="amt">{tk(e.amount)}</span>
          </div>
        ))}
        {!costs.length && <div className="row"><span className="meta">No costs yet.</span></div>}
      </div>
      {canEdit && !v.archived && <p className="sheet-aside"><button type="button" className="link" onClick={() => void archive()}>Archive this vehicle</button><small className="t-muted"> · Sold or no longer used</small></p>}
    </Sheet>
  )
}
VehicleDetailSheet.readOnlySafe = true
