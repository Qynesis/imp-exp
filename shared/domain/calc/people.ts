/** Factories, suppliers and employees seen as people we work with: one summary row each, and a profile. */
import { addMonths, thisMonth } from '../format'
import type { Db, Employee, Factory, ISODate, JobEvent, MonthKey, WorkDay } from '../types'
import { byId, memo, sum } from './common'
import { dealerLedger, invNet } from './dealers'
import { foCalc } from './factory'
import { DAY_WEIGHT, daysOf, payrollFor } from './payroll'

/* ---------------------------------------------------------------- factories */

export interface FactoryRow {
  factory: Factory
  orders: number
  open: number
  /** Order value: qty × rate of every order. */
  ordered: number
  billed: number
  paid: number
  /** Positive: the factory owes us (advance); negative: we owe the factory. */
  balance: number
  pendingQty: number
  products: string[]
  lastOrder: ISODate | null
}

export const factoryRows = (db: Db): FactoryRow[] =>
  memo(db, 'factoryRows', () => db.factories.map((factory) => {
    const orders = db.factoryOrders.filter((o) => o.factoryId === factory.id)
    const calcs = orders.map((o) => ({ o, c: foCalc(db, o) }))
    return {
      factory,
      orders: orders.length,
      open: calcs.filter(({ c }) => c.pending > 0 || Math.abs(c.balance) > 0.5).length,
      ordered: sum(orders, (o) => o.qty * o.rate),
      billed: sum(calcs, (x) => x.c.billed),
      paid: sum(calcs, (x) => x.c.paid),
      balance: sum(calcs, (x) => x.c.balance),
      pendingQty: sum(calcs, (x) => x.c.pending),
      products: [...new Set(calcs.map((x) => x.c.product?.name).filter((n): n is string => !!n))],
      lastOrder: orders.map((o) => o.placed).sort().pop() || null,
    }
  }))

/** Factories to offer when picking one: those still in use, plus the one already chosen. */
export const activeFactories = (db: Db, keep?: string): Factory[] => db.factories.filter((f) => !f.archived || f.id === keep)

/* ---------------------------------------------------------------- suppliers and what they give us */

export interface SupplyRow {
  supplierId: string
  supplierName: string
  productId: string
  productName: string
  unit: string
  purchases: number
  qty: number
  amount: number
  lastRate: number
  avgRate: number
  minRate: number
  maxRate: number
  lastDate: ISODate
}

/** Every item each supplier has sent us: how often, how much, and at what prices. */
export const supplyRows = (db: Db, supplierId?: string): SupplyRow[] =>
  memo(db, 'supply:' + (supplierId || '*'), () => {
    const map = new Map<string, SupplyRow>()
    const list = db.purchases.filter((p) => !supplierId || p.supplierId === supplierId).sort((a, b) => (a.date < b.date ? -1 : 1))
    for (const p of list) {
      const key = p.supplierId + '|' + p.productId
      const prod = byId(db.products, p.productId)
      const row = map.get(key) || {
        supplierId: p.supplierId, supplierName: byId(db.suppliers, p.supplierId)?.name || 'Supplier', productId: p.productId, productName: prod?.name || 'Item', unit: prod?.unit || '',
        purchases: 0, qty: 0, amount: 0, lastRate: 0, avgRate: 0, minRate: Infinity, maxRate: 0, lastDate: p.date,
      }
      row.purchases++
      row.qty += p.qty
      row.amount += p.qty * p.rate
      row.lastRate = p.rate
      row.lastDate = p.date
      row.minRate = Math.min(row.minRate, p.rate)
      row.maxRate = Math.max(row.maxRate, p.rate)
      map.set(key, row)
    }
    return [...map.values()].map((r) => ({ ...r, avgRate: r.qty ? Math.round((r.amount / r.qty) * 100) / 100 : 0, minRate: Number.isFinite(r.minRate) ? r.minRate : 0 }))
      .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1))
  })

/* ---------------------------------------------------------------- employees */

