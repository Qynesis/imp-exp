import { fmt } from '../format'
import type { Db, Factory, FactoryOrder, MaterialGiven, Product, Tone } from '../types'
import { byId, memo, sum } from './common'

export interface MaterialAtFactory extends MaterialGiven {
  name: string
  unit: string
  used: number
  returned: number
  wasted: number
  left: number
}
export interface FactoryOrderCalc {
  product: Product | undefined
  factory: Factory | undefined
  unit: string
  received: number
  pending: number
  billed: number
  paid: number
  /** Positive: the factory owes us (unused advance). Negative: we owe the factory. */
  balance: number
  status: 'Ordered' | 'Partly received' | 'Received in full'
  tone: Tone
  balanceText: string
  balanceTone: Tone
  materials: MaterialAtFactory[]
  /** Value of goods ordered but not billed yet. */
  unbilled: number
  pct: number
  typeLabel: string
  /** Freight paid to bring the goods to the warehouse, and how much of it went into the product cost. */
  freight: number
  freightInCost: number
  /** Quantity first ordered, before any amendment. */
  firstQty: number
}

export const factoryOrderTypeLabel = (type: FactoryOrder['type']): string => (type === 1 ? 'Raw material supplied' : 'Direct order')

export const foCalc = (db: Db, o: FactoryOrder): FactoryOrderCalc =>
  memo(db, 'fo:' + o.id, () => {
    const product = byId(db.products, o.productId)
    const received = sum(o.receipts, (r) => r.qty)
    const pending = Math.max(o.qty - received, 0)
    const billed = sum(o.bills, (b) => b.amount)
    const paid = sum(o.payments, (p) => p.amount)
    const balance = paid - billed
    let balanceText = 'Settled'
    let balanceTone: Tone = 'muted'
    if (balance > 0) {
      balanceText = `Factory owes us Tk ${fmt(balance)}`
      balanceTone = 'good'
    } else if (balance < 0) {
      balanceText = `We owe Tk ${fmt(-balance)}`
      balanceTone = 'warn'
    } else if (billed === 0) balanceText = 'Nothing billed yet'
    const materials = (o.materials || []).map((m) => {
      const p = byId(db.products, m.productId)
      // materials are used up in proportion to the finished goods received
      const used = o.qty > 0 ? Math.round((m.given * Math.min(received, o.qty)) / o.qty) : 0
      const settled = (o.settlements || []).filter((s) => s.productId === m.productId)
      const returned = sum(settled.filter((s) => s.kind === 'returned'), (s) => s.qty)
      const wasted = sum(settled.filter((s) => s.kind === 'wasted'), (s) => s.qty)
      return { ...m, name: p?.name || 'Material', unit: p?.unit || '', used, returned, wasted, left: Math.max(m.given - used - returned - wasted, 0) }
    })
    return {
      product, factory: byId(db.factories, o.factoryId), unit: product?.unit || 'units', received, pending, billed, paid, balance,
      status: received <= 0 ? 'Ordered' : pending > 0 ? 'Partly received' : 'Received in full',
      tone: received <= 0 ? 'info' : pending > 0 ? 'warn' : 'good',
      balanceText, balanceTone, materials, unbilled: Math.max(o.qty * o.rate - billed, 0),
      pct: o.qty > 0 ? Math.min(100, Math.round((received / o.qty) * 100)) : 0,
      typeLabel: factoryOrderTypeLabel(o.type),
      freight: sum(o.receipts, (r) => r.freight || 0),
      freightInCost: sum(o.receipts.filter((r) => r.freightInCost), (r) => r.freight || 0),
      firstQty: o.amendments?.[0]?.fromQty ?? o.qty,
    }
  })

/** For the products screen: what is still due from factories, and our material lying at them. */
export const atFactory = (db: Db, productId: string) =>
  memo(db, 'atFactory:' + productId, () => {
    let due = 0
    const lying: { qty: number; factory: string; orderId: string }[] = []
    for (const o of db.factoryOrders) {
      const c = foCalc(db, o)
      if (o.productId === productId) due += c.pending
      for (const m of c.materials) if (m.productId === productId && m.left > 0) lying.push({ qty: m.left, factory: c.factory?.name || 'factory', orderId: o.id })
    }
    return { due, lying, lyingQty: sum(lying, (l) => l.qty) }
  })
