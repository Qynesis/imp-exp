import { PAY_METHODS, planById, type BillingPayment } from '@shared/billing'
import { fdate, fmt, type Db } from '@shared/domain'
import { BRAND, POWERED_BY } from '@/config/brand'

/** Money receipt for a subscription payment. */
export function SubscriptionReceipt({ db, payment: p }: { db: Db; payment: BillingPayment }) {
  const plan = planById(p.plan)
  return (
    <div className="invoice">
      <div className="inv-top">
        <div className="inv-brand"><div><div className="inv-co">{POWERED_BY}</div><div className="inv-muted">{BRAND} software</div></div></div>
        <div className="inv-right">
          <div className="inv-title">Money receipt</div>
          <div className="inv-muted">{p.id} · {fdate((p.decidedAt || p.at).slice(0, 10))}</div>
        </div>
      </div>
      <div className="inv-top">
        <div>
          <div className="inv-muted">Received from</div>
          <div className="inv-strong">{db.company.name || 'Customer'}</div>
          <div className="inv-muted">{[db.company.address, db.company.phone].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="inv-right">
          <div className="inv-muted">Paid by</div>
          <div className="inv-strong">{PAY_METHODS[p.method]}{p.channel ? ` · ${p.channel}` : ''}</div>
          <div className="inv-muted">Transaction {p.tranId}</div>
        </div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>For</th><th className="r">Amount</th></tr></thead>
        <tbody>
          <tr><td>Software subscription: {plan?.label || p.plan} plan, {p.months} months</td><td className="r">Tk {fmt(p.amount)}</td></tr>
          <tr><td><b>Total received</b></td><td className="r"><b>Tk {fmt(p.amount)}</b></td></tr>
        </tbody>
      </table>
      <p className="inv-note">Thank you. This receipt was made by the software and needs no signature.</p>
    </div>
  )
}
