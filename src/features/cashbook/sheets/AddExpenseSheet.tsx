import { useState } from 'react'
import { expenseHeads, num, SALARY_ADVANCE, tk, todayISO , type Attachment } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { AttachField } from '@/components/attachments/Attachments'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** An office or transport expense, or a salary advance (which comes off the next salary). */
export function AddExpenseSheet({ head = 'Transport' }: { head?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const staff = db.employees.filter((e) => e.payType === 'salary')
  const [v, , bind, nbind] = useForm({ head, details: '', employeeId: staff[0]?.id || '', amount: '', method: 'Cash', date: todayISO() })
  const [files, setFiles] = useState<Attachment[]>([])
  const advance = v.head === SALARY_ADVANCE
  return (
    <FormSheet title={advance ? 'Give salary advance' : 'Add expense'} crumb="Cashbook and dues" submit={advance ? 'Save advance' : 'Save expense'}
      note={advance ? 'The advance is taken off this employee’s salary automatically when you pay salaries.' : undefined}
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount.'
        if (advance) {
          if (!v.employeeId) return 'Add a salary-basis employee first.'
          act('addAdvance', { employeeId: v.employeeId, amount, method: v.method, date: v.date , attachments: files.length ? files : undefined })
          toast(`${tk(amount)} advance recorded`)
        } else {
          act('addExpense', { head: v.head, details: v.details.trim(), amount, method: v.method, date: v.date , attachments: files.length ? files : undefined })
          toast(`${tk(amount)} expense saved`)
        }
      }}>
      <Field label="Expense head">
        <select {...bind('head')}>
          {expenseHeads(db).map((h) => <option key={h}>{h}</option>)}
          <option>{SALARY_ADVANCE}</option>
        </select>
      </Field>
      {advance ? (
        <Field label="Employee">
          <select {...bind('employeeId')}>{staff.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </Field>
      ) : (
        <Field label="Details"><input {...bind('details')} placeholder="What was it for" /></Field>
      )}
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}
