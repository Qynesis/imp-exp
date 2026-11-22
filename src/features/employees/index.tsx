import { useCallback, useMemo, useState } from 'react'
import { byId, DAY_STATUS, PLACE_KINDS, placeRows, postingOf, transferRows, unposted, type PlaceKind, DAY_WEIGHT, fdate, LEAVE_KINDS, LEAVE_STATUS, LEAVE_TONE, leaveDays, leaveList, type LeaveKind, fmonth, fmt, num, payrollFor, plural, SALARY_ADVANCE, staffRows, thisMonth, tk, todayISO, type DayStatus, type StaffRow } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { PhoneLink } from '@/components/PhoneLink'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { AddExpenseSheet } from '@/features/cashbook/sheets/AddExpenseSheet'
import { Button, Card, cls, DataTable, Pill, Segmented, Stat, useSheets, useToast, SearchBox, Icon, useConfirm, type IconName, usePaged } from '@/ui'
import { EmployeeSheet } from './sheets/EmployeeSheet'
import { EmployeeProfileSheet } from './sheets/EmployeeProfileSheet'
import { PayrollSheet } from './sheets/PayrollSheet'
import { LeaveDecisionSheet, LeaveRequestSheet } from './sheets/LeaveSheets'
import { PlaceDetailSheet, PlaceSheet, StaffTransferSheet } from './sheets/PlaceSheets'

type Tab = 'people' | 'register' | 'leave' | 'places' | 'payroll'
const TABS: Tab[] = ['people', 'register', 'leave', 'places', 'payroll']
const DAY_TONE: Record<DayStatus, 'good' | 'info' | 'warn' | 'neutral'> = { present: 'good', half: 'info', absent: 'warn', leave: 'neutral' }
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('')

