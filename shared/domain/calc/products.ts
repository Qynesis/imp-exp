import { addDays, fmt, todayISO } from '../format'
import type { Db, ISODate, Product, ProductKind, ProductSource } from '../types'
import { byDateTs, byId, memo, purchaseIn, sum } from './common'
import { foCalc } from './factory'
import { stepKeys, stepLabel } from './shipments'

/** "Parent › Child" for a category id. */
export function categoryPath(db: Db, id: string): string {
  const c = byId(db.categories, id)
  if (!c) return 'Uncategorised'
  const p = byId(db.categories, c.parentId)
  return p ? `${p.name} › ${c.name}` : c.name
}

export const isLowStock = (p: Product): boolean => !p.archived && p.lowAt > 0 && p.stock <= p.lowAt

/** True when the product sits in the category or one of its sub categories. */
export const inCategory = (db: Db, p: Product, categoryId: string): boolean =>
  p.categoryId === categoryId || db.categories.some((c) => c.id === p.categoryId && c.parentId === categoryId)

/** Products still in use, for pickers. `keep` stays in the list even when archived, so an edit can show its current value. */
export const activeProducts = (db: Db, keep?: string): Product[] => db.products.filter((p) => !p.archived || p.id === keep)

/** True when any record mentions the product, so it can only be archived, not deleted. */
export const productInUse = (db: Db, id: string): boolean =>
  db.purchases.some((x) => x.productId === id) ||
  db.factoryOrders.some((o) => o.productId === id || (o.materials || []).some((m) => m.productId === id)) ||
  db.imports.some((s) => s.productId === id) ||
  db.invoices.some((i) => i.lines.some((l) => l.productId === id)) ||
  (db.quotes || []).some((q) => q.lines.some((l) => l.productId === id)) ||
  (db.adjustments || []).some((a) => a.productId === id) ||
  (db.productions || []).some((m) => m.productId === id || m.materials.some((g) => g.productId === id)) ||
  db.products.some((p) => p.id !== id && (p.recipe || []).some((r) => r.productId === id))

