import { Barcode } from '@/components/barcode/Barcode'
import { byId, fdate, fmt, invoiceDelivery, type Db, type Delivery } from '@shared/domain'

/** The challan for one delivery: only what went this time, and what is still to come on the bill. */
export function DeliveryChallan({ db, x }: { db: Db; x: Delivery }) {
  const co = db.company
  const inv = byId(db.invoices, x.invoiceId)
  const dealer = byId(db.dealers, x.dealerId)
  const left = inv ? invoiceDelivery(db, inv).lines.filter((l) => l.remaining > 0) : []
  return (
    <div className="invoice">
      <div className="inv-top">
        <div className="inv-brand">
          {co.logo && <img className="inv-logo" src={co.logo} alt="" />}
          <div><div className="inv-co">{co.name || 'Your company'}</div><div className="inv-muted">{[co.address, co.phone].filter(Boolean).join(' · ')}</div></div>
        </div>
        <div className="inv-right"><div className="inv-title">Delivery challan</div><div className="inv-muted">{x.id} · {fdate(x.date)}</div><div className="inv-muted">Against bill {x.invoiceId}</div><Barcode className="inv-barcode" value={x.id} height={30} /></div>
      </div>
      <div className="inv-top">
        <div><div className="inv-muted">To</div><div className="inv-strong">{dealer?.name}</div><div className="inv-muted">{[dealer?.owner, dealer?.address, dealer?.area, dealer?.phone].filter(Boolean).join(' · ')}</div></div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>Goods delivered now</th><th className="r">Quantity</th></tr></thead>
        <tbody>{x.lines.map((l) => <tr key={l.productId}><td>{byId(db.products, l.productId)?.name}</td><td className="r">{fmt(l.qty)} {byId(db.products, l.productId)?.unit}</td></tr>)}</tbody>
      </table>
      {left.length > 0 && <p className="inv-note">Still to come on this bill: {left.map((l) => `${fmt(l.remaining)} ${l.unit} ${l.name}`).join(', ')}.</p>}
      {x.note && <p className="inv-note">{x.note}</p>}
      <div className="inv-sign"><span>Driver</span><span>Received by{x.receivedBy ? `: ${x.receivedBy}` : ''} (signature, seal)</span><span>For {co.name || 'the company'}</span></div>
    </div>
  )
}
