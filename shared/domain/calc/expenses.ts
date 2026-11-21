/**
 * Expenses, two ways:
 *  - one-time: an Expense row, paid when it is entered;
 *  - regular: an expense account (rent, electricity, a guard). Charges build up every period by
 *    themselves (or as bills entered by hand), payments go against the account in as many steps as
 *    needed, and the balance shows what is still owed (due) or paid ahead (advance).
 */
import { EXPENSE_HEADS } from '../catalog'
import { addDays, addMonths, fmonth, fdate, todayISO } from '../format'
import type { Db, ExpenseAccount, ExpenseEntry, ExpenseFrequency, ISODate } from '../types'
import { memo, sum } from './common'

export const FREQUENCIES: Record<ExpenseFrequency, string> = {
  daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year', variable: 'Bill amount changes (enter each bill)',
}
export const expenseAccounts = (db: Db): ExpenseAccount[] => db.expenseAccounts || []
export const expenseEntries = (db: Db): ExpenseEntry[] => db.expenseEntries || []

export interface Charge {
  date: ISODate
  /** 'YYYY-MM', 'YYYY' or a date. */
  period: string
  label: string
  amount: number
  /** auto: worked out from the account; bill: entered by hand. */
  source: 'auto' | 'bill'
  entryId?: string
}

/** The periods an account has run through by `upTo`, each with its key and start date. */
function periods(a: ExpenseAccount, upTo: ISODate): { period: string; date: ISODate; label: string }[] {
  const end = a.end && a.end < upTo ? a.end : upTo
  const out: { period: string; date: ISODate; label: string }[] = []
  if (a.start > end || a.frequency === 'variable') return out
  if (a.frequency === 'monthly') {
    for (let m = a.start.slice(0, 7); m <= end.slice(0, 7) && out.length < 600; m = addMonths(m, 1)) out.push({ period: m, date: m === a.start.slice(0, 7) ? a.start : m + '-01', label: fmonth(m) })
  } else if (a.frequency === 'yearly') {
    for (let y = Number(a.start.slice(0, 4)); y <= Number(end.slice(0, 4)) && out.length < 100; y++) out.push({ period: String(y), date: y === Number(a.start.slice(0, 4)) ? a.start : `${y}${a.start.slice(4)}`, label: String(y) })
  } else {
    const step = a.frequency === 'weekly' ? 7 : 1
    for (let d = a.start; d <= end && out.length < 1100; d = addDays(d, step)) out.push({ period: d, date: d, label: step === 7 ? `Week of ${fdate(d)}` : fdate(d) })
  }
  return out
}

export interface ExpenseAccountCalc {
  account: ExpenseAccount
  charges: Charge[]
  charged: number
  paid: number
  adjusted: number
  /** Positive: still owed (due). Negative: paid ahead (advance). */
  balance: number
  payments: ExpenseEntry[]
  lastPayment: ExpenseEntry | null
  /** The charge for the period running now, if any. */
  current: Charge | null
  statusText: string
}

export const expenseAccountCalc = (db: Db, accountId: string, upTo: ISODate = todayISO()): ExpenseAccountCalc =>
  memo(db, `expacct:${accountId}:${upTo}`, () => {
    const account = expenseAccounts(db).find((a) => a.id === accountId)!
    const entries = expenseEntries(db).filter((e) => e.accountId === accountId && e.date <= upTo)
    const bills = entries.filter((e) => e.kind === 'bill')
    const billed = new Set(bills.map((b) => b.period).filter(Boolean))
    const auto: Charge[] = account.amount > 0 ? periods(account, upTo).filter((p) => !billed.has(p.period)).map((p) => ({ ...p, amount: account.amount, source: 'auto' as const })) : []
    const manual: Charge[] = bills.map((b) => ({ date: b.date, period: b.period || b.date, label: b.note || (b.period ? (b.period.length === 7 ? fmonth(b.period) : b.period) : fdate(b.date)), amount: b.amount, source: 'bill' as const, entryId: b.id }))
    const charges = [...auto, ...manual].sort((x, y) => (x.date < y.date ? -1 : 1))
    const payments = entries.filter((e) => e.kind === 'payment').sort((x, y) => (x.date === y.date ? y.ts - x.ts : x.date < y.date ? 1 : -1))
    const charged = sum(charges, (c) => c.amount)
    const paid = sum(payments, (p) => p.amount)
    const adjusted = sum(entries.filter((e) => e.kind === 'adjustment'), (e) => e.amount)
    const balance = Math.round((charged + adjusted - paid) * 100) / 100
    const current = charges.filter((c) => c.date <= upTo).pop() || null
    return {
      account, charges, charged, paid, adjusted, balance, payments, lastPayment: payments[0] || null, current,
      statusText: balance > 0.5 ? 'Due' : balance < -0.5 ? 'Paid ahead' : 'Settled',
    }
  })

/** One line of the expense ledger: a one-time expense, or a charge on a regular account. */
export interface ExpenseRow {
  id: string
  date: ISODate
  head: string
  details: string
  amount: number
  kind: 'one-time' | 'regular'
  method: string
  accountId?: string
  attachments?: number
}

/** Every cost between two dates, one-time and regular, for the expense ledger and profit and loss. */
export const expenseRows = (db: Db, from: ISODate, to: ISODate): ExpenseRow[] =>
  memo(db, `expRows:${from}:${to}`, () => {
    const rows: ExpenseRow[] = db.expenses.filter((e) => e.date >= from && e.date <= to).map((e) => ({
      id: e.id, date: e.date, head: e.head, details: e.details || `${e.head} expense`, amount: e.amount, kind: 'one-time' as const, method: e.method, attachments: e.attachments?.length,
    }))
    // regular charges only count once their day has come
    const upTo = to < todayISO() ? to : todayISO()
    for (const a of expenseAccounts(db)) {
      for (const c of expenseAccountCalc(db, a.id, upTo).charges) {
        if (c.date < from) continue
        rows.push({ id: `${a.id}:${c.period}`, date: c.date, head: a.head, details: `${a.name} · ${c.label}`, amount: c.amount, kind: 'regular', method: '', accountId: a.id })
      }
    }
    return rows.sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1))
  })

/** Every expense head in use or offered: the built-in ones, the company's own, and any found in the records. */
export const expenseHeads = (db: Db): string[] => {
  const set = new Set<string>(EXPENSE_HEADS)
  for (const h of db.accountHeads || []) if (h.group === 'expense' && !h.archived) set.add(h.name)
  for (const a of expenseAccounts(db)) set.add(a.head)
  for (const e of db.expenses) set.add(e.head)
  return [...set]
}

/** Due and advance across all regular expense accounts, for the dashboard and the chart of accounts. */
export const expenseAccountTotals = (db: Db) =>
  memo(db, 'expacctTotals', () => {
    const rows = expenseAccounts(db).map((a) => expenseAccountCalc(db, a.id))
    return { due: sum(rows.filter((r) => r.balance > 0), (r) => r.balance), advance: sum(rows.filter((r) => r.balance < 0), (r) => -r.balance), rows }
  })
