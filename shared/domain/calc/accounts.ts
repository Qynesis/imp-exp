/**
 * The chart of accounts, worked out from the records: nothing is posted twice, so it always agrees with
 * the other screens. Balance accounts (assets, liabilities, equity) are as of the end date; income,
 * cost and expense accounts cover the period. Each account lists the records behind it.
 */
import { EXPENSE_HEADS } from '../catalog'
import { addMonths, fmonth } from '../format'
import type { Db, ISODate, PageId } from '../types'
import { assetGainIn, assetSummary, depreciationIn } from './assets'
import { accountBalances } from './cashbook'
import { memo, sum } from './common'
import { receivables } from './dealers'
import { expenseAccountTotals, expenseRows } from './expenses'
import { investorRows, profitPool } from './investors'
import { payables } from './payables'
import { payrollFor } from './payroll'
import { saleFacts } from './sales'
import { computeShipment } from './shipments'
import { taxReport } from './tax'

export type AccountGroup = 'asset' | 'liability' | 'equity' | 'income' | 'cost' | 'expense' | 'costing' | 'tax'
export const ACCOUNT_GROUPS: Record<AccountGroup, { label: string; note: string; code: number }> = {
  asset: { label: 'Assets', note: 'What the company owns, as of the end date', code: 1000 },
  liability: { label: 'Liabilities', note: 'What the company owes, as of the end date', code: 2000 },
  equity: { label: 'Owners’ equity', note: 'Capital and profit kept in the business', code: 3000 },
  income: { label: 'Income', note: 'Earned in the period, without VAT', code: 4000 },
  cost: { label: 'Cost of sales', note: 'Cost of the goods sold in the period', code: 5000 },
  expense: { label: 'Expenses', note: 'Spent running the business in the period', code: 6000 },
  costing: { label: 'Costing (added to stock cost)', note: 'Bought, imported or made in the period; becomes stock, not an expense', code: 7000 },
  tax: { label: 'VAT and tax', note: 'Charged, paid and owed in the period', code: 8000 },
}

