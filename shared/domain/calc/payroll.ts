import type { DayStatus, Db, Employee, ISODate, LeaveKind, LeaveRequest, MonthKey, PayrollLine, WorkDay } from '../types'
import { memo, sum } from './common'
import { invNet } from './dealers'

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

export interface WageRow {
  e: Employee
  /** Days counted for pay: a half day is 0.5. */
  days: number
  absent: number
  leave: number
  output: number
  earned: number
  advance: number
  paid: number
  toPay: number
}
export interface ContractRow {
  e: Employee
  amount: number
  /** Paid on the contract in this month, and since it began. */
  paidMonth: number
  paidAll: number
  toPay: number
  /** Share of the contract period gone by at the end of the month, 0–1. */
  timeGone: number
}

/** How much of a day counts for daily pay. */
export const DAY_WEIGHT: Record<DayStatus, number> = { present: 1, half: 0.5, absent: 0, leave: 0 }
export const DAY_STATUS: Record<DayStatus, string> = { present: 'Present', half: 'Half day', absent: 'Absent', leave: 'On leave' }

/** Attendance for one person in a month (or every month when `month` is left out), oldest first. */
export const daysOf = (db: Db, employeeId: string, month?: MonthKey): WorkDay[] =>
  (db.attendance || []).filter((a) => a.employeeId === employeeId && (!month || a.date.slice(0, 7) === month)).sort((a, b) => (a.date < b.date ? -1 : 1))

/** Still on the books in this month: not left before it began. */
export const workingIn = (e: Employee, month: MonthKey) => e.status !== 'left' || !e.leftOn || e.leftOn.slice(0, 7) >= month

/** Salary and commission for one month. Advances given in the month come off that month's salary. */
export const payrollFor = (db: Db, month: MonthKey) =>
  memo(db, 'payroll:' + month, () => {
    const inMonth = (x: { date: string }) => x.date.slice(0, 7) === month
    const paidOf = (employeeId: string, kind: PayrollLine['kind']) =>
      sum(db.payroll.filter((p) => p.month === month).flatMap((p) => p.lines).filter((l) => l.employeeId === employeeId && l.kind === kind), (l) => l.amount)

    const staff = db.employees.filter((e) => workingIn(e, month))
    const salary: SalaryRow[] = staff.filter((e) => e.payType === 'salary').map((e) => {
      const advance = sum(db.advances.filter((a) => a.employeeId === e.id && inMonth(a)), (a) => a.amount)
      const paid = paidOf(e.id, 'salary')
      return { e, salary: e.salary, advance, paid, toPay: Math.max(e.salary - advance - paid, 0) }
    })
    const sales: SalesRow[] = staff.filter((e) => e.payType === 'sales').map((e) => {
      const invs = db.invoices.filter((i) => i.status === 'final' && !i.sample && i.soldBy === e.id && inMonth(i))
      const sold = sum(invs, invNet)
      const collected = sum(invs, (i) => i.received || 0) + sum(db.collections.filter((c) => c.collectedBy === e.id && inMonth(c)), (c) => c.amount)
      const commission = Math.round(((e.commissionOn === 'collection' ? collected : sold) * (e.rate || 0)) / 100)
      const paid = paidOf(e.id, 'commission')
      return { e, dealers: db.dealers.filter((d) => d.salesId === e.id).length, sold, collected, commission, paid, toPay: Math.max(commission - paid, 0) }
    })
    const daily: WageRow[] = staff.filter((e) => e.payType === 'daily').map((e) => {
      const ds = daysOf(db, e.id, month)
      const days = sum(ds, (x) => DAY_WEIGHT[x.status])
      const earned = Math.round(days * (e.dailyRate || 0))
      const advance = sum(db.advances.filter((a) => a.employeeId === e.id && inMonth(a)), (a) => a.amount)
      const paid = paidOf(e.id, 'wage')
      return { e, days, absent: ds.filter((x) => x.status === 'absent').length, leave: ds.filter((x) => x.status === 'leave').length, output: sum(ds, (x) => x.output || 0), earned, advance, paid, toPay: Math.max(earned - advance - paid, 0) }
    })
    const end = month + '-31'
    const contract: ContractRow[] = staff.filter((e) => e.payType === 'contract' && e.contract && e.contract.start.slice(0, 7) <= month).map((e) => {
      const c = e.contract!
      const lines = db.payroll.filter((p) => p.month <= month).flatMap((p) => p.lines.map((l) => ({ l, month: p.month }))).filter((x) => x.l.employeeId === e.id && x.l.kind === 'contract')
      const paidAll = sum(lines, (x) => x.l.amount)
      const span = Math.max(1, (Date.parse(c.end) - Date.parse(c.start)) / 864e5)
      return {
        e, amount: c.amount, paidMonth: sum(lines.filter((x) => x.month === month), (x) => x.l.amount), paidAll, toPay: Math.max(c.amount - paidAll, 0),
        timeGone: Math.min(1, Math.max(0, (Date.parse(end > c.end ? c.end : end) - Date.parse(c.start)) / 864e5 / span)),
      }
    })
    return {
      salary, sales, daily, contract,
      wages: sum(daily, (r) => r.earned),
      wagesToPay: sum(daily, (r) => r.toPay),
      contractPaid: sum(contract, (r) => r.paidMonth),
      contractToPay: sum(contract, (r) => r.toPay),
      salaryTotal: sum(salary, (r) => r.salary),
      salaryToPay: sum(salary, (r) => r.toPay),
      advances: sum(salary, (r) => r.advance) + sum(daily, (r) => r.advance),
      commission: sum(sales, (r) => r.commission),
      commissionToPay: sum(sales, (r) => r.toPay),
    }
  })