/** #/employees[/people|register|payroll]: everyone on the books, the daily register, and pay. */
export default function EmployeesPage({ params: [t] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const tab: Tab = TABS.includes(t as Tab) ? (t as Tab) : 'people'
  const today = todayISO()
  const rows = staffRows(db, today, tk)
  const active = rows.filter((r) => !r.left)
  const pr = payrollFor(db, thisMonth())
  const marked = active.filter((r) => r.today)
  const present = marked.filter((r) => r.today && DAY_WEIGHT[r.today.status] > 0).length
  const canEdit = !accessGuard.readonly
  const pendingLeave = (db.leaveRequests || []).filter((r) => r.status === 'pending').length
  return (
    <>
      <PageHead title="Employees and workers" sub="Everyone who works for the company: their details, daily attendance and work, and pay."
        actions={canEdit && (
          <>
            <Button icon="plus" variant="secondary" onClick={() => sheets.open(EmployeeSheet, { kind: 'worker' })}>Add worker</Button>
            <Button icon="plus" onClick={() => sheets.open(EmployeeSheet, { kind: 'staff' })}>Add employee</Button>
          </>
        )} />
      <div className="stats">
        <Stat icon="badge" label="Employees (staff)" value={fmt(active.filter((r) => r.kind === 'staff').length)} sub={`${active.filter((r) => r.hasLogin).length} can sign in`} href="#/employees/people" />
        <Stat icon="users" label="Workers" value={fmt(active.filter((r) => r.kind === 'worker').length)} sub={`${active.filter((r) => r.e.payType === 'daily').length} daily · ${active.filter((r) => r.e.payType === 'contract').length} contract`} href="#/employees/people" />
        <Stat icon="calendar" label="Present today" value={marked.length ? `${present} / ${marked.length}` : 'Not marked'} sub={marked.length ? `${fdate(today)}` : 'Open the daily register'} tone={marked.length ? undefined : 'warn'} href="#/employees/register" />
        <Stat icon="wallet" label="Still to pay this month" value={tk(pr.salaryToPay + pr.commissionToPay + pr.wagesToPay)} sub={pr.contractToPay ? `+ ${tk(pr.contractToPay)} on contracts` : `${fmonth(thisMonth())}`} href="#/employees/payroll" />
      </div>
      <Segmented<Tab> label="Employees section" value={tab} onChange={(x) => go('employees/' + x)}
        options={[{ value: 'people', label: `People (${active.length})` }, { value: 'register', label: 'Daily register' }, { value: 'leave', label: pendingLeave ? `Leave (${pendingLeave} new)` : 'Leave' }, { value: 'places', label: 'Places and transfers' }, { value: 'payroll', label: 'Pay' }]} />
      {tab === 'people' && <People rows={rows} />}
      {tab === 'register' && <Register />}
      {tab === 'leave' && <Leave />}
      {tab === 'places' && <Places />}
      {tab === 'payroll' && <Payroll />}
    </>
  )
}

function People({ rows }: { rows: StaffRow[] }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [place, setPlace] = useState('')
  const at = useCallback((r: StaffRow) => postingOf(db, r.e), [db])
  const [show, setShow] = useState<'all' | 'staff' | 'worker' | 'left'>('all')
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter((r) => (show === 'left' ? r.left : !r.left && (show === 'all' || r.kind === show)) && (!place || (place === '-' ? !at(r).place : at(r).place?.id === place))
      && (!n || `${r.e.name} ${r.e.role} ${r.e.department} ${r.e.phone} ${at(r).place?.name || ''}`.toLowerCase().includes(n)))
  }, [rows, show, q, place, at])
  return (
    <Card icon="users" title="People" sub="Tap a person for their work, attendance, pay, job history and details.">
      <div className="card-body pt0 period-bar filter-bar">
        <SearchBox value={q} onChange={setQ} placeholder="Name, job, department or phone" />
        <Segmented label="Show" value={show} onChange={setShow}
          options={[{ value: 'all', label: 'All' }, { value: 'staff', label: 'Employees' }, { value: 'worker', label: 'Workers' }, { value: 'left', label: `Left (${rows.filter((r) => r.left).length})` }]} />
        {(db.workplaces || []).length > 0 && (
          <select className="in place-filter" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Works at">
            <option value="">Every place</option>
            {(db.workplaces || []).filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            <option value="-">No place set</option>
          </select>
        )}
      </div>
      <DataTable rows={shown} rowKey={(r) => r.e.id} pageSize={20} onRow={(r) => sheets.open(EmployeeProfileSheet, { employeeId: r.e.id })} empty={show === 'left' ? 'Nobody has left.' : 'Nobody here yet. Add employees and workers with the buttons above.'}
        columns={[
          { label: 'Name', primary: true, render: (r) => <span className="staff-cell"><span className={cls('staff-av', r.kind === 'worker' && 'worker')}>{initials(r.e.name)}</span><span className="two-line"><b>{r.e.name}</b><small className="t-muted">{[r.e.role, r.e.department].filter(Boolean).join(' · ')}</small></span></span> },
          { label: 'Type', render: (r) => <Pill tone={r.kind === 'worker' ? 'warn' : 'info'}>{r.kind === 'worker' ? 'Worker' : 'Staff'}</Pill> },
          { label: 'Works at', render: (r) => { const p = at(r); return p.place ? <span className="two-line"><span>{p.place.name}</span>{p.next ? <small className="t-warn">→ {byId(db.workplaces || [], p.next.to)?.name} {fdate(p.next.date)}</small> : <small className="t-muted">{p.place.region}</small>}</span> : <span className="t-muted">—</span> } },
          { label: 'Pay', render: (r) => <span className="t-muted">{r.pay}</span> },
          { label: 'Phone', render: (r) => (r.e.phone ? <PhoneLink phone={r.e.phone} label={r.e.name} /> : '—') },
          { label: 'Today', render: (r) => (r.left ? <span className="t-muted">Left {r.e.leftOn ? fdate(r.e.leftOn) : ''}</span> : r.today ? <Pill tone={DAY_TONE[r.today.status]}>{DAY_STATUS[r.today.status]}</Pill> : <span className="t-muted">—</span>) },
          { label: 'Login', render: (r) => (r.hasLogin ? <Pill tone="good">Yes</Pill> : <span className="t-muted">No</span>) },
          { label: 'To pay', align: 'right', render: (r) => (r.toPay > 0 ? <b className="t-warn">{tk(r.toPay)}</b> : <span className="t-muted">—</span>) },
        ]} />
    </Card>
  )
}

interface RegLine { status: DayStatus | ''; work: string; output: string }

