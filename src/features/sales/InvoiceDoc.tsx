import { byId, fdate, fmt, invSubtotal, invTaxLines, invTotal, taxSettings, tk, type Db, type Invoice } from '@shared/domain'
import { Barcode } from '@/components/barcode/Barcode'

/** The printable invoice. Used for the live preview, for viewing old invoices and for printing. */
/** With `estimate`, the same page becomes a price estimate: no payment lines, and how long the prices hold. */
export function InvoiceDoc({ db, inv, estimate }: { db: Db; inv: Pick<Invoice, 'id' | 'status' | 'date' | 'dealerId' | 'terms' | 'lines' | 'discount' | 'received'> & { taxes?: Invoice['taxes'] }; estimate?: { validUntil: string; note: string } }) {
  const dealer = byId(db.dealers, inv.dealerId)
  const co = db.company
  const total = invTotal(inv)
  const received = inv.received || 0
  const contact = [co.address, co.phone].filter(Boolean).join(' · ')
  const tax = taxSettings(db)
  const taxLines = invTaxLines(inv)
  return (
    <div className="invoice">
      <div className="inv-top">
        <div className="inv-brand">
          {co.logo && <img className="inv-logo" src={co.logo} alt="" />}
          <div>
            <div className="inv-co">{co.name || 'Your company'}</div>
            {contact && <div className="inv-muted">{contact}</div>}
            {tax.taxNo && <div className="inv-muted">{tax.taxNoLabel}: {tax.taxNo}</div>}
          </div>
        </div>
        <div className="inv-right">
          <div className="inv-title">{estimate ? 'Estimate' : inv.status === 'draft' ? 'Draft invoice' : 'Invoice'}</div>
          <div className="inv-muted">{inv.id} · {fdate(inv.date)}</div>
          {inv.status === 'final' && !estimate && <Barcode className="inv-barcode" value={inv.id} height={30} />}
        </div>
      </div>
      <div className="inv-top">
        <div>
          <div className="inv-muted">{estimate ? 'For' : 'Bill to'}</div>
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
        <div><span>Subtotal</span><span>{tk(invSubtotal(inv))}</span></div>
        {inv.discount > 0 && <div><span>Discount</span><span>{tk(inv.discount)}</span></div>}
        {taxLines.map((t) => <div key={t.name}><span>{t.name}{t.inclusive ? ' (included)' : ''}</span><span>{tk(t.amount)}</span></div>)}
        <div className="total"><span>{estimate ? 'Estimated total' : 'Total'}</span><span>{tk(total)}</span></div>
        {!estimate && <div><span>Paid</span><span>{tk(received)}</span></div>}
        {!estimate && <div className="strong"><span>Due</span><span>{tk(total - received)}</span></div>}
      </div>
      {estimate && <p className="inv-note">{estimate.validUntil ? `Prices hold until ${fdate(estimate.validUntil)}. ` : ''}{estimate.note} Please confirm and we will send the bill.</p>}
      {co.invoiceNote && <p className="inv-note">{co.invoiceNote}</p>}
      <div className="inv-sign">
        <span>Received by</span>
        <span>Authorised signature</span>
      </div>
    </div>
  )
}
