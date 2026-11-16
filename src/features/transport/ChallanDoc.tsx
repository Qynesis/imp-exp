import { byId, driverOf, fdate, fmt, TRIP_PURPOSES, tripVehicleLabel, type Db, type Trip } from '@shared/domain'

/** Delivery challan: goes with the truck, signed by whoever receives the goods. No prices. */
export function ChallanDoc({ db, trip }: { db: Db; trip: Trip }) {
  const co = db.company
  const dealer = byId(db.dealers, trip.dealerId)
  const inv = byId(db.invoices, trip.invoiceId)
  const driver = driverOf(db, trip)
  const contact = [co.address, co.phone].filter(Boolean).join(' · ')
  return (
    <div className="invoice">
      <div className="inv-top">
        <div className="inv-brand">
          {co.logo && <img className="inv-logo" src={co.logo} alt="" />}
          <div>
            <div className="inv-co">{co.name || 'Your company'}</div>
            {contact && <div className="inv-muted">{contact}</div>}
          </div>
        </div>
        <div className="inv-right">
          <div className="inv-title">Delivery challan</div>
          <div className="inv-muted">{trip.id} · {fdate(trip.date)}</div>
          {inv && <div className="inv-muted">Against invoice {inv.id}</div>}
        </div>
      </div>
      <div className="inv-top">
        <div>
          <div className="inv-muted">From</div>
          <div className="inv-strong">{trip.from}</div>
          <div className="inv-muted" style={{ marginTop: 10 }}>To</div>
          <div className="inv-strong">{dealer?.name || trip.to}</div>
          {dealer && <div className="inv-muted">{[dealer.address, dealer.area, dealer.phone].filter(Boolean).join(' · ')}</div>}
          {!dealer && <div className="inv-muted">{TRIP_PURPOSES[trip.purpose]}</div>}
        </div>
        <div className="inv-right">
          <div className="inv-muted">Vehicle</div>
          <div className="inv-strong">{tripVehicleLabel(db, trip)}</div>
          {(driver.name || driver.phone) && <div className="inv-muted">Driver {[driver.name, driver.phone].filter(Boolean).join(' · ')}</div>}
          {driver.vehiclePhone && <div className="inv-muted">Vehicle phone {driver.vehiclePhone}</div>}
        </div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>Goods</th><th className="r">Quantity</th></tr></thead>
        <tbody>
          {inv ? inv.lines.map((l, i) => (
            <tr key={i}><td>{byId(db.products, l.productId)?.name || l.name}</td><td className="r">{fmt(l.qty)} {byId(db.products, l.productId)?.unit || l.unit}</td></tr>
          )) : <tr><td>{trip.load || 'As loaded'}</td><td className="r" /></tr>}
        </tbody>
      </table>
      {trip.note && <p className="inv-note">{trip.note}</p>}
      <p className="inv-note">Goods received in good condition and full quantity unless noted above.</p>
      <div className="inv-sign">
        <span>Driver</span>
        <span>Received by (name, signature, seal)</span>
        <span>For {co.name || 'the company'}</span>
      </div>
    </div>
  )
}
