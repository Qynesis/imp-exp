import { addDays, daysBetween, todayISO } from '../format'
import type { Db, Dealer, Invoice, ISODate } from '../types'
import { byDateTs, memo, mustFind, newestFirst, sum } from './common'

export const invSubtotal = (inv: Pick<Invoice, 'lines'>): number => sum(inv.lines, (l) => l.qty * l.price)
export const invTotal = (inv: Pick<Invoice, 'lines' | 'discount'>): number => invSubtotal(inv) - (inv.discount || 0)

export interface Debt {
  /** Invoice id, or 'opening' for the balance brought into the books. */
  id: string
  label: string
  date: ISODate | null
  dueDate: ISODate | null
  total: number
  /** Still unpaid. */
  out: number
}
export interface DealerPaymentLine {
  amount: number
  date: ISODate
  ts: number
  label: string
}
export interface DealerLedger {
  dealer: Dealer
  debts: Debt[]
  open: Debt[]
  due: number
  /** Days until the oldest unpaid invoice is due; negative when overdue. */
  days: number | null
  overdue: boolean
  statusText: string
  payments: DealerPaymentLine[]
  lastPayment: DealerPaymentLine | null
}

const plural = (n: number) => (n === 1 ? '' : 's')

/** What a dealer owes, invoice by invoice. Collections pay the chosen invoice first, then the oldest. */
export const dealerLedger = (db: Db, dealerId: string): DealerLedger =>
  memo(db, 'dealer:' + dealerId, () => {
    const dealer = mustFind(db.dealers, dealerId, 'Dealer')
    const debts: Debt[] = []
    if (dealer.opening > 0) debts.push({ id: 'opening', label: 'Opening due', date: null, dueDate: null, total: dealer.opening, out: dealer.opening })
    const invs = db.invoices.filter((i) => i.dealerId === dealerId && i.status === 'final').sort(byDateTs)
    for (const inv of invs) {
      const total = invTotal(inv)
      debts.push({
        id: inv.id, label: inv.id, date: inv.date, total, out: total - (inv.received || 0),
        dueDate: inv.terms === 'credit' ? addDays(inv.date, dealer.days || 0) : inv.date,
      })
    }
    // returned goods credited to the dealer pay off debts like a collection, without cash changing hands
    const credits = [
      ...(db.returns || []).filter((r) => r.dealerId === dealerId && r.credit > 0).map((r) => ({ ...r, amount: r.credit, method: 'Return credit', collectedBy: '' })),
      // the undelivered rest of a bill, closed with a credit
      ...(db.deliveries || []).filter((x) => x.dealerId === dealerId && x.cancelled && (x.credit || 0) > 0).map((x) => ({ ...x, amount: x.credit || 0, method: 'Return credit', collectedBy: '' })),
    ]
    const cols = [...db.collections.filter((c) => c.dealerId === dealerId), ...credits].sort(byDateTs)
    for (const c of cols) {
      let amt = c.amount
      const target = c.invoiceId ? debts.find((d) => d.id === c.invoiceId) : undefined
      if (target) {
        const take = Math.min(amt, Math.max(target.out, 0))
        target.out -= take
        amt -= take
      }
      for (const d of debts) {
        if (amt <= 0) break
        const take = Math.min(amt, Math.max(d.out, 0))
        d.out -= take
        amt -= take
      }
      if (amt > 0 && debts.length) debts[debts.length - 1].out -= amt
    }
    const due = sum(debts, (d) => d.out)
    const open = debts.filter((d) => d.out > 0)
    const oldest = open.find((d) => d.dueDate)
    const days = oldest?.dueDate ? daysBetween(todayISO(), oldest.dueDate) : null
    let statusText = 'Settled'
    if (due > 0) {
      if (days === null) statusText = 'Opening due'
      else if (days < 0) statusText = `${-days} day${plural(-days)} overdue`
      else if (days === 0) statusText = 'Due today'
      else statusText = `Due in ${days} day${plural(days)}`
    }
    const payments = [
      ...cols.map((c) => ({ amount: c.amount, date: c.date, ts: c.ts, label: c.method === 'Return credit' ? 'Goods returned (credit)' : `Collection · ${c.method}` })),
      ...invs.filter((i) => i.received > 0).map((i) => ({ amount: i.received, date: i.date, ts: i.ts, label: `Received on ${i.id}` })),
    ].sort(newestFirst)
    return { dealer, debts, open, due, days, overdue: due > 0 && days !== null && days < 0, statusText, payments, lastPayment: payments[0] || null }
  })

/** Dealers who owe money, biggest first. */
export const receivables = (db: Db) =>
  memo(db, 'receivables', () => {
    // the sample dealer's bills are made up, so they are never owed to us
    const rows = db.dealers.filter((d) => !d.sample).map((d) => dealerLedger(db, d.id)).filter((l) => l.due > 0).sort((a, b) => b.due - a.due)
    return { rows, total: sum(rows, (r) => r.due) }
  })

/** Unpaid amount on one invoice (0 for drafts and for invoices of deleted dealers). */
export const invoiceDue = (db: Db, inv: Invoice): number =>
  inv.status === 'draft' || !db.dealers.some((d) => d.id === inv.dealerId) ? 0 : dealerLedger(db, inv.dealerId).debts.find((x) => x.id === inv.id)?.out || 0