export interface AccountRow {
  date: ISODate | ''
  details: string
  amount: number
}
export interface LedgerAccount {
  code: string
  name: string
  group: AccountGroup
  amount: number
  /** The screen with the full detail. */
  page?: PageId
  to?: string
  rows: AccountRow[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const inRange = (d: string | undefined, from: ISODate, to: ISODate) => !!d && d >= from && d <= to

export const chartOfAccounts = (db: Db, from: ISODate, to: ISODate): LedgerAccount[] =>
  memo(db, `coa:${from}:${to}`, () => {
    const out: LedgerAccount[] = []
    const add = (group: AccountGroup, code: number, name: string, amount: number, rows: AccountRow[] = [], page?: PageId, link?: string) =>
      out.push({ code: String(code), name, group, amount: r2(amount), rows, page, to: link || page })

    /* ----- assets ----- */
    accountBalances(db, to).forEach((a, i) => add('asset', 1010 + i * 10, a.account === 'Cash' ? 'Cash in hand' : `${a.account} account`, a.balance, [], 'cashbook'))
    const rec = receivables(db)
    add('asset', 1100, 'Dealer dues (receivable)', rec.total, rec.rows.map((r) => ({ date: '', details: `${r.dealer.name} · ${r.statusText}`, amount: r.due })), 'dealers')
    const stock = (kinds: string[]) => db.products.filter((p) => !p.archived && kinds.includes(p.kind) && p.stock > 0)
    add('asset', 1210, 'Stock: finished goods', sum(stock(['finished']), (p) => p.stock * p.cost), stock(['finished']).map((p) => ({ date: '', details: `${p.name}: ${p.stock} ${p.unit} × ${p.cost}`, amount: r2(p.stock * p.cost) })), 'products')
    add('asset', 1220, 'Stock: raw materials and packaging', sum(stock(['raw', 'packaging']), (p) => p.stock * p.cost), stock(['raw', 'packaging']).map((p) => ({ date: '', details: `${p.name}: ${p.stock} ${p.unit} × ${p.cost}`, amount: r2(p.stock * p.cost) })), 'raw-materials')
    const pay = payables(db)
    add('asset', 1300, 'Advances to factories', pay.advanceTotal, pay.advances.map((a) => ({ date: '', details: `${a.name} · ${a.orderId}`, amount: a.amount })), 'factory-orders')
    const exp = expenseAccountTotals(db)
    add('asset', 1310, 'Expenses paid ahead (advance)', exp.advance, exp.rows.filter((r) => r.balance < 0).map((r) => ({ date: '', details: r.account.name, amount: -r.balance })), 'expenses', 'expenses/regular')
    const tax = taxReport(db, from, to)
    if (tax.balance < 0) add('asset', 1320, 'VAT to set off (input more than output)', -tax.balance, [], 'accounts', 'accounts/tax')
    const assets = assetSummary(db)
    add('asset', 1400, 'Fixed assets at book value', assets.nbv, assets.byCategory.map((c) => ({ date: '', details: `${c.category} (${c.count})`, amount: r2(c.nbv) })), 'fixed-assets')

    /* ----- liabilities ----- */
    const kind = (k: string) => pay.rows.filter((r) => r.kind === k)
    add('liability', 2010, 'Supplier dues (payable)', sum(kind('supplier'), (r) => r.due), kind('supplier').map((r) => ({ date: '', details: r.name, amount: r.due })), 'suppliers')
    add('liability', 2020, 'Factory dues (payable)', sum(kind('factory'), (r) => r.due), kind('factory').map((r) => ({ date: '', details: `${r.name} · ${r.meta}`, amount: r.due })), 'factory-orders')
    add('liability', 2030, 'Transport hire due', sum(kind('transport'), (r) => r.due), kind('transport').map((r) => ({ date: '', details: r.name, amount: r.due })), 'transport')
    add('liability', 2100, 'Expenses due (not yet paid)', exp.due, exp.rows.filter((r) => r.balance > 0).map((r) => ({ date: '', details: r.account.name, amount: r.balance })), 'expenses', 'expenses/regular')
    if (tax.balance >= 0) add('liability', 2200, 'VAT / tax payable', tax.balance, [], 'accounts', 'accounts/tax')
    const inv = investorRows(db)
    add('liability', 2300, 'Profit owed to investors', sum(inv, (r) => Math.max(r.available, 0)), inv.filter((r) => r.available > 0).map((r) => ({ date: '', details: r.investor.name, amount: r.available })), 'investors')

    /* ----- equity ----- */
    const pool = profitPool(db)
    add('equity', 3010, 'Investor capital', sum(inv, (r) => Math.max(r.capital, 0)), inv.map((r) => ({ date: '', details: r.investor.name, amount: r.capital })), 'investors')
    add('equity', 3020, 'Profit kept in the business', pool.pool, pool.months.slice(-12).map((m) => ({ date: '', details: fmonth(m.month), amount: m.net })), 'reports')

    /* ----- income and cost of sales ----- */
    const facts = saleFacts(db).filter((f) => inRange(f.date, from, to))
    add('income', 4010, 'Sales (without VAT)', sum(facts, (f) => f.total), facts.map((f) => ({ date: f.date, details: `Bill ${f.id}`, amount: f.total })), 'sell')
    const exports = db.imports.filter((s) => s.direction === 'export' && inRange(s.steps.shipped?.date, from, to))
    add('income', 4020, 'Export sales', sum(exports, (s) => s.usd * s.rate), exports.map((s) => ({ date: s.steps.shipped?.date || '', details: `${s.id} · USD ${s.usd}`, amount: r2(s.usd * s.rate) })), 'imports')
    const months: string[] = []
    for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 240; m = addMonths(m, 1)) months.push(m)
    const gain = sum(months, (m) => assetGainIn(db, m))
    if (gain) add('income', 4030, gain >= 0 ? 'Profit on assets sold' : 'Loss on assets sold', gain, [], 'fixed-assets')
    add('cost', 5010, 'Cost of goods sold', sum(facts, (f) => f.cost), facts.map((f) => ({ date: f.date, details: `Bill ${f.id}`, amount: r2(f.cost) })), 'reports')
    add('cost', 5020, 'Cost of exports', sum(exports, (s) => computeShipment(db, s).goodsCost + sum(s.costs, (c) => c.amount)), [], 'imports')

    /* ----- expenses, by head ----- */
    const pr = months.map((m) => ({ m, p: payrollFor(db, m) }))
    add('expense', 6010, 'Salaries', sum(pr, (x) => x.p.salaryTotal), pr.map((x) => ({ date: '', details: fmonth(x.m), amount: x.p.salaryTotal })), 'employees')
    add('expense', 6020, 'Sales commission', sum(pr, (x) => x.p.commission), pr.map((x) => ({ date: '', details: fmonth(x.m), amount: x.p.commission })), 'employees')
    add('expense', 6030, 'Workers’ wages and contracts', sum(pr, (x) => x.p.wages + x.p.contractPaid), pr.filter((x) => x.p.wages + x.p.contractPaid).map((x) => ({ date: '', details: fmonth(x.m), amount: x.p.wages + x.p.contractPaid })), 'employees')
    const rows = expenseRows(db, from, to)
    const heads = [...new Set([...EXPENSE_HEADS, ...(db.accountHeads || []).filter((h) => h.group === 'expense').map((h) => h.name), ...rows.map((r) => r.head)])]
    heads.forEach((h, i) => {
      const own = (db.accountHeads || []).find((x) => x.name === h)
      const list = rows.filter((r) => r.head === h)
      add('expense', own?.code ? Number(own.code) || 6100 + i * 10 : 6100 + i * 10, h, sum(list, (r) => r.amount), list.map((r) => ({ date: r.date, details: `${r.details}${r.kind === 'regular' ? ' (regular)' : ''}`, amount: r.amount })), 'expenses', 'expenses/ledger')
    })
    add('expense', 6900, 'Depreciation', sum(months, (m) => depreciationIn(db, m)), [], 'fixed-assets')

    /* ----- costing ----- */
    const purchases = db.purchases.filter((p) => inRange(p.date, from, to))
    add('costing', 7010, 'Local purchases', sum(purchases, (p) => p.qty * p.rate), purchases.map((p) => ({ date: p.date, details: `${p.billNo || 'Purchase'} · ${db.products.find((x) => x.id === p.productId)?.name || ''}`, amount: r2(p.qty * p.rate) })), 'suppliers')
    const imports = db.imports.filter((s) => s.direction !== 'export')
    const lc = imports.filter((s) => inRange(s.steps.lc?.date, from, to))
    add('costing', 7100, 'Imports: LC value', sum(lc, (s) => s.usd * s.rate), lc.map((s) => ({ date: s.steps.lc?.date || '', details: `${s.id} · ${s.productName}`, amount: r2(s.usd * s.rate) })), 'imports')
    const costTypes = new Map<string, AccountRow[]>()
    for (const s of imports) for (const c of s.costs) if (!c.recoverable && inRange(c.date, from, to)) costTypes.set(c.type, [...(costTypes.get(c.type) || []), { date: c.date, details: s.id, amount: c.amount }])
    ;[...costTypes.entries()].forEach(([type, list], i) => add('costing', 7110 + i * 10, `Imports: ${type}`, sum(list, (r) => r.amount), list, 'imports'))
    const receipts = db.factoryOrders.flatMap((o) => o.receipts.filter((r) => inRange(r.date, from, to)).map((r) => ({ o, r })))
    add('costing', 7300, 'Factory goods received (making value)', sum(receipts, (x) => x.r.qty * x.o.rate), receipts.map((x) => ({ date: x.r.date, details: `${x.o.id} · ${x.r.challan || 'lot'}`, amount: r2(x.r.qty * x.o.rate) })), 'factory-orders')
    const freight = receipts.filter((x) => x.r.freightInCost && x.r.freight)
    add('costing', 7310, 'Freight added to stock cost', sum(freight, (x) => x.r.freight || 0), freight.map((x) => ({ date: x.r.date, details: x.o.id, amount: x.r.freight || 0 })), 'factory-orders')
    const made = (db.productions || []).filter((p) => inRange(p.date, from, to))
    add('costing', 7400, 'Workshop making cost', sum(made, (p) => p.extraCost), made.map((p) => ({ date: p.date, details: db.products.find((x) => x.id === p.productId)?.name || 'Production', amount: p.extraCost })), 'products')

    /* ----- tax ----- */
    add('tax', 8010, 'VAT / tax charged on sales', tax.outputTotal, tax.output.map((l) => ({ date: l.date, details: `${l.details} · ${l.name}`, amount: l.amount })), 'accounts', 'accounts/tax')
    add('tax', 8020, 'VAT paid on purchases and imports', tax.inputTotal, tax.input.map((l) => ({ date: l.date, details: l.details, amount: l.amount })), 'accounts', 'accounts/tax')
    add('tax', 8030, 'Advance income tax (AIT / withholding)', tax.advanceTotal, tax.advance.map((l) => ({ date: l.date, details: l.details, amount: l.amount })), 'accounts', 'accounts/tax')
    add('tax', 8040, 'VAT / tax paid to government', tax.paidTotal, tax.paid.map((p) => ({ date: p.date, details: `${p.ref || 'Payment'} · for ${p.period}`, amount: p.amount })), 'accounts', 'accounts/tax')

    return out
  })
