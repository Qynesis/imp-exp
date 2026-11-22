import { useState } from 'react'
import { byId, DAY_STATUS, daysBetween, PLACE_KINDS, postingOf, transferRows, type WorkPlace, LEAVE_KINDS, LEAVE_STATUS, LEAVE_TONE, leaveDays, leaveList, JOB_EVENT_KINDS as EVENT_KINDS, employeeProfile, fdate, fmonth, fmt, PAY_TYPES, roleName, tk, tkShort, todayISO, type DayStatus, type EmployeeMonth } from '@shared/domain'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { CustomView } from '@/components/CustomFields'
import { PhoneLink } from '@/components/PhoneLink'
import { useBooks } from '@/core/store/context'
import { Button, DataTable, Icon, Pill, Progress, Segmented, useConfirm, useSheets, useToast, type IconName } from '@/ui'
import { LeaveBalanceTiles, LeaveDecisionSheet, LeaveRequestSheet } from './sheets/LeaveSheets'

type Tab = 'work' | 'days' | 'leave' | 'place' | 'pay' | 'history' | 'details'
const DAY_TONE: Record<DayStatus, 'good' | 'info' | 'warn' | 'neutral'> = { present: 'good', half: 'info', absent: 'warn', leave: 'neutral' }
const EVENT_ICON: Record<string, IconName> = { joined: 'plus', role: 'trend', pay: 'wallet', department: 'route', contract: 'receipt', note: 'edit', left: 'logout', rejoined: 'restore', transfer: 'pin' }

/**
 * Everything about one person: how they are doing, their days, what they are paid and still owed,
 * their job history and details. `self` is the person looking at their own profile (My work):
 * nothing to change, and the words speak to them.
 */
