import { byId, fdate, fmt, foCalc, tk, type Db, type FactoryEstimate, type FactoryOrder, fullAddress } from '@shared/domain'

/** Company name and contact line at the top of every printed page. */
function Head({ db, title, sub }: { db: Db; title: string; sub: string }) {
  const co = db.company
  const contact = [co.address, co.phone].filter(Boolean).join(' · ')
  return (
    <div className="inv-top">
      <div className="inv-brand">
        {co.logo && <img className="inv-logo" src={co.logo} alt="" />}
        <div>
          <div className="inv-co">{co.name || 'Your company'}</div>
          {contact && <div className="inv-muted">{contact}</div>}
        </div>
      </div>
      <div className="inv-right">
        <div className="inv-title">{title}</div>
        <div className="inv-muted">{sub}</div>
      </div>
    </div>
  )
}

/** The estimate we send to a factory for approval before placing the order. */
export function EstimateDoc({ db, e }: { db: Db; e: FactoryEstimate }) {
  const f = byId(db.factories, e.factoryId)
  const p = byId(db.products, e.productId)
  return (
    <div className="invoice">
      <Head db={db} title="Order estimate" sub={`${e.id} · ${fdate(e.date)}`} />
      <div className="inv-top">
        <div>
          <div className="inv-muted">To</div>
          <div className="inv-strong">{f?.name || 'Factory'}</div>
          {f && <div className="inv-muted">{fullAddress(f)}</div>}
          {f && <div className="inv-muted">{[f.contact, f.phone, f.email].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="inv-right">
          <div className="inv-muted">{e.type === 1 ? 'We supply raw materials' : 'Factory supplies everything'}</div>
          {e.wanted && <div className="inv-strong">Wanted by {fdate(e.wanted)}</div>}
          {e.validUntil && <div className="inv-muted">Price valid until {fdate(e.validUntil)}</div>}
        </div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>Item</th><th className="r">Quantity</th><th className="r">{e.type === 1 ? 'Making charge' : 'Rate'}</th><th className="r">Amount</th></tr></thead>
        <tbody>
          <tr><td>{p?.name}</td><td className="r">{fmt(e.qty)} {p?.unit}</td><td className="r">{fmt(e.rate)}</td><td className="r">{fmt(e.qty * e.rate)}</td></tr>
        </tbody>
      </table>
      <div className="inv-sum"><div className="total"><span>Estimated total</span><span>{tk(e.qty * e.rate)}</span></div></div>
      {e.materials.length > 0 && (
        <>
          <p className="inv-note">Raw materials we will hand over:</p>
          <table className="inv-lines">
            <tbody>{e.materials.map((m) => <tr key={m.productId}><td>{byId(db.products, m.productId)?.name}</td><td className="r">{fmt(m.given)} {byId(db.products, m.productId)?.unit}</td></tr>)}</tbody>
          </table>
        </>
      )}
      {e.note && <p className="inv-note">{e.note}</p>}
      <p className="inv-note">Please confirm the quantity, rate and delivery date. The order is placed once you approve.</p>
      <div className="inv-sign"><span>Approved by (factory)</span><span>For {db.company.name || 'the company'}</span></div>
    </div>
  )
}

/** One lot's full money and delivery story, for printing or keeping on file. */
export function OrderStatementDoc({ db, o }: { db: Db; o: FactoryOrder }) {
  const c = foCalc(db, o)
  const moves = [
    ...o.payments.map((p) => ({ date: p.date, ts: p.ts, text: `${p.note || 'Payment'} · ${p.method}`, paid: p.amount, billed: 0 })),
    ...o.bills.map((b) => ({ date: b.date, ts: b.ts, text: `Bill ${b.billNo}`, paid: 0, billed: b.amount })),
  ].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1))
  // balance after each line: payments push it up, bills pull it down
  const rows = moves.map((m, i) => ({ ...m, bal: moves.slice(0, i + 1).reduce((s, x) => s + x.paid - x.billed, 0) }))
  return (
    <div className="invoice">
      <Head db={db} title="Payment history" sub={`${o.id} · printed ${fdate(new Date().toISOString().slice(0, 10))}`} />
      <div className="inv-top">
        <div>
          <div className="inv-muted">Factory</div>
          <div className="inv-strong">{c.factory?.name}</div>
          {c.factory && fullAddress(c.factory) && <div className="inv-muted">{fullAddress(c.factory)}</div>}
          <div className="inv-muted">{c.product?.name} · {fmt(o.qty)} {c.unit} at {tk(o.rate)} · placed {fdate(o.placed)}</div>
        </div>
        <div className="inv-right">
          <div className="inv-muted">Received</div>
          <div className="inv-strong">{fmt(c.received)} of {fmt(o.qty)} {c.unit}</div>
          {c.pending > 0 && <div className="inv-muted">{fmt(c.pending)} still due</div>}
        </div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>Date</th><th>Entry</th><th className="r">Paid</th><th className="r">Billed</th><th className="r">Balance</th></tr></thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={i}>
              <td>{fdate(m.date)}</td><td>{m.text}</td>
              <td className="r">{m.paid ? fmt(m.paid) : ''}</td><td className="r">{m.billed ? fmt(m.billed) : ''}</td>
              <td className="r">{m.bal > 0 ? `+${fmt(m.bal)}` : m.bal < 0 ? `−${fmt(-m.bal)}` : '0'}</td>
            </tr>
          ))}
          {!moves.length && <tr><td colSpan={5} className="inv-muted">No payments or bills yet.</td></tr>}
        </tbody>
      </table>
      <div className="inv-sum">
        <div><span>Order value</span><span>{tk(o.qty * o.rate)}</span></div>
        <div><span>Billed by factory</span><span>{tk(c.billed)}</span></div>
        <div><span>Paid by us</span><span>{tk(c.paid)}</span></div>
        <div className="total"><span>{c.balance > 0 ? 'Factory owes us' : c.balance < 0 ? 'We owe' : 'Balance'}</span><span>{tk(Math.abs(c.balance))}</span></div>
        <div><span>Still to bill</span><span>{tk(c.unbilled)}</span></div>
      </div>
      {o.receipts.length > 0 && (
        <>
          <p className="inv-note">Shipments received</p>
          <table className="inv-lines">
            <tbody>{o.receipts.map((r, i) => (
              <tr key={r.id}><td>{i + 1}. {fdate(r.date)}{r.challan ? ` · ${r.challan}` : ''}</td><td className="r">{fmt(r.qty)} {c.unit}</td><td className="r">{r.freight ? `freight ${fmt(r.freight)}` : ''}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <div className="inv-sign"><span>For {c.factory?.name || 'the factory'}</span><span>For {db.company.name || 'the company'}</span></div>
    </div>
  )
}