/** Mark attendance and the work done for everyone, one day at a time. */
function Register() {
  const { db, act } = useBooks()
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [who, setWho] = useState<'worker' | 'all'>('worker')
  const people = db.employees.filter((e) => e.status !== 'left' && e.joined <= date && (who === 'all' || e.kind === 'worker' || e.payType === 'daily'))
  const saved = (id: string) => (db.attendance || []).find((a) => a.employeeId === id && a.date === date)
  const [draft, setDraft] = useState<Record<string, RegLine>>({})
  const [draftFor, setDraftFor] = useState(date)
  // a new day starts from what is saved for it
  if (draftFor !== date) { setDraftFor(date); setDraft({}) }
  const line = (id: string): RegLine => draft[id] || (() => { const s = saved(id); return { status: s?.status || '', work: s?.work || '', output: s?.output ? String(s.output) : '' } })()
  const upd = (id: string, patch: Partial<RegLine>) => setDraft((d) => ({ ...d, [id]: { ...line(id), ...patch } }))
  const regPage = usePaged(people, 25)
  const marked = people.filter((e) => line(e.id).status)
  const changed = Object.keys(draft).length > 0
  const canEdit = !accessGuard.readonly
  const month = date.slice(0, 7)
  const save = () => {
    const rows = people.filter((e) => line(e.id).status).map((e) => {
      const l = line(e.id)
      const status = l.status as DayStatus
      return { employeeId: e.id, status, work: l.work, output: num(l.output) || undefined, hours: status === 'present' ? 8 : status === 'half' ? 4 : undefined }
    })
    if (!rows.length) return toast('Mark at least one person')
    const why = act('saveAttendance', { date, rows })
    if (why) return toast(why)
    setDraft({})
    toast(`Register saved for ${fdate(date)} · ${rows.length} people`)
  }
  return (
    <>
      <Card icon="calendar" title="Daily register" sub="Who came, and what they did. Daily-wage workers are paid for the days marked here."
        action={canEdit && <Button icon="check" disabled={!changed} onClick={save}>Save register</Button>}>
        <div className="card-body pt0 period-bar">
          <label className="field"><span className="field-label">Day</span><input className="in" type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <Segmented label="Whom" value={who} onChange={setWho} options={[{ value: 'worker', label: 'Workers' }, { value: 'all', label: 'Everyone' }]} />
          {canEdit && <Button variant="secondary" onClick={() => setDraft(Object.fromEntries(people.map((e) => [e.id, { ...line(e.id), status: line(e.id).status || 'present' }])))}>Mark the rest present</Button>}
          <p className="field-note">{marked.length} of {people.length} marked{changed ? ' · not saved yet' : ''}</p>
        </div>
        <div className="reg-row reg-head"><span>Person</span><span>Attendance</span><span>Work done</span><span>Pieces</span></div>
        {regPage.rows.map((e) => {
          const l = line(e.id)
          return (
            <div key={e.id} className="reg-row">
              <span className="staff-cell"><span className={cls('staff-av', e.kind === 'worker' && 'worker')}>{initials(e.name)}</span><span className="two-line"><b>{e.name}</b><small className="t-muted">{e.role}{e.payType === 'daily' ? ` · ${tk(e.dailyRate || 0)}/day` : ''}{saved(e.id)?.inAt ? ` · in ${saved(e.id)?.inAt}${saved(e.id)?.outAt ? `–${saved(e.id)?.outAt}` : ''}${saved(e.id)?.source === 'self' ? ' (phone)' : ''}` : ''}</small></span></span>
              <Segmented<DayStatus | ''> label={`${e.name} attendance`} value={l.status} onChange={(s) => canEdit && upd(e.id, { status: s })}
                options={[{ value: 'present', label: 'Present' }, { value: 'half', label: 'Half' }, { value: 'absent', label: 'Absent' }, { value: 'leave', label: 'Leave' }]} />
              <input className="in" value={l.work} disabled={!canEdit || l.status === 'absent' || l.status === 'leave'} onChange={(x) => upd(e.id, { work: x.target.value })} placeholder="e.g. Loaded 2 trucks" aria-label={`${e.name} work done`} />
              <input className="in" inputMode="numeric" value={l.output} disabled={!canEdit || l.status === 'absent' || l.status === 'leave'} onChange={(x) => upd(e.id, { output: x.target.value })} placeholder="0" aria-label={`${e.name} pieces done`} />
            </div>
          )
        })}
        {regPage.pager}
        {!people.length && <p className="t-muted card-body">No {who === 'worker' ? 'workers' : 'people'} working on this day. Add workers with Add worker.</p>}
      </Card>
      <MonthSheet month={month} />
    </>
  )
}