export function EmployeeProfileView({ employeeId, self, onRemoveEvent }: { employeeId: string; self?: boolean; onRemoveEvent?: (eventId: string) => void }) {
  const { db, leave } = useBooks()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('work')
  if (!db.employees.some((e) => e.id === employeeId)) return null
  const p = employeeProfile(db, employeeId)
  const e = p.employee
  const now = p.thisMonth
  const pay = e.payType
  const tracksDays = pay === 'daily' || p.attendance.length > 0
  const hit = now.target > 0 ? Math.round((now.sold / now.target) * 100) : null
  const months = [...p.months].reverse()
  const you = (a: string, b: string) => (self ? a : b)
  const contractShare = p.contract ? Math.round((p.contract.paid / Math.max(p.contract.amount, 1)) * 100) : 0
  const post = postingOf(db, e)
  const myMoves = transferRows(db).filter((t) => t.employeeId === e.id)
  const headOf = (w: WorkPlace) => { const h = db.employees.find((x) => x.id === w.headId); return { name: h?.name || w.headName || '', phone: h?.phone || w.phone } }
  const myLeave = leaveList(db, { employeeId })
  const pendingLeave = myLeave.filter((r) => r.status === 'pending').length
  const yearsHere = Math.max(0, Math.floor(daysBetween(e.joined, todayISO()) / 30.44))

  return (
    <div className="emp-profile">
      <div className="emp-head">
        <span className="emp-avatar" aria-hidden="true">{e.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
        <div className="emp-head-text">
          <b>{e.name}</b>
          <span>{[e.role, e.department].filter(Boolean).join(' · ') || (e.kind === 'worker' ? 'Worker' : 'Employee')}</span>
          {post.place && <span className="emp-where"><Icon name="pin" size={13} />{post.place.name}{post.place.region ? `, ${post.place.region}` : ''}{post.next ? ` → ${byId(db.workplaces || [], post.next.to)?.name} from ${fdate(post.next.date)}` : ''}</span>}
          <span className="emp-tags">
            <Pill tone={e.kind === 'worker' ? 'warn' : 'info'}>{e.kind === 'worker' ? 'Worker' : 'Staff'}</Pill>
            <Pill tone="neutral">{PAY_TYPES[pay]}</Pill>
            {e.status === 'left' ? <Pill tone="muted">Left {e.leftOn ? fdate(e.leftOn) : ''}</Pill> : <Pill tone="good">Working · {yearsHere >= 12 ? `${Math.floor(yearsHere / 12)} yr ${yearsHere % 12} mo` : `${yearsHere} mo`}</Pill>}
          </span>
        </div>
      </div>

      <div className="mini-stats">
        {pay === 'sales' && (
          <>
            <div><span>{you('You sold this month', 'Sold this month')}</span><b>{tk(now.sold)}</b><small className="t-muted">{now.bills} bill{now.bills === 1 ? '' : 's'}</small></div>
            <div><span>Target</span><b className={hit != null && hit >= 100 ? 't-good' : undefined}>{hit != null ? `${hit}%` : 'Not set'}</b>{now.target > 0 && <small className="t-muted">of {tkShort(now.target)}</small>}</div>
            <div><span>Commission earned</span><b>{tk(now.commission)}</b></div>
            <div><span>{you('Still to get', 'Still to pay')}</span><b className={now.toPay > 0 ? 't-warn' : 't-good'}>{now.toPay > 0 ? tk(now.toPay) : 'Paid'}</b></div>
          </>
        )}
        {pay === 'salary' && (
          <>
            <div><span>Monthly salary</span><b>{tk(e.salary)}</b></div>
            <div><span>Advance this month</span><b>{tk(now.advance)}</b></div>
            <div><span>Paid this month</span><b>{tk(now.paidSalary)}</b></div>
            <div><span>{you('Still to get', 'Still to pay')}</span><b className={now.toPay > 0 ? 't-warn' : 't-good'}>{now.toPay > 0 ? tk(now.toPay) : 'Settled'}</b></div>
          </>
        )}
        {pay === 'daily' && (
          <>
            <div><span>Days worked this month</span><b>{fmt(now.days)}</b><small className="t-muted">{now.absent} absent</small></div>
            <div><span>Daily wage</span><b>{tk(e.dailyRate || 0)}</b></div>
            <div><span>Earned this month</span><b>{tk(now.wages)}</b>{now.output > 0 && <small className="t-muted">{fmt(now.output)} pieces done</small>}</div>
            <div><span>{you('Still to get', 'Still to pay')}</span><b className={now.toPay > 0 ? 't-warn' : 't-good'}>{now.toPay > 0 ? tk(now.toPay) : 'Settled'}</b><small className="t-muted">after {tk(now.paidWages + now.advance)} paid</small></div>
          </>
        )}
        {pay === 'contract' && p.contract && (
          <>
            <div><span>Contract</span><b>{tk(p.contract.amount)}</b><small className="t-muted">{e.contract?.work}</small></div>
            <div><span>Period</span><b>{e.contract ? fdate(e.contract.start) : ''}</b><small className="t-muted">to {e.contract ? fdate(e.contract.end) : ''}</small></div>
            <div><span>Paid so far</span><b>{tk(p.contract.paid)}</b><small className="t-muted">{contractShare}% of the contract</small></div>
            <div><span>{you('Still to get', 'Still to pay')}</span><b className={p.contract.left > 0 ? 't-warn' : 't-good'}>{p.contract.left > 0 ? tk(p.contract.left) : 'Fully paid'}</b></div>
          </>
        )}
      </div>

      <Segmented<Tab> label="Profile section" value={tab} onChange={setTab}
        options={[
          { value: 'work', label: pay === 'sales' ? 'Sales' : 'Work' },
          ...(tracksDays ? [{ value: 'days' as const, label: 'Attendance' }] : []),
          { value: 'leave', label: pendingLeave ? `Leave (${pendingLeave})` : 'Leave' },
          { value: 'place', label: post.next ? 'Workplace (moving)' : 'Workplace' },
          { value: 'pay', label: you('My pay', 'Salary check') },
          { value: 'history', label: 'Job history' },
          { value: 'details', label: 'Details' },
        ]} />

      {tab === 'work' && pay === 'sales' && (
        <>
          <ColumnChart data={p.months.map((m) => ({ key: m.month, short: fmonth(m.month).slice(0, 3), long: fmonth(m.month), value: m.sold, line: m.target || null, extra: [['bills', fmt(m.bills)], ['collected', tkShort(m.collected)]] as [string, string][] }))}
            valueName="Sales" lineName={e.salesTarget ? 'Target' : undefined} format={tk} height={200} />
          <DataTable rows={months} rowKey={(m) => m.month}
            columns={[
              { label: 'Month', primary: true, render: (m) => fmonth(m.month) },
              { label: 'Sales', align: 'right', render: (m) => <b>{tk(m.sold)}</b> },
              { label: 'Bills', align: 'right', render: (m) => m.bills },
              { label: 'Collected', align: 'right', render: (m) => tk(m.collected) },
              { label: 'Target', align: 'right', render: (m) => (m.target ? <span className={m.sold >= m.target ? 't-good' : 't-warn'}>{Math.round((m.sold / m.target) * 100)}%</span> : '—') },
              { label: 'Commission', align: 'right', render: (m) => tk(m.commission) },
            ]} />
          <h3 className="sheet-h">{you('Dealers you handle', 'Dealers they handle')} ({p.dealers.length})</h3>
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
      )}

      {tab === 'work' && pay !== 'sales' && (
        <>
          {pay === 'contract' && p.contract && (
            <div className="emp-contract">
              <div><b>{e.contract?.work || 'Contract work'}</b><span className="t-muted">{e.contract ? `${fdate(e.contract.start)} – ${fdate(e.contract.end)}` : ''}</span></div>
              <Progress value={contractShare} />
              <span className="t-muted">{tk(p.contract.paid)} paid of {tk(p.contract.amount)}</span>
            </div>
          )}
          {tracksDays && (
            <ColumnChart data={p.months.map((m) => ({ key: m.month, short: fmonth(m.month).slice(0, 3), long: fmonth(m.month), value: m.days, extra: [['absent', String(m.absent)], ...(m.output ? [['done', fmt(m.output)] as [string, string]] : [])] as [string, string][] }))}
              valueName="Days worked" format={(n) => fmt(n)} height={180} />
          )}
          <h3 className="sheet-h">{you('What you did lately', 'Recent work')}</h3>
          <DataTable rows={p.attendance.filter((d) => d.work || d.output).slice(0, 12)} rowKey={(d) => d.id} empty={tracksDays ? 'No work written in the register yet.' : 'Work is written in the daily register. Nothing for this person yet.'}
            columns={[
              { label: 'Day', primary: true, render: (d) => <span className="nowrap">{fdate(d.date)}</span> },
              { label: 'Work done', render: (d) => d.work || '—' },
              { label: 'Done', align: 'right', render: (d) => (d.output ? fmt(d.output) : '') },
            ]} />
          <div className="kv-list boxed">
            <div className="kv"><span>Job</span><b>{e.role || '—'}</b></div>
            {e.note && <div className="kv"><span>Duties</span><b>{e.note}</b></div>}
          </div>
        </>
      )}

      {tab === 'days' && (
        <>
          <div className="mini-stats">
            <div><span>Days present (all time)</span><b>{fmt(p.totals.days)}</b></div>
            <div><span>Absent</span><b className={p.totals.absent ? 't-warn' : undefined}>{p.totals.absent}</b></div>
            <div><span>On leave</span><b>{p.totals.leave}</b></div>
            <div><span>Pieces done</span><b>{p.totals.output ? fmt(p.totals.output) : '—'}</b></div>
          </div>
          <div className="emp-days" aria-label="Last 60 days">
            {[...p.attendance].reverse().map((d) => <i key={d.id} className={`d-${d.status}`} title={`${fdate(d.date)} · ${DAY_STATUS[d.status]}${d.work ? ` · ${d.work}` : ''}`} />)}
          </div>
          <p className="t-muted tight emp-legend"><i className="d-present" /> Present <i className="d-half" /> Half day <i className="d-absent" /> Absent <i className="d-leave" /> Leave</p>
          <DataTable rows={p.attendance} rowKey={(d) => d.id} pageSize={15} empty="No days marked in the register yet."
            columns={[
              { label: 'Day', primary: true, render: (d) => <span className="nowrap">{fdate(d.date)}</span> },
              { label: 'Status', render: (d) => <Pill tone={DAY_TONE[d.status]}>{DAY_STATUS[d.status]}</Pill> },
              { label: 'Hours', align: 'right', render: (d) => d.hours ?? '' },
              { label: 'Work done', render: (d) => <span className="t-muted">{d.work}</span> },
              { label: 'Done', align: 'right', render: (d) => (d.output ? fmt(d.output) : '') },
            ]} />
        </>
      )}

      {tab === 'leave' && (
        <>
          <div className="leave-bar">
            <LeaveBalanceTiles employeeId={e.id} />
            {self && e.status !== 'left' && <Button icon="plus" onClick={() => sheets.open(LeaveRequestSheet, {})}>Apply for leave</Button>}
          </div>
          <DataTable rows={myLeave} rowKey={(r) => r.id} pageSize={10} onRow={self ? undefined : (r) => sheets.open(LeaveDecisionSheet, { id: r.id })}
            empty={self ? 'You have not asked for leave yet.' : 'No leave asked for yet.'}
            columns={[
              { label: 'Leave', primary: true, render: (r) => <span className="two-line"><b>{LEAVE_KINDS[r.kind]}</b><small className="t-muted">{r.half ? `Half day, ${fdate(r.from)}` : r.from === r.to ? fdate(r.from) : `${fdate(r.from)} – ${fdate(r.to)}`} · {fmt(leaveDays(r))} day{leaveDays(r) === 1 ? '' : 's'}</small></span> },
              { label: 'Reason', render: (r) => <span className="t-muted">{r.reason}</span> },
              { label: 'Status', render: (r) => <span className="two-line"><Pill tone={LEAVE_TONE[r.status]}>{LEAVE_STATUS[r.status]}</Pill>{r.answer && <small className="t-muted">“{r.answer}”{r.decidedBy ? ` — ${r.decidedBy}` : ''}</small>}</span> },
              ...(self ? [{ label: '', align: 'right' as const, render: (r: (typeof myLeave)[number]) => ((r.status === 'pending' || (r.status === 'approved' && r.from > todayISO())) ? (
                <Button size="sm" variant="secondary" onClick={async () => {
                  if (!(await confirm({ title: `Withdraw ${r.id}?`, message: r.status === 'approved' ? 'The approved days are taken off the register.' : 'The office will not see this request any more.', confirmLabel: 'Withdraw' }))) return
                  try { await leave({ op: 'cancel', id: r.id }); toast('Request withdrawn') } catch (x) { toast((x as Error).message) }
                }}>Withdraw</Button>
              ) : null) }] : []),
            ]} />
        </>
      )}

      {tab === 'place' && (
        <>
          {post.next && (() => {
            const w = byId(db.workplaces || [], post.next.to)
            const h = w ? headOf(w) : null
            return (
              <div className="move-banner">
                <Icon name="route" size={22} />
                <div>
                  <b>{you('You are transferred', 'Transferred')} to {w?.name || 'a new place'} from {fdate(post.next.date)}</b>
                  <span>{[post.next.orderNo && `Order ${post.next.orderNo}`, post.next.reason, post.next.newRole && `as ${post.next.newRole}`, post.next.allowance && `allowance ${tk(post.next.allowance)}`].filter(Boolean).join(' · ')}</span>
                  {w && <span>{[w.address, w.region].filter(Boolean).join(', ')}{h?.name ? ` · report to ${h.name}` : ''}{h?.phone ? ` (${h.phone})` : ''}</span>}
                  {post.next.note && <span className="t-muted">“{post.next.note}”</span>}
                </div>
              </div>
            )
          })()}
          {post.place ? (
            <div className="kv-list boxed">
              <div className="kv"><span>{you('You work at', 'Works at')}</span><b>{post.place.name}</b></div>
              <div className="kv"><span>Kind</span><b>{PLACE_KINDS[post.place.kind]}</b></div>
              <div className="kv"><span>Since</span><b>{fdate(post.since)}</b></div>
              {post.place.region && <div className="kv"><span>Region</span><b>{post.place.region}</b></div>}
              {post.place.area && <div className="kv"><span>{post.place.kind === 'region' ? 'Areas covered' : 'Area'}</span><b>{post.place.area}</b></div>}
              <div className="kv"><span>Address</span><b>{post.place.address || '—'}</b></div>
              <div className="kv"><span>In charge</span><b>{headOf(post.place).name || '—'}{headOf(post.place).phone && <> · <PhoneLink phone={headOf(post.place).phone} label={headOf(post.place).name || post.place.name} /></>}</b></div>
              {post.place.hours && <div className="kv"><span>Working hours</span><b>{post.place.hours}</b></div>}
              {post.place.note && <div className="kv"><span>Note</span><b>{post.place.note}</b></div>}
            </div>
          ) : <p className="t-muted">{you('Your workplace is not set yet.', 'No workplace set yet.')}</p>}
          <h3 className="sheet-h">{you('Your transfers', 'Transfers')}</h3>
          <DataTable rows={myMoves} rowKey={(t) => t.id} empty="No transfers yet."
            columns={[
              { label: 'From', primary: true, render: (t) => <span className="nowrap">{fdate(t.date)}</span> },
              { label: 'Move', render: (t) => <span>{t.fromPlace?.name || 'First posting'} <Icon name="arrowRight" size={13} /> <b>{t.toPlace?.name || '—'}</b></span> },
              { label: 'Order', render: (t) => <span className="two-line"><span>{t.orderNo || '—'}</span><small className="t-muted">{t.reason}</small></span> },
              { label: 'Status', align: 'right', render: (t) => (t.cancelled ? <Pill tone="muted">Cancelled</Pill> : t.upcoming ? <Pill tone="warn">Coming</Pill> : <Pill tone="good">Done</Pill>) },
            ]} />
        </>
      )}

      {tab === 'pay' && (
        <>
          <DataTable rows={months} rowKey={(m) => m.month}
            columns={[
              { label: 'Month', primary: true, render: (m) => fmonth(m.month) },
              ...payColumns(pay),
              { label: 'Still due', align: 'right', render: (m) => (pay === 'contract' ? '' : m.toPay > 0 ? <b className="t-warn">{tk(m.toPay)}</b> : <Pill tone="good">Settled</Pill>) },
            ]} />
          <h3 className="sheet-h">{you('Every payment to you', 'Every payment')}</h3>
          <DataTable rows={p.payments} rowKey={(x, i) => x.date + i} pageSize={10} empty="Nothing paid yet."
            columns={[
              { label: 'Date', primary: true, render: (x) => fdate(x.date) },
              { label: 'For', render: (x) => `${x.kind}${x.kind === 'Advance' || x.kind === 'Contract' ? '' : ` · ${fmonth(x.month)}`}` },
              { label: 'Paid by', render: (x) => <span className="t-muted">{x.method}</span> },
              { label: 'Amount', align: 'right', render: (x) => <b>{tk(x.amount)}</b> },
            ]} />
        </>
      )}

      {tab === 'history' && (
        <ol className="emp-timeline">
          {p.history.map((h) => (
            <li key={h.id} className={`ev-${h.kind}`}>
              <span className="emp-tl-dot"><Icon name={EVENT_ICON[h.kind] || 'edit'} size={14} /></span>
              <div>
                <small className="t-muted">{fdate(h.date)} · {EVENT_KINDS[h.kind]}</small>
                <b>{h.text}</b>
              </div>
              {onRemoveEvent && h.kind !== 'joined' && <button type="button" className="icon-btn" aria-label="Remove from history" onClick={() => onRemoveEvent(h.id)}><Icon name="trash" size={15} /></button>}
            </li>
          ))}
          {!p.history.length && <li className="t-muted">Joined {fdate(e.joined)} as {e.role || 'staff'}. Nothing else written yet.</li>}
        </ol>
      )}

      {tab === 'details' && (
        <div className="kv-list boxed">
          <div className="kv"><span>Job title</span><b>{e.role || '—'}</b></div>
          <div className="kv"><span>Department</span><b>{e.department || '—'}</b></div>
          <div className="kv"><span>Staff or worker</span><b>{e.kind === 'worker' ? 'Worker' : 'Employee (staff)'}</b></div>
          <div className="kv"><span>Pay</span><b>{payLine(e)}</b></div>
          {pay === 'sales' && <div className="kv"><span>Monthly target</span><b>{e.salesTarget ? tk(e.salesTarget) : 'Not set'}</b></div>}
          <div className="kv"><span>Joined</span><b>{fdate(e.joined)}</b></div>
          <div className="kv"><span>Phone</span><b>{e.phone ? <PhoneLink phone={e.phone} label={e.name} /> : '—'}</b></div>
          <div className="kv"><span>NID</span><b>{e.nid || '—'}</b></div>
          <div className="kv"><span>Emergency contact</span><b>{e.emergency || '—'}</b></div>
          <div className="kv"><span>Address</span><b>{e.address || '—'}</b></div>
          {(e.extra || []).map((x) => <div key={x.label} className="kv"><span>{x.label}</span><b>{x.value}</b></div>)}
          {!self && <div className="kv"><span>Signs in as</span><b>{p.login ? `${p.login.email} · ${roleName(db, p.login.roleId)}` : 'No login yet'}</b></div>}
          {e.note && <div className="kv"><span>Duties and notes</span><b>{e.note}</b></div>}
          <CustomView entity="employee" record={e} />
        </div>
      )}
    </div>
  )
}

const payLine = (e: { payType: string; salary: number; rate: number; commissionOn: string; dailyRate?: number; contract?: { amount: number; work: string } }) =>
  e.payType === 'sales' ? `${e.rate}% commission on ${e.commissionOn === 'collection' ? 'money collected' : 'sales'}`
    : e.payType === 'daily' ? `${tk(e.dailyRate || 0)} for each day worked`
      : e.payType === 'contract' ? `${tk(e.contract?.amount || 0)} contract${e.contract?.work ? ` · ${e.contract.work}` : ''}`
        : `${tk(e.salary)} a month`

function payColumns(pay: string) {
  type M = EmployeeMonth
  const r = 'right' as const
  if (pay === 'sales') return [{ label: 'Commission earned', align: r, render: (m: M) => tk(m.commission) }, { label: 'Paid', align: r, render: (m: M) => tk(m.paidCommission) }]
  if (pay === 'daily') return [
    { label: 'Days', align: r, render: (m: M) => fmt(m.days) },
    { label: 'Earned', align: r, render: (m: M) => tk(m.wages) },
    { label: 'Advance', align: r, render: (m: M) => (m.advance ? tk(m.advance) : '') },
    { label: 'Paid', align: r, render: (m: M) => tk(m.paidWages) },
  ]
  if (pay === 'contract') return [{ label: 'Paid on the contract', align: r, render: (m: M) => (m.paidContract ? tk(m.paidContract) : '—') }]
  return [
    { label: 'Salary', align: r, render: (m: M) => tk(m.salary) },
    { label: 'Advance', align: r, render: (m: M) => (m.advance ? tk(m.advance) : '') },
    { label: 'Paid', align: r, render: (m: M) => tk(m.paidSalary) },
  ]
}