export interface EmployeeMonth {
  month: MonthKey
  sold: number
  bills: number
  collected: number
  commission: number
  salary: number
  advance: number
  paidSalary: number
  paidCommission: number
  /** Daily workers: days counted for pay, wage earned and paid. */
  days: number
  absent: number
  output: number
  wages: number
  paidWages: number
  paidContract: number
  toPay: number
  target: number
}

export interface EmployeeProfile {
  employee: Employee
  months: EmployeeMonth[]
  thisMonth: EmployeeMonth
  dealers: { id: string; name: string; due: number; overdue: boolean }[]
  recentBills: { id: string; date: ISODate; dealer: string; amount: number }[]
  payments: { date: ISODate; month: MonthKey; kind: string; amount: number; method: string }[]
  /** Sign-in for this person, if they have one. */
  login: { email: string; roleId: string } | null
  /** Last 60 days of the attendance register, newest first. */
  attendance: WorkDay[]
  /** All time: days marked present (half days count 0.5), absent and on leave. */
  totals: { days: number; absent: number; leave: number; output: number; earned: number; paid: number }
  /** Contract staff: how much of the contract is paid. */
  contract: { amount: number; paid: number; left: number } | null
  /** Job history, newest first. */
  history: JobEvent[]
}

export const employeeProfile = (db: Db, employeeId: string, count = 6): EmployeeProfile =>
  memo(db, `emp:${employeeId}:${count}`, () => {
    const employee = byId(db.employees, employeeId)!
    const months: EmployeeMonth[] = []
    for (let i = count - 1; i >= 0; i--) {
      const month = addMonths(thisMonth(), -i)
      const pr = payrollFor(db, month)
      const sal = pr.salary.find((r) => r.e.id === employeeId)
      const sales = pr.sales.find((r) => r.e.id === employeeId)
      const wage = pr.daily.find((r) => r.e.id === employeeId)
      const bills = db.invoices.filter((x) => x.status === 'final' && !x.sample && x.soldBy === employeeId && x.date.slice(0, 7) === month)
      const paid = (kind: 'salary' | 'commission' | 'wage' | 'contract') => sum(db.payroll.filter((p) => p.month === month).flatMap((p) => p.lines).filter((l) => l.employeeId === employeeId && l.kind === kind), (l) => l.amount)
      months.push({
        month, sold: Math.round(sum(bills, invNet)), bills: bills.length, collected: sales?.collected ?? sum(db.collections.filter((c) => c.collectedBy === employeeId && c.date.slice(0, 7) === month), (c) => c.amount),
        commission: sales?.commission || 0, salary: sal?.salary || 0, advance: (sal?.advance || 0) + (wage?.advance || 0), paidSalary: paid('salary'), paidCommission: paid('commission'),
        days: wage?.days ?? sum(daysOf(db, employeeId, month), (d) => DAY_WEIGHT[d.status]), absent: wage?.absent ?? daysOf(db, employeeId, month).filter((d) => d.status === 'absent').length,
        output: wage?.output ?? sum(daysOf(db, employeeId, month), (d) => d.output || 0), wages: wage?.earned || 0, paidWages: paid('wage'), paidContract: paid('contract'),
        toPay: (sal?.toPay || 0) + (sales?.toPay || 0) + (wage?.toPay || 0), target: employee.salesTarget || 0,
      })
    }
    const dealers = db.dealers.filter((d) => d.salesId === employeeId && !d.sample).map((d) => {
      const l = dealerLedger(db, d.id)
      return { id: d.id, name: d.name, due: l.due, overdue: l.overdue }
    }).sort((a, b) => b.due - a.due)
    const recentBills = db.invoices.filter((x) => x.status === 'final' && !x.sample && x.soldBy === employeeId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
      .map((x) => ({ id: x.id, date: x.date, dealer: byId(db.dealers, x.dealerId)?.name || '', amount: invNet(x) }))
    const payments = [
      ...db.payroll.flatMap((p) => p.lines.filter((l) => l.employeeId === employeeId).map((l) => ({ date: p.date, month: p.month, kind: ({ salary: 'Salary', commission: 'Commission', wage: 'Daily wage', contract: 'Contract' } as const)[l.kind], amount: l.amount, method: p.method }))),
      ...db.advances.filter((a) => a.employeeId === employeeId).map((a) => ({ date: a.date, month: a.date.slice(0, 7), kind: 'Advance', amount: a.amount, method: a.method })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1))
    const user = db.users.find((u) => u.employeeId === employeeId)
    const all = daysOf(db, employeeId)
    const lines = db.payroll.flatMap((p) => p.lines).filter((l) => l.employeeId === employeeId)
    const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
    const c = employee.contract
    const contractPaid = sum(lines.filter((l) => l.kind === 'contract'), (l) => l.amount)
    return {
      employee, months, thisMonth: months[months.length - 1], dealers, recentBills, payments, login: user ? { email: user.email, roleId: user.roleId } : null,
      attendance: all.filter((d) => d.date >= since).reverse(),
      totals: {
        days: sum(all, (d) => DAY_WEIGHT[d.status]), absent: all.filter((d) => d.status === 'absent').length, leave: all.filter((d) => d.status === 'leave').length,
        output: sum(all, (d) => d.output || 0), earned: Math.round(sum(all, (d) => DAY_WEIGHT[d.status]) * (employee.dailyRate || 0)), paid: sum(lines, (l) => l.amount),
      },
      contract: employee.payType === 'contract' && c ? { amount: c.amount, paid: contractPaid, left: Math.max(c.amount - contractPaid, 0) } : null,
      history: [...(employee.history || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }
  })

/* ---------------------------------------------------------------- the staff list */

export const PAY_TYPES: Record<Employee['payType'], string> = { salary: 'Monthly salary', sales: 'Sales commission', daily: 'Daily wage', contract: 'Contract' }

export interface StaffRow {
  e: Employee
  kind: 'staff' | 'worker'
  left: boolean
  /** Their mark in the register on `date`, if any. */
  today: WorkDay | null
  /** This month: days worked (daily), what is owed now. */
  days: number
  toPay: number
  hasLogin: boolean
  /** "Tk 18,000 a month", "Tk 650 a day"… */
  pay: string
}

/** Everyone on the books with what matters at a glance, for the admin's list. */
export const staffRows = (db: Db, date: ISODate, money: (n: number) => string): StaffRow[] =>
  memo(db, 'staffRows:' + date, () => {
    const month = date.slice(0, 7)
    const pr = payrollFor(db, month)
    return db.employees.map((e) => {
      const owed = (pr.salary.find((r) => r.e.id === e.id)?.toPay || 0) + (pr.sales.find((r) => r.e.id === e.id)?.toPay || 0) + (pr.daily.find((r) => r.e.id === e.id)?.toPay || 0) + (pr.contract.find((r) => r.e.id === e.id)?.toPay || 0)
      return {
        e, kind: e.kind || 'staff', left: e.status === 'left',
        today: (db.attendance || []).find((a) => a.employeeId === e.id && a.date === date) || null,
        days: sum(daysOf(db, e.id, month), (d) => DAY_WEIGHT[d.status]),
        toPay: owed, hasLogin: db.users.some((u) => u.employeeId === e.id),
        pay: e.payType === 'sales' ? `${e.rate}% of ${e.commissionOn === 'collection' ? 'collection' : 'sales'}` : e.payType === 'daily' ? `${money(e.dailyRate || 0)} a day` : e.payType === 'contract' ? `${money(e.contract?.amount || 0)} contract` : `${money(e.salary)} a month`,
      }
    }).sort((a, b) => Number(a.left) - Number(b.left) || a.e.name.localeCompare(b.e.name))
  })

/** Names for the lines of a job history. */
export const JOB_EVENT_KINDS: Record<JobEvent['kind'], string> = {
  joined: 'Joined', role: 'Job or promotion', pay: 'Pay change', department: 'Moved department', contract: 'Contract', note: 'Note, training or award', left: 'Left', rejoined: 'Came back', transfer: 'Transfer',
}
