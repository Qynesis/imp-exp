import type { Db } from '../types'
import { memo, sum } from './common'
import { foCalc } from './factory'
import { supplierLedger } from './suppliers'
import { transporters } from './transport'

interface PayableBase {
  key: string
  name: string
  meta: string
  due: number
}
export type Payable =
  | (PayableBase & { kind: 'supplier'; supplierId: string })
  | (PayableBase & { kind: 'factory'; orderId: string })
  | (PayableBase & { kind: 'transport'; transporter: string })

/** Everything we owe suppliers, factories and hired transporters, biggest first, plus advances lying with factories. */
export const payables = (db: Db) =>
  memo(db, 'payables', () => {
    const rows: Payable[] = db.suppliers
      .map((s) => supplierLedger(db, s.id))
      .filter((l) => l.due > 0)
      .map((l) => ({ key: l.supplier.id, kind: 'supplier', name: l.supplier.name, meta: `Supplier · ${l.supplier.terms === 'cash' ? 'cash' : 'credit'}`, due: l.due, supplierId: l.supplier.id }))
    const advances: { orderId: string; name: string; amount: number }[] = []
    for (const o of db.factoryOrders) {
      const c = foCalc(db, o)
      if (c.balance < 0) rows.push({ key: o.id, kind: 'factory', name: c.factory?.name || 'Factory', meta: `Factory bill · ${o.id}`, due: -c.balance, orderId: o.id })
      if (c.balance > 0) advances.push({ orderId: o.id, name: c.factory?.name || 'Factory', amount: c.balance })
    }
    for (const t of transporters(db)) if (t.due > 0) rows.push({ key: 'tr:' + t.name, kind: 'transport', name: t.name, meta: `Transport hire · ${t.open.length} trip${t.open.length === 1 ? '' : 's'}`, due: t.due, transporter: t.name })
    rows.sort((a, b) => b.due - a.due)
    return { rows, advances, total: sum(rows, (r) => r.due), advanceTotal: sum(advances, (a) => a.amount) }
  })
