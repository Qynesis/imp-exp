import { useState } from 'react'
import { byId, expenseAccountCalc, num, thisMonth, tk, todayISO, type Attachment, type ExpenseEntry } from '@shared/domain'
import { AttachField } from '@/components/attachments/Attachments'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast, type SheetComponent } from '@/ui'

type Kind = ExpenseEntry['kind']
const TITLE: Record<Kind, string> = { payment: 'Pay', bill: 'Add a bill', adjustment: 'Correct the balance' }

/** Pay (whole, part, early or late), add a bill for a period, or correct the balance of a regular expense. */
export const ExpenseEntrySheet: SheetComponent<{ accountId: string; kind?: Kind }> = ({ accountId, kind = 'payment' }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const a = byId(db.expenseAccounts || [], accountId)
  const [k, setK] = useState<Kind>(kind)
  const [files, setFiles] = useState<Attachment[]>([])
  const c = a ? expenseAccountCalc(db, a.id) : null
  const [v, set, bind, nbind] = useForm({ amount: kind === 'payment' && c && c.balance > 0 ? String(c.balance) : '', date: todayISO(), method: 'Cash', note: '', period: thisMonth() })
  if (!a || !c) return null
  const due = c.balance
  return (
    <FormSheet title={`${TITLE[k]}: ${a.name}`} crumb="Expenses" submit={k === 'payment' ? 'Save payment' : k === 'bill' ? 'Save bill' : 'Save correction'}
      note={<>{due > 0 ? <>Due now <b className="t-warn">{tk(due)}</b>.</> : due < 0 ? <>Paid ahead <b className="t-good">{tk(-due)}</b>.</> : 'Nothing due.'} {k === 'payment' ? 'Pay all, part, or more than due (the extra is kept as an advance for the next periods).' : k === 'bill' ? 'A bill replaces the automatic charge for its period.' : 'Use + to add to what is owed, − to take off.'}</>}
      onSubmit={() => {
        const amount = num(v.amount)
        const why = act('expenseEntry', {
          accountId: a.id, kind: k, amount, date: v.date, method: k === 'payment' ? v.method : '', note: v.note.trim(),
          period: k === 'bill' ? v.period : undefined, attachments: files.length ? files : undefined,
        })
        if (why) return why
        toast(k === 'payment' ? `${tk(amount)} paid to ${a.name}` : k === 'bill' ? 'Bill added' : 'Balance corrected')
      }}>
      <div className="wide-note">
        <Segmented<Kind> label="What" value={k} onChange={setK} options={[{ value: 'payment', label: 'Payment' }, { value: 'bill', label: 'Bill' }, { value: 'adjustment', label: 'Correction' }]} />
      </div>
      <Field label="Amount (Tk)" hint={k === 'payment' && due > 0 ? <button type="button" className="link" onClick={() => set('amount', String(due))}>All due: {tk(due)}</button> : k === 'payment' && a.amount > 0 ? <button type="button" className="link" onClick={() => set('amount', String(a.amount))}>One period: {tk(a.amount)}</button> : undefined}>
        <input {...nbind('amount')} placeholder={k === 'adjustment' ? 'e.g. -500' : '0'} />
      </Field>
      {k === 'bill' && <Field label="For the month"><input type="month" {...bind('period')} /></Field>}
      <Field label="Date"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      {k === 'payment' && <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>}
      <Field label="Note" wide><input {...bind('note')} placeholder={k === 'bill' ? 'e.g. Meter reading 4,520 units' : 'Receipt number, who received it…'} /></Field>
      {k !== 'adjustment' && <AttachField value={files} onChange={setFiles} />}
    </FormSheet>
  )
}
