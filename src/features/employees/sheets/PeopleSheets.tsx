import { byId, employeeProfile, JOB_EVENT_KINDS as EVENT_KINDS, num, thisMonth, tk, todayISO, type JobEvent } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'


/** Write a line in someone's job history. */
export const JobEventSheet: SheetComponent<{ employeeId: string }> = ({ employeeId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const e = byId(db.employees, employeeId)
  const [v, , bind] = useForm({ date: todayISO(), kind: 'note' as JobEvent['kind'], text: '' })
  if (!e) return null
  return (
    <FormSheet title="Add to job history" crumb={e.name} submit="Save" onSubmit={() => {
      const why = act('addJobEvent', { employeeId, date: v.date, kind: v.kind, text: v.text })
      if (why) return why
      toast('Added to job history')
    }}>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="What kind">
        <select {...bind('kind')}>
          {(['note', 'role', 'pay', 'department', 'contract'] as const).map((k) => <option key={k} value={k}>{EVENT_KINDS[k]}</option>)}
        </select>
      </Field>
      <Field label="What happened" wide><input {...bind('text')} placeholder="e.g. Promoted to senior loader, finished forklift training, warning for late arrival" /></Field>
    </FormSheet>
  )
}

/** Mark someone as having left, or as back at work. */
export const StatusSheet: SheetComponent<{ employeeId: string }> = ({ employeeId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const e = byId(db.employees, employeeId)
  const [v, , bind] = useForm({ date: todayISO(), reason: '' })
  if (!e) return null
  const leaving = e.status !== 'left'
  return (
    <FormSheet title={leaving ? `${e.name} is leaving` : `${e.name} is back`} crumb="Employees and workers" submit={leaving ? 'Mark as left' : 'Mark as working'}
      note={leaving ? 'They leave the register and payroll from the next month. Their pay, attendance and history are kept, and their login (if any) should be removed in Settings → Users.' : 'They come back on the register and payroll.'}
      onSubmit={() => {
        const why = act('setEmployeeStatus', { employeeId, left: leaving, date: v.date, reason: v.reason })
        if (why) return why
        toast(leaving ? `${e.name} marked as left` : `${e.name} is back at work`)
      }}>
      <Field label={leaving ? 'Last day' : 'Back from'}><input type="date" {...bind('date')} /></Field>
      {leaving && <Field label="Reason"><input {...bind('reason')} placeholder="e.g. Resigned, contract finished" /></Field>}
    </FormSheet>
  )
}

/** Pay part (or the rest) of a contract. */
export const PayContractSheet: SheetComponent<{ employeeId: string }> = ({ employeeId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const e = byId(db.employees, employeeId)
  const left = e ? employeeProfile(db, employeeId).contract?.left || 0 : 0
  const [v, , bind, nbind] = useForm({ amount: left ? String(left) : '', date: todayISO(), method: 'Cash' })
  if (!e?.contract) return null
  return (
    <FormSheet title={`Pay ${e.name}`} crumb="Contract" submit={`Pay ${tk(num(v.amount))}`}
      note={`${e.contract.work || 'Contract'} · ${tk(e.contract.amount)} in all · ${tk(left)} still to pay`}
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount.'
        if (amount > left + 0.5) return `Only ${tk(left)} is left on this contract.`
        const why = act('payPayroll', { month: v.date.slice(0, 7) || thisMonth(), date: v.date, method: v.method, lines: [{ employeeId, kind: 'contract', amount }] })
        if (why) return why
        toast(`${tk(amount)} paid to ${e.name}`)
      }}>
      <Field label="Amount (Tk)"><input {...nbind('amount')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>
    </FormSheet>
  )
}
