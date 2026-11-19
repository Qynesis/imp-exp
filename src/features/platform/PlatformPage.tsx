import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { CompanySummary } from '@shared/api/contract'
import { PAY_METHODS, planById, STATUS_LABEL, type BillingPayment, type BillingSummary } from '@shared/billing'
import { BUSINESS_TYPES, fdate, fmt, plural } from '@shared/domain'
import { BRAND, POWERED_BY } from '@/config/brand'
import { ApiError } from '@/core/api/client'
import { useStore } from '@/core/store/context'
import { Button, Card, DataTable, Empty, Logo, Pill, Stat, useConfirm, useToast } from '@/ui'

/** The operator's view: every company on the platform, with a way into each one. */
export default function PlatformPage() {
  const { platform, openCompany, platformSignOut } = useStore()
  const toast = useToast()
  const [list, setList] = useState<CompanySummary[] | null>(null)
  const [q, setQ] = useState('')
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(
    () =>
      platform<{ companies: CompanySummary[] }>('GET', 'companies')
        .then((r) => setList(r.companies))
        .catch((e: unknown) => (e instanceof ApiError && e.status === 401 ? platformSignOut() : toast((e as Error).message))),
    [platform, platformSignOut, toast],
  )
  useEffect(() => {
    void load()
  }, [load])

  const saveReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!reset) return
    try {
      await platform('POST', 'password', reset)
      toast(`New password set for ${reset.email}`)
      setReset(null)
    } catch (ex) {
      toast((ex as Error).message)
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = (list || []).filter((c) => (c.name + ' ' + c.users.map((u) => u.email + ' ' + u.name).join(' ')).toLowerCase().includes(needle))
  const userCount = (list || []).reduce((s, c) => s + c.users.length, 0)
  const claimCount = (list || []).reduce((s, c) => s + (c.claims?.length || 0), 0)
  /** Show the new subscription state at once, without reloading every company. */
  const patch = (id: string, r: { billing: BillingSummary; claims: BillingPayment[] }) => setList((l) => (l || []).map((c) => (c.id === id ? { ...c, billing: r.billing, claims: r.claims } : c)))

  return (
    <div className="platform">
      <div className="platform-bar">
        <Logo height={56} />
        <Button variant="secondary" onClick={platformSignOut}>Sign out</Button>
      </div>
      <p className="powered-line">Powered by <b>{POWERED_BY}</b></p>
      <header className="page-head">
        <div className="page-title">
          <h1>All companies</h1>
          <p>You are signed in as the {BRAND} platform owner. Opening a company gives you full access to its books; each time is written to the audit log.</p>
        </div>
      </header>
      <div className="stats three">
        <Stat icon="grid" label="Companies" value={list ? list.length : '…'} />
        <Stat icon="users" label="Users" value={list ? userCount : '…'} />
        <Stat icon="card" label="Payments to approve" value={list ? claimCount : '…'} tone={claimCount ? 'warn' : undefined} sub={claimCount ? 'Check each transaction ID, then approve' : 'Nothing waiting'} />
      </div>
      <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, user or email" aria-label="Search companies" />
      {list && !shown.length && <Card><Empty>{list.length ? 'No company matches.' : 'No company has signed up yet.'}</Empty></Card>}
      {shown.map((c) => (
        <Card key={c.id} className="co-card" title={c.name}
          sub={`Joined ${fdate(c.createdAt.slice(0, 10))} · ${plural(c.counts.products, 'product')}, ${plural(c.counts.invoices, 'invoice')}, ${plural(c.counts.shipments, 'shipment')}${c.trades.length ? ' · ' + c.trades.map((t) => BUSINESS_TYPES[t]?.label).filter(Boolean).join(', ') : ''}`}
          action={<Button size="sm" onClick={() => void openCompany(c.id).catch((e: Error) => toast(e.message))}>Open books</Button>}>
          <CompanyBilling id={c.id} name={c.name} billing={c.billing} claims={c.claims || []} onChange={(r) => patch(c.id, r)} />
          <DataTable
            pageSize={25}
            rows={c.users}
            columns={[
              { label: 'User', primary: true, render: (u) => u.name },
              { label: 'Sign-in email', render: (u) => u.email },
              { label: 'Role', render: (u) => u.role },
              { label: '', align: 'right', render: (u) => <Button variant="secondary" size="sm" onClick={() => setReset({ email: u.email, password: '' })}>Reset password</Button> },
            ]}
          />
          {reset && c.users.some((u) => u.email === reset.email) && (
            <form className="card-body" onSubmit={(e) => void saveReset(e)} noValidate>
              <label className="field">
                <span className="field-label">New password for {reset.email}</span>
                <input className="in" type="text" autoComplete="off" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} placeholder="At least 8 characters" />
                <small>The user is signed out everywhere and must use this password from now on.</small>
              </label>
              <div className="btn-row">
                <Button type="submit">Set password</Button>
                <Button variant="secondary" onClick={() => setReset(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      ))}
    </div>
  )
}

const TONE = { trial: 'info', active: 'good', expired: 'warn', free: 'neutral' } as const

/** One company's subscription: status, "I paid" claims to approve, and manual changes. */
function CompanyBilling({ id, name, billing, claims, onChange }: { id: string; name: string; billing?: BillingSummary; claims: BillingPayment[]; onChange: (r: { billing: BillingSummary; claims: BillingPayment[] }) => void }) {
  const { platform } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const run = async (body: Record<string, unknown>, done: string) => {
    try {
      onChange(await platform<{ billing: BillingSummary; claims: BillingPayment[] }>('POST', 'billing', { tenantId: id, ...body }))
      toast(done)
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const extend = () => {
    const days = Number(window.prompt(`Give ${name} how many extra days?`, '7'))
    if (days > 0) void run({ action: 'extend', days }, `${days} days added for ${name}`)
  }
  const reject = (p: BillingPayment) => {
    const reason = window.prompt('Why is it rejected? The company sees this.', 'Payment not found')
    if (reason !== null) void run({ action: 'reject', paymentId: p.id, reason }, 'Payment rejected')
  }
  if (!billing) return null
  return (
    <div className="card-body pt0">
      <div className="btn-row">
        <Pill tone={TONE[billing.status]}>{STATUS_LABEL[billing.status]}</Pill>
        <span className="t-muted">
          {billing.status === 'free' ? 'Free, no end date' : `${billing.plan === 'trial' ? 'Trial' : planById(billing.plan)?.label + ' plan'} · ${billing.status === 'expired' ? 'ended' : 'until'} ${fdate(billing.until?.slice(0, 10))}${billing.status !== 'expired' ? ` · ${plural(billing.daysLeft, 'day')} left` : ''}`}
        </span>
        <Button size="sm" variant="secondary" onClick={extend}>Add days</Button>
        {billing.status === 'free'
          ? <Button size="sm" variant="ghost" onClick={() => void run({ action: 'unfree' }, `${name} is back on its paid plan`)}>End free access</Button>
          : <Button size="sm" variant="ghost" onClick={() => void confirm({ title: `Make ${name} free?`, message: 'They will never be asked to pay until you end free access.', confirmLabel: 'Make free' }).then((ok) => { if (ok) void run({ action: 'free' }, `${name} is free now`) })}>Make free</Button>}
      </div>
      {claims.map((p) => (
        <div key={p.id} className="alert-strip info">
          <div>
            <b>{PAY_METHODS[p.method]} ৳{fmt(p.amount)} for the {planById(p.plan)?.label.toLowerCase()} plan</b>
            <span>Transaction <b>{p.tranId}</b>{p.sender ? ` from ${p.sender}` : ''}{p.paidOn ? ` on ${fdate(p.paidOn)}` : ''} · sent by {p.by}{p.note ? ` · “${p.note}”` : ''}</span>
          </div>
          <Button size="sm" onClick={() => void run({ action: 'approve', paymentId: p.id }, `Approved: ${name} is on the ${planById(p.plan)?.label.toLowerCase()} plan`)}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => reject(p)}>Reject</Button>
        </div>
      ))}
    </div>
  )
}
