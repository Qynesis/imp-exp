import { fmonth, payrollFor, tk, todayISO, type MonthKey, type PayrollLine } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Pay everything still owed for the month: salaries less advances, and commission. */
export function PayrollSheet({ month }: { month: MonthKey }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const pr = payrollFor(db, month)
  const total = pr.salaryToPay + pr.commissionToPay + pr.wagesToPay
  const [v, , bind] = useForm({ method: 'Cash', date: todayISO() })
  return (
    <FormSheet title="Pay salaries, commission and wages" crumb="Employees" submit={`Pay ${tk(total)}`}
      onSubmit={() => {
        if (total <= 0) return `Everything for ${fmonth(month)} is already paid.`
        const lines: PayrollLine[] = [
          ...pr.salary.filter((r) => r.toPay > 0).map((r) => ({ employeeId: r.e.id, kind: 'salary' as const, amount: r.toPay })),
          ...pr.sales.filter((r) => r.toPay > 0).map((r) => ({ employeeId: r.e.id, kind: 'commission' as const, amount: r.toPay })),
          ...pr.daily.filter((r) => r.toPay > 0).map((r) => ({ employeeId: r.e.id, kind: 'wage' as const, amount: r.toPay })),
        ]
        act('payPayroll', { month, date: v.date, method: v.method, lines })
        toast(`${tk(total)} paid for ${fmonth(month)}`)
      }}>
      <div className="field wide">
        <div className="kv-list boxed">
          <div className="kv"><span>Salary to pay, after taking off {tk(pr.advances)} advances</span><b>{tk(pr.salaryToPay)}</b></div>
          <div className="kv"><span>Commission to pay</span><b>{tk(pr.commissionToPay)}</b></div>
          <div className="kv"><span>Workers’ daily wages to pay ({pr.daily.filter((r) => r.toPay > 0).length} people)</span><b>{tk(pr.wagesToPay)}</b></div>
          {pr.contractToPay > 0 && <div className="kv"><span className="t-muted">Contracts are paid one by one from each person’s profile ({tk(pr.contractToPay)} left)</span><b /></div>}
          <div className="kv total"><span>Total for {fmonth(month)}</span><b>{tk(total)}</b></div>
        </div>
      </div>
      <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}
