/** Factories, suppliers and employees seen as people we work with: one summary row each, and a profile. */
import { addMonths, thisMonth } from '../format'
import type { Db, Employee, Factory, ISODate, MonthKey } from '../types'
import { byId, memo, sum } from './common'
import { dealerLedger, invNet } from './dealers'
import { foCalc } from './factory'
import { payrollFor } from './payroll'

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
      const bills = db.invoices.filter((x) => x.status === 'final' && !x.sample && x.soldBy === employeeId && x.date.slice(0, 7) === month)
      const paid = (kind: 'salary' | 'commission') => sum(db.payroll.filter((p) => p.month === month).flatMap((p) => p.lines).filter((l) => l.employeeId === employeeId && l.kind === kind), (l) => l.amount)
      months.push({
        month, sold: Math.round(sum(bills, invNet)), bills: bills.length, collected: sales?.collected ?? sum(db.collections.filter((c) => c.collectedBy === employeeId && c.date.slice(0, 7) === month), (c) => c.amount),
        commission: sales?.commission || 0, salary: sal?.salary || 0, advance: sal?.advance || 0, paidSalary: paid('salary'), paidCommission: paid('commission'),
        toPay: (sal?.toPay || 0) + (sales?.toPay || 0), target: employee.salesTarget || 0,
      })
    }
    const dealers = db.dealers.filter((d) => d.salesId === employeeId && !d.sample).map((d) => {
      const l = dealerLedger(db, d.id)
      return { id: d.id, name: d.name, due: l.due, overdue: l.overdue }
    }).sort((a, b) => b.due - a.due)
    const recentBills = db.invoices.filter((x) => x.status === 'final' && !x.sample && x.soldBy === employeeId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
      .map((x) => ({ id: x.id, date: x.date, dealer: byId(db.dealers, x.dealerId)?.name || '', amount: invNet(x) }))
    const payments = [
      ...db.payroll.flatMap((p) => p.lines.filter((l) => l.employeeId === employeeId).map((l) => ({ date: p.date, month: p.month, kind: l.kind === 'salary' ? 'Salary' : 'Commission', amount: l.amount, method: p.method }))),
      ...db.advances.filter((a) => a.employeeId === employeeId).map((a) => ({ date: a.date, month: a.date.slice(0, 7), kind: 'Advance', amount: a.amount, method: a.method })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1))
    const user = db.users.find((u) => u.employeeId === employeeId)
    return { employee, months, thisMonth: months[months.length - 1], dealers, recentBills, payments, login: user ? { email: user.email, roleId: user.roleId } : null }
  })
