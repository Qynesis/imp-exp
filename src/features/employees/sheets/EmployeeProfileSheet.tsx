import { useState } from 'react'
import { daysBetween, employeeProfile, fdate, fmonth, fmt, roleName, tk, tkShort, todayISO } from '@shared/domain'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Pill, Segmented, Sheet, useSheets, type SheetComponent } from '@/ui'
import { EmployeeSheet } from './EmployeeSheet'

type Tab = 'work' | 'salary' | 'job'

/** One employee: how they are doing, what they are paid and still owed, and their job details. */
export const EmployeeProfileSheet: SheetComponent<{ employeeId: string }> = ({ employeeId }) => {
  const { db } = useBooks()
  const sheets = useSheets()
  const [tab, setTab] = useState<Tab>('work')
  if (!db.employees.some((e) => e.id === employeeId)) return null
  const p = employeeProfile(db, employeeId)
  const e = p.employee
  const now = p.thisMonth
  const sales = e.payType === 'sales'
  const canEdit = !accessGuard.readonly
  const hit = now.target > 0 ? Math.round((now.sold / now.target) * 100) : null
  return (
    <Sheet title={e.name} crumb={[e.role, e.department].filter(Boolean).join(' · ') || 'Employee'} wide
      footer={canEdit ? <Button variant="secondary" icon="edit" onClick={() => sheets.open(EmployeeSheet, { employeeId: e.id })}>Edit details</Button> : undefined}>
      <p className="t-muted tight"><PhoneLink phone={e.phone} label={e.name} /> · joined {fdate(e.joined)} · <Pill tone={sales ? 'info' : 'neutral'}>{sales ? `Sales basis · ${e.rate}% of ${e.commissionOn === 'collection' ? 'collection' : 'sales'}` : `Salary ${tk(e.salary)} a month`}</Pill></p>
      <div className="mini-stats">
        {sales ? (
          <>
            <div><span>Sold this month</span><b>{tk(now.sold)}</b><small className="t-muted">{now.bills} bill{now.bills === 1 ? '' : 's'}</small></div>
            <div><span>Target</span><b className={hit != null && hit >= 100 ? 't-good' : undefined}>{hit != null ? `${hit}%` : 'Not set'}</b>{now.target > 0 && <small className="t-muted">of {tkShort(now.target)}</small>}</div>
            <div><span>Collected</span><b>{tk(now.collected)}</b></div>
            <div><span>Commission earned</span><b>{tk(now.commission)}</b><small className={now.toPay > 0 ? 't-warn' : 't-muted'}>{now.toPay > 0 ? `${tk(now.toPay)} still to pay` : 'Paid'}</small></div>
          </>
        ) : (
          <>
            <div><span>Monthly salary</span><b>{tk(e.salary)}</b></div>
            <div><span>Advance this month</span><b>{tk(now.advance)}</b></div>
            <div><span>Paid this month</span><b>{tk(now.paidSalary)}</b></div>
            <div><span>Still to pay</span><b className={now.toPay > 0 ? 't-warn' : 't-good'}>{now.toPay > 0 ? tk(now.toPay) : 'Settled'}</b></div>
          </>
        )}
      </div>
      <Segmented<Tab> label="Profile section" value={tab} onChange={setTab} options={[{ value: 'work', label: sales ? 'Sales performance' : 'Work' }, { value: 'salary', label: 'Salary check' }, { value: 'job', label: 'Job details' }]} />

      {tab === 'work' && (sales ? (
        <>
          <ColumnChart data={p.months.map((m) => ({ key: m.month, short: fmonth(m.month).slice(0, 3), long: fmonth(m.month), value: m.sold, line: m.target || null, extra: [['bills', fmt(m.bills)], ['collected', tkShort(m.collected)]] as [string, string][] }))}
            valueName="Sales" lineName={e.salesTarget ? 'Target' : undefined} format={tk} height={200} />
          <DataTable rows={[...p.months].reverse()} rowKey={(m) => m.month}
            columns={[
              { label: 'Month', primary: true, render: (m) => fmonth(m.month) },
              { label: 'Sales', align: 'right', render: (m) => <b>{tk(m.sold)}</b> },
              { label: 'Bills', align: 'right', render: (m) => m.bills },
              { label: 'Collected', align: 'right', render: (m) => tk(m.collected) },
              { label: 'Target', align: 'right', render: (m) => (m.target ? <span className={m.sold >= m.target ? 't-good' : 't-warn'}>{Math.round((m.sold / m.target) * 100)}%</span> : '—') },
              { label: 'Commission', align: 'right', render: (m) => tk(m.commission) },
            ]} />
          <h3 className="sheet-h">Dealers they handle ({p.dealers.length})</h3>
          <DataTable rows={p.dealers} rowKey={(d) => d.id} pageSize={8} empty="No dealers assigned."
            columns={[
              { label: 'Dealer', primary: true, render: (d) => d.name },
              { label: 'Owes us', align: 'right', render: (d) => (d.due > 0 ? <b className={d.overdue ? 't-warn' : undefined}>{tk(d.due)}{d.overdue ? ' · overdue' : ''}</b> : <span className="t-muted">Settled</span>) },
            ]} />
          <h3 className="sheet-h">Recent bills</h3>
          <DataTable rows={p.recentBills} rowKey={(b) => b.id} empty="No bills yet."
            columns={[
              { label: 'Bill', primary: true, render: (b) => <span className="two-line"><b>{b.id}</b><small className="t-muted">{fdate(b.date)}</small></span> },
              { label: 'Dealer', render: (b) => b.dealer },
              { label: 'Amount', align: 'right', render: (b) => tk(b.amount) },
            ]} />
        </>
      ) : (
        <div className="kv-list boxed">
          <div className="kv"><span>Job</span><b>{e.role || '—'}</b></div>
          <div className="kv"><span>Department</span><b>{e.department || '—'}</b></div>
          <div className="kv"><span>Working here for</span><b>{Math.max(0, Math.floor(daysBetween(e.joined, todayISO()) / 30.44))} months</b></div>
          {e.note && <div className="kv"><span>Duties and notes</span><b>{e.note}</b></div>}
        </div>
      ))}

      {tab === 'salary' && (
        <>
          <DataTable rows={[...p.months].reverse()} rowKey={(m) => m.month}
            columns={[
              { label: 'Month', primary: true, render: (m) => fmonth(m.month) },
              ...(sales
                ? [{ label: 'Commission earned', align: 'right' as const, render: (m: (typeof p.months)[number]) => tk(m.commission) },
                  { label: 'Paid', align: 'right' as const, render: (m: (typeof p.months)[number]) => tk(m.paidCommission) }]
                : [{ label: 'Salary', align: 'right' as const, render: (m: (typeof p.months)[number]) => tk(m.salary) },
                  { label: 'Advance', align: 'right' as const, render: (m: (typeof p.months)[number]) => (m.advance ? tk(m.advance) : '') },
                  { label: 'Paid', align: 'right' as const, render: (m: (typeof p.months)[number]) => tk(m.paidSalary) }]),
              { label: 'Still due', align: 'right', render: (m) => (m.toPay > 0 ? <b className="t-warn">{tk(m.toPay)}</b> : <Pill tone="good">Settled</Pill>) },
            ]} />
          <h3 className="sheet-h">Every payment</h3>
          <DataTable rows={p.payments} rowKey={(x, i) => x.date + i} pageSize={10} empty="Nothing paid yet."
            columns={[
              { label: 'Date', primary: true, render: (x) => fdate(x.date) },
              { label: 'For', render: (x) => `${x.kind}${x.kind === 'Advance' ? '' : ` · ${fmonth(x.month)}`}` },
              { label: 'Paid by', render: (x) => <span className="t-muted">{x.method}</span> },
              { label: 'Amount', align: 'right', render: (x) => <b>{tk(x.amount)}</b> },
            ]} />
        </>
      )}

      {tab === 'job' && (
        <div className="kv-list boxed">
          <div className="kv"><span>Job title</span><b>{e.role || '—'}</b></div>
          <div className="kv"><span>Department</span><b>{e.department || '—'}</b></div>
          <div className="kv"><span>Pay</span><b>{sales ? `${e.rate}% commission on ${e.commissionOn === 'collection' ? 'money collected' : 'sales'}` : `${tk(e.salary)} a month`}</b></div>
          {sales && <div className="kv"><span>Monthly target</span><b>{e.salesTarget ? tk(e.salesTarget) : 'Not set'}</b></div>}
          <div className="kv"><span>Joined</span><b>{fdate(e.joined)}</b></div>
          <div className="kv"><span>Phone</span><b>{e.phone || '—'}</b></div>
          <div className="kv"><span>NID</span><b>{e.nid || '—'}</b></div>
          <div className="kv"><span>Emergency contact</span><b>{e.emergency || '—'}</b></div>
          <div className="kv"><span>Address</span><b>{e.address || '—'}</b></div>
          <div className="kv"><span>Signs in as</span><b>{p.login ? `${p.login.email} · ${roleName(db, p.login.roleId)}` : 'No login (add one in Settings → Users)'}</b></div>
          {e.note && <div className="kv"><span>Note</span><b>{e.note}</b></div>}
        </div>
      )}
    </Sheet>
  )
}
EmployeeProfileSheet.readOnlySafe = true
