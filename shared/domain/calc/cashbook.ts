import { fmonth, fmt } from '../format'
import type { Db, ISODate } from '../types'
import { byDateTs, byId, memo, sum } from './common'
import { invTotal } from './dealers'

export interface CashEntry {
  date: ISODate
  ts: number
  details: string
  head: string
  in: number
  out: number
  method: string
}

/** Every movement of money, derived from the records. The cashbook can never disagree with the other screens. */
export const cashEntries = (db: Db): CashEntry[] =>
  memo(db, 'cash', () => {
    const out: CashEntry[] = []
    const push = (date: ISODate, ts: number, details: string, head: string, cin: number, cout: number, method?: string) =>
      out.push({ date, ts, details, head, in: cin, out: cout, method: method || 'Cash' })
    const name = <T extends { id: string; name: string }>(list: T[], id: string, fallback: string) => byId(list, id)?.name || fallback

    for (const i of db.invoices) {
      if (i.sample) continue
      if (i.status !== 'final' || !(i.received > 0)) continue
      const part = i.received < invTotal(i)
      push(i.date, i.ts, `${name(db.dealers, i.dealerId, 'Dealer')} · ${part ? 'part payment' : 'payment'} on ${i.id}`, 'Sales', i.received, 0, i.method)
    }
    for (const c of db.collections) push(c.date, c.ts, `${name(db.dealers, c.dealerId, 'Dealer')} · due collection`, 'Collection', c.amount, 0, c.method)
    for (const e of db.expenses) push(e.date, e.ts, e.details || `${e.head} expense`, `${e.head} expense`, 0, e.amount, e.method)
    for (const a of db.advances) push(a.date, a.ts, `Salary advance · ${name(db.employees, a.employeeId, 'Employee')}`, 'Employee expense', 0, a.amount, a.method)
    for (const p of db.supplierPayments) {
      const bill = byId(db.purchases, p.purchaseId)
      push(p.date, p.ts, `${name(db.suppliers, p.supplierId, 'Supplier')}${bill ? ` · ${bill.billNo}` : ''}`, 'Supplier payment', 0, p.amount, p.method)
    }
    for (const o of db.factoryOrders) {
      for (const p of o.payments) push(p.date, p.ts, `${name(db.factories, o.factoryId, 'Factory')} · ${p.note || o.id}`, 'Factory payment', 0, p.amount, p.method)
    }
    for (const s of db.imports) {
      if (s.direction === 'export') {
        if (s.steps.paid?.date) push(s.steps.paid.date, s.ts, `${s.id} · export proceeds, USD ${fmt(s.usd)}`, 'Export sales', s.usd * s.rate, 0, 'Bank transfer')
      } else if (s.steps.lc?.date) push(s.steps.lc.date, s.ts, `${s.id} · LC invoice value`, 'Import', 0, s.usd * s.rate, 'Bank transfer')
      for (const c of s.costs) push(c.date, c.ts, `${s.id} · ${c.type}`, s.direction === 'export' ? 'Export cost' : 'Import cost', 0, c.amount, c.method)
    }
    for (const p of db.payroll) {
      const sal = sum(p.lines.filter((l) => l.kind === 'salary'), (l) => l.amount)
      const com = sum(p.lines.filter((l) => l.kind === 'commission'), (l) => l.amount)
      if (sal > 0) push(p.date, p.ts, `Salaries · ${fmonth(p.month)}`, 'Salary', 0, sal, p.method)
      if (com > 0) push(p.date, p.ts + 0.5, `Sales commission · ${fmonth(p.month)}`, 'Commission', 0, com, p.method)
    }
    for (const a of db.assets || []) {
      if (a.paidFrom && a.cost > 0) push(a.date, a.ts, `Fixed asset bought: ${a.name} (${a.id})`, 'Fixed asset', 0, a.cost, a.paidFrom)
      if (a.status === 'disposed' && a.disposedOn && (a.disposalAmount || 0) > 0) push(a.disposedOn, a.ts + 0.5, `Fixed asset sold: ${a.name} (${a.id})`, 'Asset sale', a.disposalAmount || 0, 0, a.disposalMethod)
    }
    for (const t of db.investorTxns || []) {
      const who = name(db.investors || [], t.investorId, 'Investor')
      if (t.kind === 'invest') push(t.date, t.ts, `${who} · capital added`, 'Investor capital', t.amount, 0, t.method)
      if (t.kind === 'withdraw') push(t.date, t.ts, `${who} · capital taken back`, 'Capital returned', 0, t.amount, t.method)
      if (t.kind === 'payout') push(t.date, t.ts, `${who} · profit paid`, 'Profit to investor', 0, t.amount, t.method)
    }
    return out.sort(byDateTs)
  })

