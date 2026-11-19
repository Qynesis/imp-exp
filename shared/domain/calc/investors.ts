import { addMonths, thisMonth } from '../format'
import type { Db, Investor, InvestorTxn, InvestorTxnKind, MonthKey } from '../types'
import { memo, sum } from './common'
import { profitAndLoss } from './reports'

const r2 = (n: number) => Math.round(n * 100) / 100

export const INVESTOR_TXN: Record<InvestorTxnKind, string> = {
  invest: 'Capital added',
  withdraw: 'Capital taken back',
  share: 'Profit share',
  payout: 'Profit paid',
  reinvest: 'Profit added to capital',
}

export const investors = (db: Db): Investor[] => db.investors || []
export const investorTxns = (db: Db): InvestorTxn[] => db.investorTxns || []

export interface InvestorRow {
  investor: Investor
  /** Capital in the business now: added + reinvested − taken back. */
  capital: number
  /** Share of the total capital of active investors, 0 to 1. */
  ownership: number
  /** Profit shared to them so far. */
  shared: number
  /** Profit paid out or reinvested. */
  taken: number
  /** Profit shared but not yet paid or reinvested. */
  available: number
  lastDate: string | null
}

const capitalOf = (txns: InvestorTxn[]) => r2(sum(txns, (t) => (t.kind === 'invest' || t.kind === 'reinvest' ? t.amount : t.kind === 'withdraw' ? -t.amount : 0)))

/** Every investor with capital, ownership and profit still owed to them. */
export const investorRows = (db: Db): InvestorRow[] =>
  memo(db, 'investors', () => {
    const rows = investors(db).map((investor) => {
      const txns = investorTxns(db).filter((t) => t.investorId === investor.id)
      const shared = r2(sum(txns.filter((t) => t.kind === 'share'), (t) => t.amount))
      const taken = r2(sum(txns.filter((t) => t.kind === 'payout' || t.kind === 'reinvest'), (t) => t.amount))
      const last = txns.map((t) => t.date).sort().pop() || null
      return { investor, capital: capitalOf(txns), ownership: 0, shared, taken, available: r2(shared - taken), lastDate: last }
    })
    const total = sum(rows.filter((r) => r.investor.status === 'active' && r.capital > 0), (r) => r.capital)
    for (const r of rows) r.ownership = total > 0 && r.investor.status === 'active' && r.capital > 0 ? r.capital / total : 0
    return rows
  })

/** The first month with anything in the books that counts toward profit. */
function firstMonth(db: Db): MonthKey {
  const dates = [
    ...db.invoices.filter((i) => i.status === 'final' && !i.sample).map((i) => i.date),
    ...db.expenses.map((e) => e.date),
    ...db.payroll.map((p) => p.month + '-01'),
    ...(db.assets || []).flatMap((a) => a.depreciation.map((x) => x.month + '-01')),
    ...db.imports.flatMap((s) => (s.steps.shipped?.date && s.direction === 'export' ? [s.steps.shipped.date] : [])),
  ].filter(Boolean)
  return (dates.sort()[0] || thisMonth()).slice(0, 7)
}

export interface ProfitPool {
  /** Net profit of every month from the first record to this month. */
  total: number
  distributed: number
  /** Profit not yet shared out. Negative after a loss. */
  pool: number
  capital: number
  months: { month: MonthKey; net: number }[]
}

export const profitPool = (db: Db): ProfitPool =>
  memo(db, 'profitPool', () => {
    const months: { month: MonthKey; net: number }[] = []
    const end = thisMonth()
    for (let m = firstMonth(db); m <= end && months.length < 600; m = addMonths(m, 1)) months.push({ month: m, net: profitAndLoss(db, m).net })
    const total = r2(sum(months, (x) => x.net))
    const distributed = r2(sum(db.distributions || [], (d) => d.amount))
    const capital = r2(sum(investorRows(db).filter((r) => r.investor.status === 'active'), (r) => Math.max(r.capital, 0)))
    return { total, distributed, pool: r2(total - distributed), capital, months }
  })

/** How a distribution of `amount` splits by ownership today. The last paisa of rounding goes to the biggest share. */
export function splitProfit(db: Db, amount: number): { investorId: string; amount: number; ownership: number }[] {
  const rows = investorRows(db).filter((r) => r.ownership > 0)
  const parts = rows.map((r) => ({ investorId: r.investor.id, ownership: r.ownership, amount: r2(amount * r.ownership) }))
  const diff = r2(amount - sum(parts, (p) => p.amount))
  if (diff && parts.length) {
    const biggest = parts.reduce((a, b) => (b.amount > a.amount ? b : a))
    biggest.amount = r2(biggest.amount + diff)
  }
  return parts
}

/** One investor's statement, oldest first, with the capital and unpaid profit after each line. */
export function investorStatement(db: Db, investorId: string) {
  let capital = 0
  let available = 0
  return investorTxns(db)
    .filter((t) => t.investorId === investorId)
    .sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1))
    .map((t) => {
      if (t.kind === 'invest') capital += t.amount
      if (t.kind === 'withdraw') capital -= t.amount
      if (t.kind === 'share') available += t.amount
      if (t.kind === 'payout') available -= t.amount
      if (t.kind === 'reinvest') {
        available -= t.amount
        capital += t.amount
      }
      return { ...t, capital: r2(capital), available: r2(available) }
    })
}
