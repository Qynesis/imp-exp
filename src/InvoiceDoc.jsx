import { fdate, fmt, tk } from './lib/format.js'
import { byId, invSubtotal, invTotal } from './lib/selectors.js'

/** The printable invoice. Used for the live preview, for viewing old invoices and for printing. */
export default function InvoiceDoc({ db, inv }) {
  const dealer = byId(db.dealers, inv.dealerId)
  const co = db.company
  const subtotal = invSubtotal(inv)
  const total = invTotal(inv)
  const received = inv.received || 0
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
          <div className="inv-title">{inv.status === 'draft' ? 'Draft invoice' : 'Invoice'}</div>
          <div className="inv-muted">{inv.id} · {fdate(inv.date)}</div>
        </div>
      </div>
      <div className="inv-top">
        <div>
          <div className="inv-muted">Bill to</div>
          <div className="inv-strong">{dealer?.name || 'Choose a dealer'}</div>
          {dealer && <div className="inv-muted">{[dealer.address, dealer.area, dealer.phone].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="inv-right">
          <div className="inv-muted">Payment</div>
          <div className="inv-strong">{inv.terms === 'credit' ? `Credit · due in ${dealer?.days || 0} days` : 'Cash on delivery'}</div>
        </div>
      </div>
      <table className="inv-lines">
        <thead>
          <tr><th>Item</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => {
            const p = byId(db.products, l.productId)
            return (
              <tr key={i}>
                <td>{p?.name || l.name}</td>
                <td className="r">{fmt(l.qty)} {p?.unit || l.unit}</td>
                <td className="r">{fmt(l.price)}</td>
                <td className="r">{fmt(l.qty * l.price)}</td>
              </tr>
            )
          })}
          {!inv.lines.length && <tr><td colSpan={4} className="inv-muted">No products added yet</td></tr>}
        </tbody>
      </table>
      <div className="inv-sum">
        <div><span>Subtotal</span><span>{tk(subtotal)}</span></div>
        {inv.discount > 0 && <div><span>Discount</span><span>{tk(inv.discount)}</span></div>}
        <div className="total"><span>Total</span><span>{tk(total)}</span></div>
        <div><span>Paid</span><span>{tk(received)}</span></div>
        <div className="strong"><span>Due</span><span>{tk(total - received)}</span></div>
      </div>
      {co.invoiceNote && <p className="inv-note">{co.invoiceNote}</p>}
      <div className="inv-sign">
        <span>Received by</span>
        <span>Authorised signature</span>
      </div>
    </div>
  )
}
