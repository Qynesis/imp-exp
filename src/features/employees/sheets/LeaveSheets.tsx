import { useState, type FormEvent } from 'react'
import { byId, datesBetween, fdate, LEAVE_KINDS, LEAVE_TONE, LEAVE_STATUS, leaveBalance, leaveDays, todayISO, type LeaveKind } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, Pill, Sheet, useForm, useSheetItem, useToast, type SheetComponent } from '@/ui'

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** Leave left this year, by kind, as small tiles. */
export function LeaveBalanceTiles({ employeeId }: { employeeId: string }) {
  const { db } = useBooks()
  const rows = leaveBalance(db, employeeId).filter((b) => b.quota != null || b.used > 0 || b.pending > 0)
  if (!rows.length) return <p className="t-muted tight">No leave taken this year.</p>
  return (
    <div className="leave-tiles">
      {rows.map((b) => (
        <div key={b.kind} className="leave-tile">
          <span>{b.label}</span>
          <b>{b.left != null ? days(b.left) : days(b.used)}</b>
          <small className="t-muted">{b.left != null ? `left of ${b.quota} · ${b.used} taken` : 'taken this year'}{b.pending ? ` · ${b.pending} waiting` : ''}</small>
        </div>
      ))}
    </div>
  )
}

/**
 * Ask for leave. An employee asks for themselves (it waits for the admin). Opened by the admin with
 * `employeeId`, it records leave for that person and approves it at once.
 */
