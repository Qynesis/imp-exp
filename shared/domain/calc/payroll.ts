import type { Db, Employee, MonthKey, PayrollLine } from '../types'
import { memo, sum } from './common'
import { invTotal } from './dealers'

export interface SalaryRow {
  e: Employee
  salary: number
  advance: number
  paid: number
  toPay: number
}
export interface SalesRow {
  e: Employee
  dealers: number
  sold: number
  collected: number
  commission: number
  paid: number
  toPay: number
}

/** Salary and commission for one month. Advances given in the month come off that month's salary. */
export const payrollFor = (db: Db, month: MonthKey) =>
  memo(db, 'payroll:' + month, () => {
    const inMonth = (x: { date: string }) => x.date.slice(0, 7) === month
    const paidOf = (employeeId: string, kind: PayrollLine['kind']) =>
      sum(db.payroll.filter((p) => p.month === month).flatMap((p) => p.lines).filter((l) => l.employeeId === employeeId && l.kind === kind), (l) => l.amount)

    const salary: SalaryRow[] = db.employees.filter((e) => e.payType === 'salary').map((e) => {
      const advance = sum(db.advances.filter((a) => a.employeeId === e.id && inMonth(a)), (a) => a.amount)
      const paid = paidOf(e.id, 'salary')
      return { e, salary: e.salary, advance, paid, toPay: Math.max(e.salary - advance - paid, 0) }
    })
    const sales: SalesRow[] = db.employees.filter((e) => e.payType === 'sales').map((e) => {
      const invs = db.invoices.filter((i) => i.status === 'final' && !i.sample && i.soldBy === e.id && inMonth(i))
      const sold = sum(invs, invTotal)
      const collected = sum(invs, (i) => i.received || 0) + sum(db.collections.filter((c) => c.collectedBy === e.id && inMonth(c)), (c) => c.amount)
      const commission = Math.round(((e.commissionOn === 'collection' ? collected : sold) * (e.rate || 0)) / 100)
      const paid = paidOf(e.id, 'commission')
      return { e, dealers: db.dealers.filter((d) => d.salesId === e.id).length, sold, collected, commission, paid, toPay: Math.max(commission - paid, 0) }
    })
    return {
      salary, sales,
      salaryTotal: sum(salary, (r) => r.salary),
      salaryToPay: sum(salary, (r) => r.toPay),
      advances: sum(salary, (r) => r.advance),
      commission: sum(sales, (r) => r.commission),
      commissionToPay: sum(sales, (r) => r.toPay),
    }
  })