/** Another product already using this name or code, if any. */
export function duplicateOf(db: Db, p: { id?: string; name: string; code: string }): string {
  const same = (a: string, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase()
  const other = db.products.find((x) => x.id !== p.id && (same(x.name, p.name) || same(x.code, p.code)))
  if (!other) return ''
  return same(other.name, p.name) ? `There is already a product called ${other.name}.` : `Code ${other.code} is already used by ${other.name}.`
}

/* ---------- where a product comes from ---------- */

const SOURCE_ORDER: ProductSource[] = ['supplier', 'import', 'factory', 'workshop']

/** Sources set on the product, plus any that its history shows. */
export const productSources = (db: Db, p: Product): ProductSource[] =>
  memo(db, 'sources:' + p.id, () => {
    const s = new Set<ProductSource>(p.sources || [])
    if (db.purchases.some((x) => x.productId === p.id)) s.add('supplier')
    if (db.imports.some((x) => x.direction !== 'export' && x.productId === p.id)) s.add('import')
    if (db.factoryOrders.some((x) => x.productId === p.id)) s.add('factory')
    if ((db.productions || []).some((x) => x.productId === p.id)) s.add('workshop')
    return SOURCE_ORDER.filter((k) => s.has(k))
  })

export interface SupplierOffer {
  supplierId: string
  name: string
  preferred: boolean
  lastRate: number
  lastDate: ISODate | ''
  qty: number
  bills: number
}

/** Each supplier who sells us this product, with the last price paid. Preferred suppliers come first. */
export const productSuppliers = (db: Db, p: Product): SupplierOffer[] =>
  memo(db, 'productSuppliers:' + p.id, () => {
    const preferred = new Set(p.supplierIds || [])
    const ids = new Set([...preferred, ...db.purchases.filter((x) => x.productId === p.id).map((x) => x.supplierId)])
    return [...ids]
      .map((id): SupplierOffer => {
        const bought = db.purchases.filter((x) => x.productId === p.id && x.supplierId === id).sort(byDateTs)
        const last = bought[bought.length - 1]
        return {
          supplierId: id, name: byId(db.suppliers, id)?.name || 'Supplier', preferred: preferred.has(id),
          lastRate: last?.rate || 0, lastDate: last?.date || '', qty: sum(bought, (x) => x.qty), bills: bought.length,
        }
      })
      .sort((a, b) => Number(b.preferred) - Number(a.preferred) || (a.lastRate || Infinity) - (b.lastRate || Infinity))
  })

/* ---------- recipes ---------- */

export interface RecipeRow {
  productId: string
  name: string
  unit: string
  /** Needed for one unit of the finished product. */
  qty: number
  stock: number
  costPerUnit: number
  /** Whole units of the finished product this material alone allows. */
  enoughFor: number
}
export interface RecipeInfo {
  rows: RecipeRow[]
  /** Material cost of one unit of the finished product. */
  materialCost: number
  /** Whole units we can make from the warehouse right now. */
  canMake: number
  /** The material that runs out first. */
  limitedBy: string
}

export const recipeInfo = (db: Db, p: Product): RecipeInfo =>
  memo(db, 'recipe:' + p.id, () => {
    const rows = (p.recipe || [])
      .filter((r) => r.qty > 0)
      .map((r): RecipeRow => {
        const m = byId(db.products, r.productId)
        const stock = m?.stock || 0
        return {
          productId: r.productId, name: m?.name || 'Removed material', unit: m?.unit || '', qty: r.qty, stock,
          costPerUnit: (m?.cost || 0) * r.qty, enoughFor: Math.max(Math.floor(stock / r.qty + 1e-9), 0),
        }
      })
    const tightest = rows.reduce<RecipeRow | undefined>((a, r) => (!a || r.enoughFor < a.enoughFor ? r : a), undefined)
    return { rows, materialCost: sum(rows, (r) => r.costPerUnit), canMake: tightest?.enoughFor ?? 0, limitedBy: tightest?.name || '' }
  })

/** Materials needed for `qty` units of the product, from its recipe. */
export const materialsFor = (p: Product, qty: number) => (p.recipe || []).filter((r) => r.qty > 0).map((r) => ({ productId: r.productId, given: Math.round(r.qty * qty * 1000) / 1000 }))

/** Finished products whose recipe uses this material. */
export const usedIn = (db: Db, materialId: string): { product: Product; qty: number }[] =>
  memo(db, 'usedIn:' + materialId, () =>
    db.products.flatMap((p) => {
      const line = (p.recipe || []).find((r) => r.productId === materialId && r.qty > 0)
      return line ? [{ product: p, qty: line.qty }] : []
    }),
  )

/* ---------- stock history ---------- */

export interface StockMove {
  key: string
  date: ISODate
  ts: number
  label: string
  ref: string
  /** Positive comes in, negative goes out. */
  qty: number
  /** Stock after this movement. */
  balance: number
}

/** Every movement of one product, newest first, with the stock after each one. */
export const stockHistory = (db: Db, productId: string): { moves: StockMove[]; opening: number } =>
  memo(db, 'stockHistory:' + productId, () => {
    const out: Omit<StockMove, 'balance'>[] = []
    const add = (key: string, date: ISODate | undefined, ts: number, label: string, ref: string, qty: number) => {
      if (date && qty) out.push({ key, date, ts, label, ref, qty })
    }
    for (const x of db.purchases) if (x.productId === productId) add(x.id, x.recv?.date || x.date, x.ts, `Bought from ${byId(db.suppliers, x.supplierId)?.name || 'supplier'}`, x.billNo, purchaseIn(x))
    for (const o of db.factoryOrders) {
      const f = byId(db.factories, o.factoryId)?.name || 'factory'
      if (o.productId === productId) for (const r of o.receipts) add(r.id, r.date, r.ts, `Received from ${f}`, [o.id, r.challan].filter(Boolean).join(' · '), r.qty)
      for (const m of o.materials || []) if (m.productId === productId) add(o.id + ':m', o.placed, o.ts, `Handed to ${f}`, o.id, -m.given)
      for (const x of o.settlements || []) if (x.productId === productId && x.kind === 'returned') add(x.id, x.date, x.ts, `Taken back from ${f}`, [o.id, x.note].filter(Boolean).join(' · '), x.qty)
    }
    for (const s of db.imports) {
      if (s.productId !== productId) continue
      if (s.direction === 'export') add(s.id, s.steps.shipped?.date, s.ts, `Exported to ${s.country || 'buyer'}`, s.id, -s.qty)
      else add(s.id, s.steps.warehouse?.date, s.ts, `Import from ${s.country || 'abroad'} reached the warehouse`, s.lcNo || s.id, s.qty)
    }
    for (const inv of db.invoices) {
      // invoices that wait for delivery move stock when the goods go, below
      if (inv.status !== 'final' || inv.stockOnDelivery || inv.sample) continue
      const qty = sum(inv.lines.filter((l) => l.productId === productId), (l) => l.qty)
      add(inv.id, inv.date, inv.ts, `Sold to ${byId(db.dealers, inv.dealerId)?.name || 'dealer'}`, inv.id, -qty)
    }
    for (const dv of db.deliveries || []) {
      if (dv.cancelled || dv.sample) continue
      const qty = sum(dv.lines.filter((l) => l.productId === productId), (l) => l.qty)
      add(dv.id, dv.date, dv.ts, `Delivered to ${byId(db.dealers, dv.dealerId)?.name || 'dealer'}`, dv.invoiceId, -qty)
    }
    for (const r of db.returns || []) {
      if (r.condition !== 'restock' || r.sample) continue
      const qty = sum(r.lines.filter((l) => l.productId === productId), (l) => l.qty)
      add(r.id, r.date, r.ts, `Returned by ${byId(db.dealers, r.dealerId)?.name || 'dealer'}`, [r.invoiceId, r.reason].filter(Boolean).join(' · '), qty)
    }
    for (const a of db.adjustments || []) if (a.productId === productId) add(a.id, a.date, a.ts, `Adjusted · ${a.reason}`, a.note, a.qty)
    for (const m of db.productions || []) {
      if (m.productId === productId) add(m.id, m.date, m.ts, 'Made in our workshop', m.note, m.qty)
      for (const g of m.materials) if (g.productId === productId) add(m.id + ':m', m.date, m.ts, `Used to make ${byId(db.products, m.productId)?.name || 'goods'}`, m.note, -g.given)
    }
    out.sort((a, b) => -byDateTs(a, b))
    // walk back from today's stock so the running figure always ends at what the warehouse holds
    let running = byId(db.products, productId)?.stock || 0
    const moves = out.map((m) => {
      const balance = running
      running -= m.qty
      return { ...m, balance }
    })
    return { moves, opening: running }
  })

/* ---------- how fast stock moves ---------- */

export interface UsageRate {
  /** Units that went out (sold, exported, handed to factories, used in the workshop) in the window. */
  out: number
  days: number
  perDay: number
  /** Days the current stock lasts at that pace; null when nothing moved. */
  daysLeft: number | null
}

/** Pace of use over the last `days` days. Manual adjustments are left out so a stock count does not look like a sale. */
export const usageRate = (db: Db, productId: string, days = 90): UsageRate =>
  memo(db, `usage:${productId}:${days}`, () => {
    const from = addDays(todayISO(), -days)
    const out = -sum(stockHistory(db, productId).moves.filter((m) => m.qty < 0 && m.date > from && !m.key.startsWith('adj')), (m) => m.qty)
    const perDay = out / days
    const stock = byId(db.products, productId)?.stock || 0
    return { out, days, perDay, daysLeft: perDay > 0 ? Math.max(Math.floor(stock / perDay), 0) : null }
  })

/** "about 3 weeks" style wording for days of stock left. */
export function lastsFor(daysLeft: number | null): string {
  if (daysLeft === null) return 'No recent use'
  if (daysLeft < 1) return 'Runs out today'
  if (daysLeft < 14) return `About ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  if (daysLeft < 60) return `About ${Math.round(daysLeft / 7)} weeks`
  return `About ${Math.round(daysLeft / 30)} months`
}

/* ---------- summary for the products screen ---------- */

export interface StockSummary {
  value: Record<ProductKind | 'all', number>
  count: Record<ProductKind | 'all', number>
  low: number
}

export const stockSummary = (db: Db): StockSummary =>
  memo(db, 'stockSummary', () => {
    const value = { all: 0, finished: 0, raw: 0, packaging: 0 }
    const count = { all: 0, finished: 0, raw: 0, packaging: 0 }
    let low = 0
    for (const p of db.products) {
      const v = Math.max(p.stock, 0) * p.cost
      value.all += v
      value[p.kind] += v
      if (p.archived) continue
      count.all++
      count[p.kind]++
      if (isLowStock(p)) low++
    }
    return { value, count, low }
  })

/* ---------- goods on the way ---------- */

export interface Incoming {
  key: string
  source: 'import' | 'factory' | 'supplier'
  productId: string
  qty: number
  /** Shipment or factory order id, for linking. */
  ref: string
  from: string
  /** Last step done, e.g. "Arrived at Chattogram port". */
  status: string
  expected: ISODate | ''
}

/** Imports not yet in the warehouse and factory orders not yet fully received, for products of the given kinds. */
export const incomingStock = (db: Db, kinds: readonly ProductKind[]): Incoming[] =>
  memo(db, 'incoming:' + kinds.join(','), () => {
    const wanted = (id: string) => {
      const p = byId(db.products, id)
      return !!p && kinds.includes(p.kind)
    }
    const out: Incoming[] = []
    for (const s of db.imports) {
      if (s.direction === 'export' || !s.productId || s.steps.warehouse?.date || !wanted(s.productId)) continue
      const done = stepKeys(s).filter((k) => s.steps[k]?.date)
      const last = done[done.length - 1]
      const expected = stepKeys(s).map((k) => s.steps[k]?.expected).find(Boolean) || ''
      out.push({ key: s.id, source: 'import', productId: s.productId, qty: s.qty, ref: s.id, from: [s.supplier, s.country].filter(Boolean).join(', ') || 'Abroad', status: last ? stepLabel(last, s) : 'Not started', expected })
    }
    for (const o of db.factoryOrders) {
      if (!wanted(o.productId)) continue
      const c = foCalc(db, o)
      if (c.pending <= 0) continue
      out.push({ key: o.id, source: 'factory', productId: o.productId, qty: c.pending, ref: o.id, from: c.factory?.name || 'Factory', status: c.received ? `${fmt(c.received)} received so far` : 'Ordered', expected: o.expected })
    }
    // supplier bills entered but not yet counted in by the warehouse
    for (const x of db.purchases) {
      if (!x.pending || !wanted(x.productId)) continue
      out.push({ key: 'p' + x.id, source: 'supplier', productId: x.productId, qty: x.qty, ref: x.id, from: byId(db.suppliers, x.supplierId)?.name || 'Supplier', status: `Bill ${x.billNo} · waiting for check-in`, expected: x.expected || x.date })
    }
    return out.sort((a, b) => (a.expected || '9') < (b.expected || '9') ? -1 : 1)
  })