export interface CashDay {
  opening: number
  in: number
  out: number
  closing: number
  entries: (CashEntry & { balance: number })[]
}

export const cashForDay = (db: Db, date: ISODate): CashDay =>
  memo(db, 'cashDay:' + date, () => {
    const all = cashEntries(db)
    let opening = db.openingCash || 0
    for (const e of all) if (e.date < date) opening += e.in - e.out
    let bal = opening
    const entries = all.filter((e) => e.date === date).map((e) => ({ ...e, balance: (bal += e.in - e.out) }))
    const cin = sum(entries, (e) => e.in)
    const cout = sum(entries, (e) => e.out)
    return { opening, in: cin, out: cout, closing: opening + cin - cout, entries }
  })

/** The account money sits in, from how it was paid: cash in hand, bank, or a mobile wallet. */
export const ACCOUNTS = ['Cash', 'Bank', 'bKash', 'Nagad', 'Rocket'] as const
export type Account = (typeof ACCOUNTS)[number] | 'Other'
export function accountOf(method: string): Account {
  const m = (method || 'Cash').toLowerCase()
  if (m.includes('bkash')) return 'bKash'
  if (m.includes('nagad')) return 'Nagad'
  if (m.includes('rocket')) return 'Rocket'
  if (m.includes('cash')) return 'Cash'
  if (m.includes('bank') || m.includes('cheque') || m.includes('card') || m.includes('lc') || m.includes('transfer')) return 'Bank'
  return 'Other'
}

/** Balance of each account at the end of a day. Opening money not given to an account counts as cash in hand. */
export const accountBalances = (db: Db, date: ISODate): { account: Account; balance: number; in: number; out: number }[] =>
  memo(db, 'accounts:' + date, () => {
    const rows = new Map<Account, { account: Account; balance: number; in: number; out: number }>(ACCOUNTS.map((a) => [a, { account: a, balance: 0, in: 0, out: 0 }]))
    const opening = db.openingAccounts || {}
    let other = 0
    for (const [k, v] of Object.entries(opening)) {
      const a = accountOf(k)
      const row = rows.get(a) || { account: a, balance: 0, in: 0, out: 0 }
      row.balance += v
      rows.set(a, row)
      other += v
    }
    rows.get('Cash')!.balance += (db.openingCash || 0) - other
    const add = (method: string, cin: number, cout: number, day: ISODate) => {
      const a = accountOf(method)
      const row = rows.get(a) || { account: a, balance: 0, in: 0, out: 0 }
      row.balance += cin - cout
      if (day === date) {
        row.in += cin
        row.out += cout
      }
      rows.set(a, row)
    }
    for (const e of cashEntries(db)) {
      if (e.date > date) break
      add(e.method, e.in, e.out, e.date)
    }
    for (const t of db.transfers || []) {
      if (t.date > date) continue
      add(t.from, 0, t.amount, t.date)
      add(t.to, t.amount, 0, t.date)
    }
    // the mobile wallets nobody uses stay hidden
    return [...rows.values()].filter((r) => r.account === 'Cash' || r.account === 'Bank' || r.balance || r.in || r.out)
  })
