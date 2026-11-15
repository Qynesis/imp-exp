import { fmonth, num, tk, todayISO } from '../lib/format.js'
import { EXPENSE_HEADS, byId, payrollFor } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Field, FormSheet, useForm, useToast } from '../ui.jsx'
import { MethodSelect } from './buying.jsx'

export function AddExpense({ head = 'Transport' }) {
  const { db, act } = useStore()
  const toast = useToast()
  const staff = db.employees.filter((e) => e.payType === 'salary')
  const [v, , bind, nbind] = useForm({ head, details: '', employeeId: staff[0]?.id || '', amount: '', method: 'Cash', date: todayISO() })
  const advance = v.head === 'Salary advance'
  return (
    <FormSheet title={advance ? 'Give salary advance' : 'Add expense'} crumb="Cashbook and dues" submit={advance ? 'Save advance' : 'Save expense'}
      note={advance ? 'The advance is taken off this employee’s salary automatically when you pay salaries.' : undefined}
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount.'
        if (advance) {
          if (!v.employeeId) return 'Add a salary-basis employee first.'
          act('addAdvance', { employeeId: v.employeeId, amount, method: v.method, date: v.date })
          toast(`${tk(amount)} advance recorded`)
        } else {
          act('addExpense', { head: v.head, details: v.details.trim(), amount, method: v.method, date: v.date })
          toast(`${tk(amount)} expense saved`)
        }
      }}>
      <Field label="Expense head">
        <select {...bind('head')}>
          {EXPENSE_HEADS.map((h) => <option key={h}>{h}</option>)}
          <option>Salary advance</option>
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
    </FormSheet>
  )
}

export function EmployeeSheet({ employeeId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const cur = employeeId && byId(db.employees, employeeId)
  const [v, , bind, nbind] = useForm(cur
    ? { ...cur, salary: String(cur.salary || ''), rate: String(cur.rate || '') }
    : { name: '', phone: '', role: '', payType: 'salary', salary: '', rate: '', commissionOn: 'sales', joined: todayISO() })
  const sales = v.payType === 'sales'
  return (
    <FormSheet title={cur ? 'Edit employee' : 'Add employee'} crumb="Employees" submit="Save employee"
      note="Salary basis gets a fixed monthly salary. Sales basis earns commission on sales."
      onSubmit={() => {
        if (!v.name.trim()) return 'Enter the employee name.'
        if (!sales && num(v.salary) <= 0) return 'Enter the monthly salary.'
        if (sales && num(v.rate) <= 0) return 'Enter the commission rate.'
        act('saveEmployee', { ...v, name: v.name.trim(), salary: sales ? 0 : num(v.salary), rate: sales ? num(v.rate) : 0 })
        toast(cur ? 'Employee updated' : 'Employee added')
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Role"><input {...bind('role')} placeholder="e.g. Driver" /></Field>
      <Field label="Pay type">
        <select {...bind('payType')}>
          <option value="salary">Salary basis</option>
          <option value="sales">Sales basis</option>
        </select>
      </Field>
      {sales ? (
        <>
          <Field label="Commission rate (%)"><input {...nbind('rate')} placeholder="e.g. 2" /></Field>
          <Field label="Commission on">
            <select {...bind('commissionOn')}>
              <option value="sales">Sales amount</option>
              <option value="collection">Money collected</option>
            </select>
          </Field>
        </>
      ) : (
        <Field label="Monthly salary (Tk)"><input {...nbind('salary')} placeholder="0" /></Field>
      )}
      <Field label="Joining date"><input type="date" {...bind('joined')} /></Field>
    </FormSheet>
  )
}

export function Payroll({ month }) {
  const { db, act } = useStore()
  const toast = useToast()
  const pr = payrollFor(db, month)
  const total = pr.salaryToPay + pr.commissionToPay
  const [v, , bind] = useForm({ method: 'Cash', date: todayISO() })
  return (
    <FormSheet title="Pay salaries and commission" crumb="Employees" submit={`Pay ${tk(total)}`}
      onSubmit={() => {
        if (total <= 0) return `Everything for ${fmonth(month)} is already paid.`
        const lines = [
          ...pr.salary.filter((r) => r.toPay > 0).map((r) => ({ employeeId: r.e.id, kind: 'salary', amount: r.toPay })),
          ...pr.sales.filter((r) => r.toPay > 0).map((r) => ({ employeeId: r.e.id, kind: 'commission', amount: r.toPay })),
        ]
        act('payPayroll', { month, date: v.date, method: v.method, lines })
        toast(`${tk(total)} paid for ${fmonth(month)}`)
      }}>
      <div className="field wide">
        <div className="kv-list boxed">
          <div className="kv"><span>Salary to pay, after taking off {tk(pr.advances)} advances</span><b>{tk(pr.salaryToPay)}</b></div>
          <div className="kv"><span>Commission to pay</span><b>{tk(pr.commissionToPay)}</b></div>
          <div className="kv total"><span>Total for {fmonth(month)}</span><b>{tk(total)}</b></div>
        </div>
      </div>
      <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}
