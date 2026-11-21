import type { Db, MonthKey } from '../types'
import { memo, sum } from './common'
import { assetGainIn, depreciationIn } from './assets'
import { invNet } from './dealers'
import { expenseRows } from './expenses'
import { payrollFor } from './payroll'
import { shipmentCalc } from './shipments'

export const profitAndLoss = (db: Db, month: MonthKey) =>
  memo(db, 'pnl:' + month, () => {
    const invs = db.invoices.filter((i) => i.status === 'final' && !i.sample && i.date.slice(0, 7) === month)
    const sales = sum(invs, invNet)
    const cogs = sum(invs, (i) => sum(i.lines, (l) => l.qty * (l.cost || 0)))
    const pr = payrollFor(db, month)
    // one-time expenses, and charges on regular expense accounts as they fall due (paid or not)
    const exp = expenseRows(db, month + '-01', month + '-31')
    const exports = db.imports.filter((s) => s.direction === 'export' && s.steps.shipped?.date?.slice(0, 7) === month)
    const exportSales = sum(exports, (s) => s.usd * s.rate)
    const exportCost = sum(exports, (s) => shipmentCalc(db, s).goodsCost + sum(s.costs, (c) => c.amount))
    const gross = sales + exportSales - cogs - exportCost
    const expenses = [
      { label: 'Salaries', amount: pr.salaryTotal },
      { label: 'Sales commission', amount: pr.commission },
      { label: 'Transport', amount: sum(exp.filter((e) => e.head === 'Transport'), (e) => e.amount) },
    ]
    const heads = new Map<string, number>()
    for (const e of exp) if (e.head !== 'Transport') heads.set(e.head, (heads.get(e.head) || 0) + e.amount)
    for (const [label, amount] of [...heads.entries()].sort((a, b) => b[1] - a[1])) expenses.push({ label, amount })
    const depreciation = depreciationIn(db, month)
    if (depreciation > 0) expenses.push({ label: 'Depreciation of fixed assets', amount: depreciation })
    // profit or loss on assets sold or scrapped this month
    const assetGain = assetGainIn(db, month)
    return { sales, exportSales, exportCost, exports: exports.length, cogs, gross, expenses, assetGain, net: gross - sum(expenses, (e) => e.amount) + assetGain, invoices: invs.length }
  })