export const LeaveRequestSheet: SheetComponent<{ employeeId?: string }> = ({ employeeId }) => {
  const { db, session, act, leave } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const me = byId(db.users, session.userId)
  const forOther = !!employeeId && employeeId !== me?.employeeId
  const who = byId(db.employees, employeeId || me?.employeeId)
  const [v, set, bind] = useForm({ kind: 'casual' as LeaveKind, from: todayISO(), to: todayISO(), half: false, reason: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!who) return <Sheet title="Apply for leave"><p className="t-muted">Your login is not linked to an employee. Ask the office to link it.</p></Sheet>
  const n = v.half ? 0.5 : v.to >= v.from ? datesBetween(v.from, v.to).length : 0
  const bal = leaveBalance(db, who.id).find((b) => b.kind === v.kind)
  const over = bal?.left != null && n > bal.left
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (v.to < v.from) return setErr('The leave ends before it starts.')
    if (!v.reason.trim()) return setErr('Write a reason.')
    setBusy(true)
    try {
      const to = v.half ? v.from : v.to
      if (forOther) {
        const at = new Date().toISOString()
        const why = act('requestLeave', { employeeId: who.id, kind: v.kind, from: v.from, to, half: v.half, reason: v.reason, by: me?.name || '', at })
        if (why) throw new Error(why)
        // recorded by the office: approved straight away (the id is the next number)
        const next = 'LV-' + String(Math.max(0, ...(db.leaveRequests || []).map((r) => Number(r.id.slice(3)) || 0)) + 1).padStart(3, '0')
        const why2 = act('decideLeave', { id: next, approve: true, answer: 'Recorded by the office', by: me?.name || '', at })
        if (why2) throw new Error(why2)
        toast(`Leave recorded for ${who.name}`)
      } else {
        await leave({ op: 'request', kind: v.kind, from: v.from, to, half: v.half, reason: v.reason })
        toast('Leave request sent to the office')
      }
      close()
    } catch (ex) {
      setErr((ex as Error).message)
      setBusy(false)
    }
  }
  return (
    <Sheet title={forOther ? `Leave for ${who.name}` : 'Apply for leave'} crumb={forOther ? 'Employees and workers' : 'My work'} onSubmit={(e) => void submit(e)}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{forOther ? 'Record leave' : `Ask for ${days(n)}`}</Button></>}>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">
        <Field label="Kind of leave">
          <select {...bind('kind')}>{(Object.keys(LEAVE_KINDS) as LeaveKind[]).map((k) => <option key={k} value={k}>{LEAVE_KINDS[k]}</option>)}</select>
        </Field>
        <label className="check field">
          <input type="checkbox" checked={v.half} onChange={(e) => set('half', e.target.checked)} /> Half a day only
        </label>
        <Field label={v.half ? 'Day' : 'From'}><input type="date" {...bind('from')} /></Field>
        {!v.half && <Field label="To (last day off)"><input type="date" min={v.from} {...bind('to')} /></Field>}
        <Field label="Reason" wide><input {...bind('reason')} placeholder="e.g. Fever, sister’s wedding, family matter in village" /></Field>
        <div className="field wide">
          <div className={'leave-sum' + (over ? ' over' : '')}>
            <b>{days(n)}</b>
            <span>{bal?.left != null ? `${LEAVE_KINDS[v.kind]}: ${days(bal.left)} left this year${over ? ' — this asks for more than is left' : ''}` : `${LEAVE_KINDS[v.kind]} has no yearly limit`}</span>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
LeaveRequestSheet.readOnlySafe = true

/** The admin looks at one request: who, when, how much is left, who else is off then — and answers. */
export const LeaveDecisionSheet: SheetComponent<{ id: string }> = ({ id }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const [answer, setAnswer] = useState('')
  const [err, setErr] = useState('')
  const r = (db.leaveRequests || []).find((x) => x.id === id)
  if (!r) return null
  const e = byId(db.employees, r.employeeId)
  const me = byId(db.users, session.userId)
  const bal = leaveBalance(db, r.employeeId, Number(r.from.slice(0, 4))).find((b) => b.kind === r.kind)
  const n = leaveDays(r)
  // others away on any of these days, so the admin sees who is left to work
  const others = (db.leaveRequests || []).filter((x) => x.id !== r.id && x.status === 'approved' && x.from <= r.to && x.to >= r.from)
  const decide = (approve: boolean) => {
    const why = act('decideLeave', { id: r.id, approve, answer, by: me?.name || '', at: new Date().toISOString() })
    if (why) return setErr(why)
    toast(approve ? `Leave approved for ${e?.name}` : `Leave declined for ${e?.name}`)
    close()
  }
  const pending = r.status === 'pending'
  return (
    <Sheet title={`${e?.name || 'Employee'} · ${LEAVE_KINDS[r.kind]}`} crumb={`Leave ${r.id}`}
      footer={pending ? (
        <>
          <Button variant="danger" onClick={() => decide(false)}>Decline</Button>
          <Button icon="check" onClick={() => decide(true)}>Approve</Button>
        </>
      ) : undefined}>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="leave-head">
        <Pill tone={LEAVE_TONE[r.status]}>{LEAVE_STATUS[r.status]}</Pill>
        <b>{r.half ? `Half day on ${fdate(r.from)}` : r.from === r.to ? fdate(r.from) : `${fdate(r.from)} – ${fdate(r.to)}`}</b>
        <span className="t-muted">{days(n)}</span>
      </div>
      <div className="kv-list boxed">
        <div className="kv"><span>Reason</span><b>{r.reason}</b></div>
        <div className="kv"><span>Job</span><b>{[e?.role, e?.department].filter(Boolean).join(' · ') || '—'}</b></div>
        <div className="kv"><span>Asked</span><b>{fdate(r.askedAt.slice(0, 10))}{r.askedBy ? ` by ${r.askedBy}` : ''}</b></div>
        <div className="kv"><span>{LEAVE_KINDS[r.kind]} this year</span><b>{bal?.quota != null ? `${bal.used} taken of ${bal.quota}${pending ? ` · ${Math.max(bal.quota - bal.used - n, 0)} left after this` : ''}` : `${bal?.used || 0} taken · no limit`}</b></div>
        {r.decidedBy && <div className="kv"><span>{r.status === 'approved' ? 'Approved' : r.status === 'declined' ? 'Declined' : 'Closed'} by</span><b>{r.decidedBy}{r.decidedAt ? ` · ${fdate(r.decidedAt.slice(0, 10))}` : ''}</b></div>}
        {r.answer && <div className="kv"><span>Answer</span><b>{r.answer}</b></div>}
      </div>
      {others.length > 0 && (
        <p className="t-warn tight">Also away then: {others.map((x) => `${byId(db.employees, x.employeeId)?.name} (${fdate(x.from)}${x.to !== x.from ? ` – ${fdate(x.to)}` : ''})`).join(', ')}</p>
      )}
      {pending && (
        <label className="field">
          <span className="field-label">Answer to {e?.name.split(' ')[0] || 'them'} (needed when declining)</span>
          <input className="in" value={answer} onChange={(x) => setAnswer(x.target.value)} placeholder="e.g. Approved, get well soon · or · Busy week for deliveries, take next week" />
        </label>
      )}
      {pending && bal?.left != null && n > bal.left && <p className="t-warn tight">This is more than the {days(bal.left)} of {LEAVE_KINDS[r.kind].toLowerCase()} left this year.</p>}
      {pending && <p className="t-muted tight">Approving marks these days as leave in the daily register{r.half ? ' (half day)' : ''}.</p>}
    </Sheet>
  )
}
