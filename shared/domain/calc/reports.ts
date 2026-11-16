import type { Db, MonthKey } from '../types'
import { memo, sum } from './common'
import { invTotal } from './dealers'
import { payrollFor } from './payroll'
import { shipmentCalc } from './shipments'

export const profitAndLoss = (db: Db, month: MonthKey) =>
  memo(db, 'pnl:' + month, () => {
    const invs = db.invoices.filter((i) => i.status === 'final' && i.date.slice(0, 7) === month)
    const sales = sum(invs, invTotal)
    const cogs = sum(invs, (i) => sum(i.lines, (l) => l.qty * (l.cost || 0)))
    const pr = payrollFor(db, month)
    const exp = db.expenses.filter((e) => e.date.slice(0, 7) === month)
    const exports = db.imports.filter((s) => s.direction === 'export' && s.steps.shipped?.date?.slice(0, 7) === month)
    const exportSales = sum(exports, (s) => s.usd * s.rate)
    const exportCost = sum(exports, (s) => shipmentCalc(db, s).goodsCost + sum(s.costs, (c) => c.amount))
    const gross = sales + exportSales - cogs - exportCost
    const expenses = [
      { label: 'Salaries', amount: pr.salaryTotal },
      { label: 'Sales commission', amount: pr.commission },
      { label: 'Transport', amount: sum(exp.filter((e) => e.head === 'Transport'), (e) => e.amount) },
      { label: 'Office and other', amount: sum(exp.filter((e) => e.head !== 'Transport'), (e) => e.amount) },
    ]
    return { sales, exportSales, exportCost, exports: exports.length, cogs, gross, expenses, net: gross - sum(expenses, (e) => e.amount), invoices: invs.length }
  })
