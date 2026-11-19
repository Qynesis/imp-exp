import { useCallback, useEffect, useState } from 'react'
import type { BillingView } from '@shared/api/contract'
import { PAY_METHODS, PLAN_FEATURES, PLANS, STATUS_LABEL, type BillingPayment, type Plan } from '@shared/billing'
import { fdate, fmt, isAdmin } from '@shared/domain'
import { BACKEND } from '@/core/api/client'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Pill, useConfirm, usePrint, useSheets, useToast } from '@/ui'
import { ClaimSheet } from './ClaimSheet'
import { SubscriptionReceipt } from './SubscriptionReceipt'

const taka = (n: number) => '৳' + fmt(n)
const day = (iso?: string | null) => (iso ? fdate(iso.slice(0, 10)) : '—')
const PAY_TONE: Record<BillingPayment['status'], 'good' | 'warn' | 'info' | 'neutral'> = { paid: 'good', pending: 'info', started: 'neutral', rejected: 'warn', failed: 'warn', cancelled: 'neutral' }
const PAY_STATUS: Record<BillingPayment['status'], string> = { paid: 'Paid', pending: 'Waiting for approval', started: 'Not completed', rejected: 'Rejected', failed: 'Failed', cancelled: 'Cancelled' }

/** Settings → Subscription: trial or plan status, the three plans, paying, and every payment so far. */
export function BillingTab({ outcome }: { outcome: string }) {
  const { db, session, call, setBilling } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const print = usePrint()
  const admin = isAdmin(db, session.userId)
  const [view, setView] = useState<BillingView | null>(null)
  const [busy, setBusy] = useState('')

  const take = useCallback((v: BillingView) => {
    setView(v)
    setBilling(v.summary)
  }, [setBilling])
  const load = useCallback(() => call<BillingView>('GET', 'billing').then(take).catch((e: Error) => toast(e.message)), [call, take, toast])
  useEffect(() => {
    void load()
  }, [load])
  // back from the payment gateway
  useEffect(() => {
    if (!outcome) return
    toast(outcome === 'paid' ? 'Payment received. Thank you, your plan is active.' : outcome === 'cancelled' ? 'Payment cancelled. Nothing was charged.' : 'The payment did not go through. You can try again or pay by bKash.')
    go('settings/billing')
  }, [outcome, toast])

  const payOnline = async (plan: Plan) => {
    if (!view) return
    setBusy(plan.id)
    try {
      const r = await call<{ url?: string; test?: boolean; tranId?: string; amount?: number }>('POST', 'billing/checkout', { plan: plan.id })
      if (r.url) {
        window.location.assign(r.url)
        return
      }
      if (r.test && r.tranId) {
        const ok = await confirm({
          title: `Test payment: ${taka(plan.price)}`,
          message: `${BACKEND === 'local' ? 'This copy runs in your browser, so' : 'Online payment is in test mode, so'} no money is taken. Pretend to pay for the ${plan.label.toLowerCase()} plan?`,
          confirmLabel: 'Pay (test)',
        })
        take(await call<BillingView>('POST', 'billing/test-pay', { tranId: r.tranId, result: ok ? 'paid' : 'cancelled' }))
        toast(ok ? `${plan.label} plan active (test payment)` : 'Payment cancelled')
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const s = view?.summary
  const pending = view?.payments.filter((p) => p.status === 'pending') || []
  return (
    <div className="stack">
      <div className="stats">
        <div className="card stat"><div className="stat-label">Status</div><div className="stat-value"><Pill tone={!s ? 'neutral' : s.status === 'expired' ? 'warn' : s.status === 'trial' ? 'info' : 'good'}>{s ? STATUS_LABEL[s.status].toUpperCase() : '…'}</Pill></div></div>
        <div className="card stat"><div className="stat-label">Current plan</div><div className="stat-value small">{!s ? '…' : s.plan === 'trial' ? 'Free trial' : s.plan === 'free' ? 'Free (no charge)' : PLANS.find((p) => p.id === s.plan)?.label}</div></div>
        <div className="card stat"><div className="stat-label">Access until</div><div className="stat-value small">{s?.status === 'free' ? 'No end date' : day(s?.until)}</div></div>
        <div className="card stat"><div className="stat-label">Days left</div><div className={cls('stat-value', s && s.status !== 'free' && s.daysLeft <= 3 && 't-warn')}>{!s ? '…' : s.status === 'free' ? '∞' : s.daysLeft}</div></div>
      </div>

      {pending.length > 0 && (
        <div className="alert-strip info" role="status"><div><b>Payment waiting for approval</b><span>{pending.map((p) => `${PAY_METHODS[p.method]} ${taka(p.amount)}, transaction ${p.tranId}`).join(' · ')}. Access is added as soon as it is checked, usually within a few hours.</span></div></div>
      )}
      {view?.test && <div className="alert-strip info" role="note"><div><b>Test payments</b><span>Pay online is simulated here and nothing is charged. {BACKEND === 'local' ? 'This copy keeps everything in your browser.' : 'Set up SSLCommerz on the server to take real payments.'}</span></div></div>}
      {!admin && <p className="t-muted">Only an admin of {db.company.name || 'this company'} can pay for a plan.</p>}

      <h2 className="dash-h">Choose a plan</h2>
      <div className="plan-grid">
        {PLANS.map((p) => (
          <section key={p.id} className={cls('card plan', p.popular && 'popular', s?.status === 'active' && s.plan === p.id && 'current')}>
            {p.badge && <span className="plan-badge">{p.badge}</span>}
            <div className="plan-name">{p.label}{s?.status === 'active' && s.plan === p.id && <Pill tone="good">Your plan</Pill>}</div>
            <div className="plan-price">{taka(p.price)}<small>/ {p.months} months</small></div>
            <div className="plan-per">≈ {taka(Math.round(p.price / p.months))} per month</div>
            <ul>{PLAN_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            {admin && (
              <>
                {view?.online && <Button block icon="card" className={cls(p.popular && 'pay-popular')} disabled={!!busy} onClick={() => void payOnline(p)}>{busy === p.id ? 'Opening payment…' : 'Pay online · bKash / Nagad / Card'}</Button>}
                <Button block variant="secondary" onClick={() => sheets.open(ClaimSheet, { planId: p.id, manual: view?.manual || {}, onDone: take })}>I paid by bKash / bank transfer</Button>
              </>
            )}
          </section>
        ))}
      </div>
      <p className="t-muted small-note">Paying before your access ends adds the new months after it, so no days are lost. Prices are in Taka and include everything; there is no limit on users or invoices.</p>

      <Card icon="receipt" title="Payment history">
        <DataTable pageSize={10} rows={view?.payments || []} rowKey={(p) => p.id} empty={view ? 'No payments yet.' : 'Loading…'}
          columns={[
            { label: 'Date', primary: true, render: (p) => day(p.at) },
            { label: 'Receipt', render: (p) => p.id },
            { label: 'Plan', render: (p) => PLANS.find((x) => x.id === p.plan)?.label || p.plan },
            { label: 'Method', render: (p) => <span className="two-line"><span>{PAY_METHODS[p.method]}{p.channel ? ` · ${p.channel}` : ''}</span><small className="t-muted">{p.tranId}</small></span> },
            { label: 'Amount', align: 'right', render: (p) => <b>{taka(p.amount)}</b> },
            { label: 'Status', align: 'right', render: (p) => <span className="two-line right"><Pill tone={PAY_TONE[p.status]}>{PAY_STATUS[p.status]}</Pill>{p.reason && <small className="t-warn">{p.reason}</small>}</span> },
            { label: '', align: 'right', render: (p) => (p.status === 'paid' ? <Button size="sm" variant="ghost" icon="print" onClick={() => print(<SubscriptionReceipt db={db} payment={p} />)}>Receipt</Button> : '') },
          ]} />
      </Card>
    </div>
  )
}
