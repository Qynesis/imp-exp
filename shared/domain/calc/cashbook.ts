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