/* ---------------------------------------------------------------- leave */

export const LEAVE_KINDS: Record<LeaveKind, string> = { casual: 'Casual leave', sick: 'Sick leave', annual: 'Annual leave', unpaid: 'Unpaid leave', other: 'Other' }
export const LEAVE_TONE: Record<LeaveRequest['status'], 'warn' | 'good' | 'neutral' | 'muted'> = { pending: 'warn', approved: 'good', declined: 'neutral', cancelled: 'muted' }
export const LEAVE_STATUS: Record<LeaveRequest['status'], string> = { pending: 'Waiting for approval', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' }

/** Every date from `from` to `to`, both included. */
export const datesBetween = (from: ISODate, to: ISODate): ISODate[] => {
  const out: ISODate[] = []
  for (let t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'); t <= end && out.length < 400; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
/** How many days a request takes off: half a day, or every day in the range. */
export const leaveDays = (r: Pick<LeaveRequest, 'from' | 'to' | 'half'>) => (r.half ? 0.5 : datesBetween(r.from, r.to).length)

export interface LeaveBalance { kind: LeaveKind; label: string; quota: number | null; used: number; pending: number; left: number | null }

/** Leave taken and left this year for one person, by kind. */
export const leaveBalance = (db: Db, employeeId: string, year = new Date().getFullYear()): LeaveBalance[] => {
  const mine = (db.leaveRequests || []).filter((r) => r.employeeId === employeeId && r.from.slice(0, 4) === String(year))
  return (Object.keys(LEAVE_KINDS) as LeaveKind[]).map((kind) => {
    const quota = db.leaveQuota?.[kind] ?? null
    const used = sum(mine.filter((r) => r.kind === kind && r.status === 'approved'), leaveDays)
    const pending = sum(mine.filter((r) => r.kind === kind && r.status === 'pending'), leaveDays)
    return { kind, label: LEAVE_KINDS[kind], quota, used, pending, left: quota == null ? null : Math.max(quota - used, 0) }
  })
}

/** Requests, newest first; only pending ones when `pending` is set. */
export const leaveList = (db: Db, opts: { employeeId?: string; pending?: boolean } = {}): LeaveRequest[] =>
  (db.leaveRequests || []).filter((r) => (!opts.employeeId || r.employeeId === opts.employeeId) && (!opts.pending || r.status === 'pending'))
    .sort((a, b) => (a.status === 'pending') !== (b.status === 'pending') ? (a.status === 'pending' ? -1 : 1) : a.askedAt < b.askedAt ? 1 : -1)
