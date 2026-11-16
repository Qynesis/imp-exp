import { fmt } from '../format'
import type { Db, ISODate, Supplier, SupplierPayment, SupplierTerms } from '../types'
import { byDateTs, byId, memo, mustFind, sum } from './common'

export interface SupplierBill {
  /** Purchase id, or 'opening' for the balance brought into the books. */
  id: string
  billNo: string
  date: ISODate | null
  items: string
  terms: SupplierTerms
  amount: number
  paid: number
}
export interface SupplierLedger {
  supplier: Supplier
  /** Newest first. */
  bills: SupplierBill[]
  /** Newest first. */
  payments: SupplierPayment[]
  purchased: number
  paid: number
  due: number
}

/** What we owe a supplier. Payments settle the chosen bill first, then the oldest. */
export const supplierLedger = (db: Db, supplierId: string): SupplierLedger =>
  memo(db, 'supplier:' + supplierId, () => {
    const supplier = mustFind(db.suppliers, supplierId, 'Supplier')
    const bills: SupplierBill[] = []
    if (supplier.opening > 0) bills.push({ id: 'opening', billNo: 'Opening', date: null, items: 'Opening balance', terms: 'credit', amount: supplier.opening, paid: 0 })
    for (const p of db.purchases.filter((x) => x.supplierId === supplierId).sort(byDateTs)) {
      const prod = byId(db.products, p.productId)
      bills.push({ id: p.id, billNo: p.billNo, date: p.date, terms: p.terms, amount: p.qty * p.rate, paid: 0, items: `${prod?.name || 'Item'}, ${fmt(p.qty)} ${prod?.unit || ''}`.trim() })
    }
    const pays = db.supplierPayments.filter((p) => p.supplierId === supplierId).sort(byDateTs)
    for (const pay of pays) {
      let amt = pay.amount
      const target = pay.purchaseId ? bills.find((b) => b.id === pay.purchaseId) : undefined
      if (target) {
        const take = Math.min(amt, target.amount - target.paid)
        target.paid += take
        amt -= take
      }
      for (const b of bills) {
        if (amt <= 0) break
        const take = Math.min(amt, b.amount - b.paid)
        b.paid += take
        amt -= take
      }
      if (amt > 0 && bills.length) bills[bills.length - 1].paid += amt
    }
    const purchased = sum(bills, (b) => b.amount)
    const paid = sum(bills, (b) => b.paid)
    return { supplier, bills: [...bills].reverse(), payments: [...pays].reverse(), purchased, paid, due: purchased - paid }
  })