/** Days worked by each daily-wage person this month. */
function MonthSheet({ month }: { month: string }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const pr = payrollFor(db, month)
  return (
    <Card icon="badge" title={`${fmonth(month)} at a glance`} sub="Days worked and wages earned so far.">
      <DataTable rows={pr.daily} rowKey={(r) => r.e.id} onRow={(r) => sheets.open(EmployeeProfileSheet, { employeeId: r.e.id })} empty="No daily-wage workers."
        columns={[
          { label: 'Worker', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{r.e.role}</small></span> },
          { label: 'Days', align: 'right', render: (r) => fmt(r.days) },
          { label: 'Absent', align: 'right', render: (r) => (r.absent ? <span className="t-warn">{r.absent}</span> : '0') },
          { label: 'Pieces', align: 'right', render: (r) => (r.output ? fmt(r.output) : '—') },
          { label: 'Earned', align: 'right', render: (r) => tk(r.earned) },
          { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
        ]} />
    </Card>
  )
}

function Payroll() {
  const { db } = useBooks()
  const sheets = useSheets()
  const month = thisMonth()
  const pr = payrollFor(db, month)
  const open = (r: { e: { id: string } }) => sheets.open(EmployeeProfileSheet, { employeeId: r.e.id })
  const canEdit = !accessGuard.readonly
  return (
    <>
      {canEdit && (
        <div className="page-actions">
          <Button variant="secondary" onClick={() => sheets.open(AddExpenseSheet, { head: SALARY_ADVANCE })}>Give advance</Button>
          <Button icon="wallet" onClick={() => sheets.open(PayrollSheet, { month })}>Pay salaries, commission and wages</Button>
        </div>
      )}
      <div className="stats">
        <Stat icon="badge" label="Salary still to pay" value={tk(pr.salaryToPay)} sub={fmonth(month)} />
        <Stat icon="tag" label="Commission still to pay" value={tk(pr.commissionToPay)} sub={`${tk(pr.commission)} earned`} />
        <Stat icon="users" label="Daily wages still to pay" value={tk(pr.wagesToPay)} sub={`${tk(pr.wages)} earned`} />
        <Stat icon="receipt" label="Left on contracts" value={tk(pr.contractToPay)} sub={`${pr.contract.length} contract${pr.contract.length === 1 ? '' : 's'}`} />
      </div>
      <Card title="Monthly salary" sub="Fixed monthly salary. Advances are taken off automatically.">
        <DataTable rows={pr.salary} rowKey={(r) => r.e.id} onRow={open} empty="No one on a monthly salary."
          columns={[
            { label: 'Name', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{[r.e.role, r.e.department].filter(Boolean).join(' · ')}</small></span> },
            { label: 'Monthly salary', align: 'right', render: (r) => tk(r.salary) },
            { label: 'Advance taken', align: 'right', render: (r) => tk(r.advance) },
            { label: 'Already paid', align: 'right', render: (r) => tk(r.paid) },
            { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]} />
      </Card>
      <Card title="Sales commission" sub="Worked out from the bills each person sold.">
        <DataTable rows={pr.sales} rowKey={(r) => r.e.id} onRow={open} empty="No one on commission."
          columns={[
            { label: 'Name', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{r.e.salesTarget ? `${Math.round((r.sold / r.e.salesTarget) * 100)}% of target` : r.e.role}</small></span> },
            { label: 'Dealers', render: (r) => plural(r.dealers, 'dealer') },
            { label: 'Sales', align: 'right', render: (r) => tk(r.sold) },
            { label: 'Collected', align: 'right', render: (r) => tk(r.collected) },
            { label: 'Rate', align: 'right', render: (r) => `${r.e.rate}% of ${r.e.commissionOn === 'collection' ? 'collection' : 'sales'}` },
            { label: 'Commission', align: 'right', render: (r) => <b>{tk(r.commission)}</b> },
            { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]} />
      </Card>
      <Card title="Daily wages" sub="Days marked in the daily register × the daily wage, less advances.">
        <DataTable rows={pr.daily} rowKey={(r) => r.e.id} onRow={open} empty="No daily-wage workers."
          columns={[
            { label: 'Name', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{r.e.role}</small></span> },
            { label: 'Days', align: 'right', render: (r) => fmt(r.days) },
            { label: 'Daily wage', align: 'right', render: (r) => tk(r.e.dailyRate || 0) },
            { label: 'Earned', align: 'right', render: (r) => tk(r.earned) },
            { label: 'Advance', align: 'right', render: (r) => tk(r.advance) },
            { label: 'Paid', align: 'right', render: (r) => tk(r.paid) },
            { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]} />
      </Card>
      <Card title="Contracts" sub="A fixed sum for a job. Pay in parts from each person’s profile.">
        <DataTable rows={pr.contract} rowKey={(r) => r.e.id} onRow={open} empty="No contracts running."
          columns={[
            { label: 'Name', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{r.e.contract?.work}</small></span> },
            { label: 'Period', render: (r) => <span className="t-muted nowrap">{r.e.contract ? `${fdate(r.e.contract.start)} – ${fdate(r.e.contract.end)}` : ''}</span> },
            { label: 'Time gone', align: 'right', render: (r) => `${Math.round(r.timeGone * 100)}%` },
            { label: 'Contract', align: 'right', render: (r) => tk(r.amount) },
            { label: 'Paid', align: 'right', render: (r) => tk(r.paidAll) },
            { label: 'Left to pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]} />
      </Card>
    </>
  )
}

/** Leave: requests to answer, every request, and how many days each kind allows a year. */
function Leave() {
  const { db, act, session } = useBooks()
  const me = byId(db.users, session.userId)
  const sheets = useSheets()
  const toast = useToast()
  const [show, setShow] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending')
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const canEdit = !accessGuard.readonly
  const all = leaveList(db)
  const pending = all.filter((r) => r.status === 'pending')
  const n = q.trim().toLowerCase()
  const rows = all.filter((r) => (show === 'all' || r.status === show) && (!n || `${r.id} ${byId(db.employees, r.employeeId)?.name || ''} ${r.reason} ${LEAVE_KINDS[r.kind]}`.toLowerCase().includes(n)))
  const today = todayISO()
  const awayToday = all.filter((r) => r.status === 'approved' && r.from <= today && r.to >= today)
  const [quota, setQuota] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(LEAVE_KINDS).map((k) => [k, db.leaveQuota?.[k as LeaveKind] != null ? String(db.leaveQuota[k as LeaveKind]) : ''])))
  const people = db.employees.filter((e) => e.status !== 'left')
  return (
    <>
      <div className="stats three">
        <Stat icon="bell" label="Waiting for an answer" value={fmt(pending.length)} tone={pending.length ? 'warn' : undefined} />
        <Stat icon="calendar" label="Away today" value={fmt(awayToday.length)} sub={awayToday.map((r) => byId(db.employees, r.employeeId)?.name).filter(Boolean).join(', ') || 'Everyone in'} />
        <Stat icon="check" label="Approved this year" value={fmt(all.filter((r) => r.status === 'approved' && r.from.slice(0, 4) === today.slice(0, 4)).length)} sub={`${fmt(all.filter((r) => r.status === 'approved' && r.from.slice(0, 4) === today.slice(0, 4)).reduce((s, r) => s + leaveDays(r), 0))} days in all`} />
      </div>
      <Card icon="calendar" title="Leave requests" sub="Employees ask from My work. Approve or decline; approved days go into the daily register as leave."
        action={canEdit && (
          <div className="tools-right">
            <select className="in" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person to record leave for">
              <option value="">Record leave for…</option>
              {people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <Button icon="plus" disabled={!who} onClick={() => { sheets.open(LeaveRequestSheet, { employeeId: who }); setWho('') }}>Record leave</Button>
          </div>
        )}>
        <div className="card-body pt0 filter-bar">
          <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'pending', label: `Waiting (${pending.length})` }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Name, reason or kind" label="Search leave" />
        </div>
        <DataTable rows={rows} rowKey={(r) => r.id} pageSize={20} onRow={(r) => sheets.open(LeaveDecisionSheet, { id: r.id })}
          empty={show === 'pending' ? 'No requests waiting. All caught up.' : 'No leave matches.'}
          columns={[
            { label: 'Person', primary: true, render: (r) => { const e = byId(db.employees, r.employeeId); return <span className="staff-cell"><span className={cls('staff-av', e?.kind === 'worker' && 'worker')}>{initials(e?.name || '?')}</span><span className="two-line"><b>{e?.name || '—'}</b><small className="t-muted">{r.id} · asked {fdate(r.askedAt.slice(0, 10))}</small></span></span> } },
            { label: 'Leave', render: (r) => <span className="two-line"><span>{LEAVE_KINDS[r.kind]}</span><small className="t-muted">{r.half ? `Half day, ${fdate(r.from)}` : r.from === r.to ? fdate(r.from) : `${fdate(r.from)} – ${fdate(r.to)}`}</small></span> },
            { label: 'Days', align: 'right', render: (r) => fmt(leaveDays(r)) },
            { label: 'Reason', render: (r) => <span className="t-muted">{r.reason}</span> },
            { label: 'Status', render: (r) => <Pill tone={LEAVE_TONE[r.status]}>{LEAVE_STATUS[r.status]}</Pill> },
            ...(canEdit ? [{ label: '', align: 'right' as const, render: (r: (typeof rows)[number]) => (r.status === 'pending' ? (
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="secondary" onClick={() => sheets.open(LeaveDecisionSheet, { id: r.id })}>Decline…</Button>
                <Button size="sm" icon="check" onClick={() => { const why = act('decideLeave', { id: r.id, approve: true, answer: '', by: me?.name || 'Admin', at: new Date().toISOString() }); toast(why || `Approved for ${byId(db.employees, r.employeeId)?.name}`) }}>Approve</Button>
              </span>
            ) : null) }] : []),
          ]} />
      </Card>
      <Card icon="settings" title="Leave allowed in a year" sub="Days each person may take of each kind. Leave empty for no limit. Employees see what is left when they ask.">
        <div className="card-body pt0">
          <div className="form-grid">
            {(Object.keys(LEAVE_KINDS) as LeaveKind[]).map((k) => (
              <label key={k} className="field"><span className="field-label">{LEAVE_KINDS[k]} (days)</span>
                <input className="in" inputMode="numeric" disabled={!canEdit} value={quota[k]} onChange={(e) => setQuota((x) => ({ ...x, [k]: e.target.value }))} placeholder="No limit" />
              </label>
            ))}
          </div>
          {canEdit && <div className="page-actions"><Button variant="secondary" onClick={() => {
            const next = Object.fromEntries(Object.entries(quota).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, num(v)]))
            const why = act('setLeaveQuota', next)
            toast(why || 'Leave allowance saved')
          }}>Save allowance</Button></div>}
        </div>
      </Card>
    </>
  )
}

/** Workplaces with who works where, and every transfer order. */
function Places() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const canEdit = !accessGuard.readonly
  const places = placeRows(db).filter((r) => !r.place.archived)
  const loose = unposted(db)
  const [show, setShow] = useState<'upcoming' | 'all'>('all')
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const moves = transferRows(db).filter((t) => (show === 'all' || t.upcoming) && (!n || `${t.id} ${t.orderNo} ${t.employee?.name || ''} ${t.fromPlace?.name || ''} ${t.toPlace?.name || ''} ${t.reason}`.toLowerCase().includes(n)))
  return (
    <>
      <Card icon="pin" title="Workplaces" sub="Offices, godowns, factory floors and sales regions. Tap one for its details and the people there."
        action={canEdit && (
          <div className="tools-right">
            <Button variant="secondary" icon="route" disabled={!places.length} onClick={() => sheets.open(StaffTransferSheet, {})}>Transfer someone</Button>
            <Button icon="plus" onClick={() => sheets.open(PlaceSheet, {})}>Add workplace</Button>
          </div>
        )}>
        {!places.length && <p className="t-muted card-body">No workplaces yet. Add your head office, godowns and sales regions, then post people to them.</p>}
        <div className="site-grid">
          {places.map((r) => (
            <article key={r.place.id} className="site-card">
              <button type="button" className="site-main" onClick={() => sheets.open(PlaceDetailSheet, { placeId: r.place.id })}>
                <span className="site-top"><span className="site-ic"><Icon name={PLACE_ICON[r.place.kind]} size={20} /></span><b>{r.place.name}</b><Pill tone="neutral">{PLACE_KINDS[r.place.kind]}</Pill></span>
                <span className="site-addr"><Icon name="pin" size={14} />{[r.place.address, r.place.region].filter(Boolean).join(', ') || 'No address yet'}</span>
                <span className="site-stats">
                  <span><b>{r.people.length}</b>people</span>
                  <span><b className={r.comingIn.length ? 't-good' : undefined}>{r.comingIn.length}</b>coming in</span>
                  <span><b className={r.goingOut.length ? 't-warn' : undefined}>{r.goingOut.length}</b>moving out</span>
                </span>
                <span className="site-foot t-muted">{r.head ? `In charge: ${r.head}` : 'No one in charge set'}{r.place.hours ? ` · ${r.place.hours}` : ''}</span>
              </button>
            </article>
          ))}
        </div>
        {loose.length > 0 && places.length > 0 && (
          <p className="card-body pt0 t-warn tight">No workplace set for: {loose.map((e) => e.name).join(', ')}. Use Transfer someone to post them.</p>
        )}
      </Card>
      <Card icon="route" title="Transfer orders" sub="Who moves where and from when. Orders for a later date can be cancelled until that day."
        action={<div className="tools-right"><Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'upcoming', label: `Coming (${transferRows(db).filter((t) => t.upcoming).length})` }]} /><SearchBox value={q} onChange={setQ} placeholder="Name, place or order no." label="Search transfers" /></div>}>
        <DataTable rows={moves} rowKey={(t) => t.id} pageSize={20} onRow={(t) => t.employee && sheets.open(EmployeeProfileSheet, { employeeId: t.employee.id })} empty="No transfers yet."
          columns={[
            { label: 'Person', primary: true, render: (t) => <span className="two-line"><b>{t.employee?.name || '—'}</b><small className="t-muted">{t.id}{t.orderNo ? ` · order ${t.orderNo}` : ''}</small></span> },
            { label: 'From → to', render: (t) => <span className="nowrap">{t.fromPlace?.name || 'First posting'} <Icon name="arrowRight" size={13} /> <b>{t.toPlace?.name || '—'}</b></span> },
            { label: 'Starts', render: (t) => <span className="two-line"><span className="nowrap">{fdate(t.date)}</span><small>{t.cancelled ? <Pill tone="muted">Cancelled</Pill> : t.upcoming ? <Pill tone="warn">Coming</Pill> : <Pill tone="good">In effect</Pill>}</small></span> },
            { label: 'Reason', render: (t) => <span className="t-muted">{t.reason}{t.newRole ? ` · as ${t.newRole}` : ''}</span> },
            { label: 'Allowance', align: 'right', render: (t) => (t.allowance ? tk(t.allowance) : '') },
            ...(canEdit ? [{ label: '', align: 'right' as const, render: (t: (typeof moves)[number]) => (t.upcoming ? (
              <Button size="sm" variant="secondary" onClick={async (e) => {
                e.stopPropagation()
                if (!(await confirm({ title: `Cancel ${t.id}?`, message: `${t.employee?.name} stays at ${t.fromPlace?.name || 'their place'}.`, confirmLabel: 'Cancel transfer', destructive: true }))) return
                toast(act('cancelStaffTransfer', { id: t.id, today: todayISO() }) || 'Transfer cancelled')
              }}>Cancel</Button>
            ) : null) }] : []),
          ]} />
      </Card>
    </>
  )
}

const PLACE_ICON: Record<PlaceKind, IconName> = { office: 'building', warehouse: 'box', factory: 'factory', region: 'route', branch: 'store', other: 'pin' }
