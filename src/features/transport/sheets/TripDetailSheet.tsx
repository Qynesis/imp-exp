import { byId, driverOf, fdate, fmt, fshort, todayISO, tk, TRIP_PURPOSES, TRIP_STATUS, tripCalc, trips, tripVehicleLabel, type TripStatus } from '@shared/domain'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { PhoneLink } from '@/components/PhoneLink'
import { Button, Icon, Pill, Sheet, usePrint, useSheets, useToast, type SheetComponent } from '@/ui'
import { ChallanDoc } from '../ChallanDoc'
import { DeliverSheet } from './DeliverSheet'
import { PayTransporterSheet } from './PayTransporterSheet'
import { TransportCostSheet } from './TransportCostSheet'
import { TripSheet } from './TripSheet'
import { STATUS_TONE } from '../tripTone'

/** One trip: route, vehicle, load, status, and every cost. */
export const TripDetailSheet: SheetComponent<{ tripId: string }> = ({ tripId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const print = usePrint()
  const t = byId(trips(db), tripId)
  if (!t) return null
  const c = tripCalc(db, t)
  const canEdit = !accessGuard.readonly
  const setStatus = (status: TripStatus) => {
    act('setTripStatus', { id: t.id, status, date: todayISO() })
    toast(`${t.id}: ${TRIP_STATUS[status].toLowerCase()}`)
  }
  const dealer = byId(db.dealers, t.dealerId)
  const driver = driverOf(db, t)
  return (
    <Sheet title={`${t.from} → ${t.to}`} crumb={`Trip ${t.id}`} wide
      footer={canEdit ? (
        <>
          <Button variant="secondary" icon="edit" onClick={() => sheets.open(TripSheet, { tripId: t.id })}>Edit</Button>
          <Button variant="secondary" icon="plus" onClick={() => sheets.open(TransportCostSheet, { tripId: t.id })}>Add cost</Button>
          {c.hireDue > 0 && <Button variant="secondary" icon="wallet" onClick={() => sheets.open(PayTransporterSheet, { tripId: t.id })}>Pay hire</Button>}
          {t.status === 'planned' && <Button icon="truck" onClick={() => setStatus('on-the-way')}>Mark on the way</Button>}
          {t.status === 'on-the-way' && <Button icon="check" onClick={() => sheets.open(DeliverSheet, { tripId: t.id })}>Mark delivered</Button>}
          {t.status !== 'cancelled' && <Button variant="secondary" icon="print" onClick={() => print(<ChallanDoc db={db} trip={t} />)}>Challan</Button>}
        </>
      ) : <Button variant="secondary" icon="print" onClick={() => print(<ChallanDoc db={db} trip={t} />)}>Print challan</Button>}>
      <p className="t-muted tight">{TRIP_PURPOSES[t.purpose]} · {fdate(t.date)} · <Pill tone={STATUS_TONE[t.status]}>{TRIP_STATUS[t.status]}{t.doneOn ? ` ${fshort(t.doneOn)}` : ''}</Pill></p>
      <div className="mini-stats">
        <div>
          <span>Vehicle</span><b className="small-b">{tripVehicleLabel(db, t)}</b>
          {driver.name && <small className="t-muted">Driver {driver.name}</small>}
          <span className="phone-stack"><PhoneLink phone={driver.phone} label={`driver ${driver.name}`} />{driver.vehiclePhone && <PhoneLink phone={driver.vehiclePhone} label="the vehicle" />}</span>
        </div>
        <div><span>Trip cost</span><b>{tk(c.cost)}</b>{c.km != null && <small className="t-muted">{fmt(c.km)} km · {tk(c.cost / c.km)}/km</small>}</div>
        {t.hire && <div><span>Hire still to pay</span><b className={c.hireDue > 0 ? 't-warn' : 't-good'}>{c.hireDue > 0 ? tk(c.hireDue) : 'Paid'}</b><small className="t-muted">{tk(t.hire.fare)} agreed</small></div>}
      </div>
      {t.status === 'done' && (t.receivedBy || t.deliveryNote) && (
        <p className="trip-load"><Icon name="check" size={16} /> Received by {t.receivedBy || 'not recorded'}{t.doneOn ? ` on ${fdate(t.doneOn)}` : ''}{t.deliveryNote ? ` · ${t.deliveryNote}` : ''}</p>
      )}
      {t.load && <p className="trip-load"><Icon name="box" size={16} /> {t.load}</p>}
      {(dealer || t.invoiceId || t.orderId || t.shipmentId) && (
        <div className="chips trip-links">
          {dealer && <span className="chip static">Dealer: {dealer.name}</span>}
          {t.invoiceId && <span className="chip static">Invoice {t.invoiceId}</span>}
          {t.orderId && <button type="button" className="chip" onClick={() => go('factory-orders/' + t.orderId)}>Factory order {t.orderId} →</button>}
          {t.shipmentId && <button type="button" className="chip" onClick={() => go('imports/' + t.shipmentId)}>Shipment {t.shipmentId} →</button>}
        </div>
      )}
      <h3 className="sheet-h"><Icon name="wallet" size={17} />Costs</h3>
      <div className="rows flush">
        {c.costs.map((e) => (
          <div key={e.id} className="row">
            <span className="name normal">{e.transport?.kind}</span>
            <span className="meta">{fshort(e.date)} · {e.method}</span>
            <span className="amt">{tk(e.amount)}</span>
          </div>
        ))}
        {t.hire && c.hireDue > 0 && (
          <div className="row"><span className="name normal t-warn">Hire charge not paid yet</span><span className="meta">{t.hire.transporter}</span><span className="amt t-warn">{tk(c.hireDue)}</span></div>
        )}
        {!c.costs.length && !(t.hire && c.hireDue > 0) && <div className="row"><span className="meta">No costs recorded yet.</span></div>}
        <div className="row"><span className="name">Total</span><span className="meta" /><span className="amt">{tk(c.cost)}</span></div>
      </div>
      {t.note && <p className="t-muted">{t.note}</p>}
      {canEdit && t.status !== 'cancelled' && t.status !== 'done' && (
        <p className="sheet-aside"><button type="button" className="link t-warn" onClick={() => setStatus('cancelled')}>Cancel this trip</button></p>
      )}
    </Sheet>
  )
}
TripDetailSheet.readOnlySafe = true
