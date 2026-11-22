/**
 * The warehouse's view: goods coming in from suppliers, factories and imports (and dealers' returns),
 * and a directory of every source with full contact details and what each sends us.
 */
import type { Db, ISODate, PartyDetails, Shipment, WarehouseSite } from '../types'
import { byId, memo, sum } from './common'
import { foCalc } from './factory'
import { incomingStock } from './products'
import { computeShipment } from './shipments'

/** One line of address from all its parts, skipping what is missing. */
export const fullAddress = (p: { address?: string } & Pick<PartyDetails, 'area' | 'city' | 'district' | 'postCode' | 'country'>): string =>
  [p.address, p.area, p.city, p.district && p.district !== p.city ? p.district : '', p.postCode, p.country].map((x) => (x || '').trim()).filter(Boolean).join(', ')

/** The name an import source goes by: the overseas supplier, or the country when no supplier is written. */
export const importSourceName = (s: Pick<Shipment, 'supplier' | 'country'>): string => s.supplier.trim() || (s.country ? `Supplier in ${s.country}` : 'Overseas supplier')

export type SourceKind = 'supplier' | 'factory' | 'import' | 'return' | 'workshop'
export const SOURCE_KINDS: Record<SourceKind, string> = { supplier: 'Supplier', factory: 'Factory', import: 'Import', return: 'Dealer return', workshop: 'Our workshop' }

export interface InboundRow {
  key: string
  date: ISODate
  kind: SourceKind
  /** Supplier or factory id, shipment id for imports, dealer id for returns. */
  sourceId: string
  sourceName: string
  productId: string
  productName: string
  unit: string
  qty: number
  /** Purchase bill, factory challan, shipment or return number. */
  ref: string
  note: string
  /** Warehouse it went into; empty means the main one. */
  siteId?: string
}

/** Everything that came into the warehouse, newest first. */
export const inboundLog = (db: Db): InboundRow[] =>
  memo(db, 'inbound', () => {
    const out: InboundRow[] = []
    const prod = (id: string) => byId(db.products, id)
    const push = (r: Omit<InboundRow, 'productName' | 'unit'>) => out.push({ ...r, productName: prod(r.productId)?.name || 'Item', unit: prod(r.productId)?.unit || '' })
    for (const p of db.purchases) {
      push({ key: 'p' + p.id, date: p.date, kind: 'supplier', sourceId: p.supplierId, sourceName: byId(db.suppliers, p.supplierId)?.name || 'Supplier', productId: p.productId, qty: p.qty, ref: p.billNo, note: '', siteId: p.siteId })
    }
    for (const o of db.factoryOrders) {
      for (const r of o.receipts) {
        push({ key: 'r' + r.id, date: r.date, kind: 'factory', sourceId: o.factoryId, sourceName: byId(db.factories, o.factoryId)?.name || 'Factory', productId: o.productId, qty: r.qty, ref: r.challan || o.id, note: [r.damaged ? `${r.damaged} damaged` : '', r.note].filter(Boolean).join(' · '), siteId: r.siteId })
      }
    }
    for (const s of db.imports) {
      const day = s.direction !== 'export' ? s.steps.warehouse?.date : undefined
      if (!day || !s.productId) continue
      push({ key: 'i' + s.id, date: day, kind: 'import', sourceId: s.id, sourceName: `${importSourceName(s)}${s.supplier.trim() && s.country ? `, ${s.country}` : ''}`, productId: s.productId, qty: s.qty, ref: s.id, note: s.lcNo ? `LC ${s.lcNo}` : '', siteId: s.siteId })
    }
    for (const r of db.returns || []) {
      if (r.sample || r.condition !== 'restock') continue
      for (const l of r.lines) push({ key: 'rt' + r.id + l.productId, date: r.date, kind: 'return', sourceId: r.dealerId, sourceName: byId(db.dealers, r.dealerId)?.name || 'Dealer', productId: l.productId, qty: l.qty, ref: r.id, note: r.reason })
    }
    for (const m of db.productions || []) push({ key: 'm' + m.id, date: m.date, kind: 'workshop', sourceId: '', sourceName: 'Our workshop', productId: m.productId, qty: m.qty, ref: m.id, note: m.note })
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  })

/** What is on its way to the warehouse: factory goods still due and imports not yet in. */
export const expectedIn = (db: Db) => incomingStock(db, ['finished', 'raw', 'packaging'])

export interface SourceRow {
  kind: 'supplier' | 'factory' | 'import'
  /** Supplier or factory id; for imports the overseas supplier's name. */
  id: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  country: string
  /** Items they send us. */
  items: string[]
  deliveries: number
  lastDate: ISODate | null
  /** Goods still to come from them (factory orders pending, imports on the way). */
  pending: number
  details: PartyDetails
}

/** Every source of goods, with full details: local suppliers, factories, and overseas suppliers we import from. */
export const sourceDirectory = (db: Db): SourceRow[] =>
  memo(db, 'sources', () => {
    const log = inboundLog(db)
    const rows: SourceRow[] = []
    for (const s of db.suppliers) {
      const mine = log.filter((r) => r.kind === 'supplier' && r.sourceId === s.id)
      rows.push({
        kind: 'supplier', id: s.id, name: s.name, contact: s.contact, phone: s.phone, email: s.email || '', address: fullAddress(s), country: s.country || '',
        items: [...new Set([...mine.map((r) => r.productName), ...db.products.filter((p) => p.supplierIds?.includes(s.id)).map((p) => p.name)])],
        deliveries: mine.length, lastDate: mine[0]?.date || null, pending: 0, details: s,
      })
    }
    for (const f of db.factories) {
      const mine = log.filter((r) => r.kind === 'factory' && r.sourceId === f.id)
      const orders = db.factoryOrders.filter((o) => o.factoryId === f.id)
      rows.push({
        kind: 'factory', id: f.id, name: f.name + (f.archived ? ' (not in use)' : ''), contact: f.contact, phone: f.phone, email: f.email || '', address: fullAddress(f), country: f.country || '',
        items: [...new Set(orders.map((o) => byId(db.products, o.productId)?.name).filter((n): n is string => !!n))],
        deliveries: mine.length, lastDate: mine[0]?.date || null, pending: sum(orders, (o) => foCalc(db, o).pending), details: f,
      })
    }
    // overseas suppliers come from the shipments, by name
    const byName = new Map<string, SourceRow>()
    for (const s of db.imports.filter((x) => x.direction !== 'export')) {
      const name = importSourceName(s)
      const key = name.toLowerCase()
      const row = byName.get(key) || { kind: 'import' as const, id: name, name, contact: '', phone: '', email: '', address: s.country || '', country: s.country || '', items: [], deliveries: 0, lastDate: null, pending: 0, details: { country: s.country } }
      const item = byId(db.products, s.productId)?.name || s.productName
      if (item && !row.items.includes(item)) row.items.push(item)
      if (s.steps.warehouse?.date) {
        row.deliveries++
        if (!row.lastDate || s.steps.warehouse.date > row.lastDate) row.lastDate = s.steps.warehouse.date
      } else row.pending += s.qty
      byName.set(key, row)
    }
    rows.push(...byName.values())
    return rows
  })

export interface ProductOrigins {
  suppliers: { id: string; name: string; phone: string; address: string; preferred: boolean; deliveries: number; qty: number; lastRate: number; lastDate: ISODate | null }[]
  factories: { id: string; name: string; phone: string; address: string; preferred: boolean; orders: number; received: number; pending: number; lastRate: number; lastDate: ISODate | null }[]
  imports: { name: string; country: string; preferred: boolean; shipments: number; qty: number; perUnit: number; lastDate: ISODate | null; onTheWay: number }[]
}

/** Where one product comes from: each supplier, factory and overseas supplier, with their details. */
export const productOrigins = (db: Db, productId: string): ProductOrigins =>
  memo(db, 'origins:' + productId, () => {
    const p = byId(db.products, productId)
    const purchases = db.purchases.filter((x) => x.productId === productId).sort((a, b) => (a.date < b.date ? -1 : 1))
    const supplierIds = [...new Set([...(p?.supplierIds || []), ...purchases.map((x) => x.supplierId)])]
    const suppliers = supplierIds.map((id) => {
      const s = byId(db.suppliers, id)
      const mine = purchases.filter((x) => x.supplierId === id)
      const last = mine[mine.length - 1]
      return { id, name: s?.name || 'Supplier', phone: s?.phone || '', address: s ? fullAddress(s) : '', preferred: !!p?.supplierIds?.includes(id), deliveries: mine.length, qty: sum(mine, (x) => x.qty), lastRate: last?.rate || 0, lastDate: last?.date || null }
    })
    const orders = db.factoryOrders.filter((o) => o.productId === productId)
    const factories = [...new Set([...(p?.factoryIds || []), ...orders.map((o) => o.factoryId)])].filter((id) => byId(db.factories, id) || orders.some((o) => o.factoryId === id)).map((id) => {
      const f = byId(db.factories, id)
      const mine = orders.filter((o) => o.factoryId === id).sort((a, b) => (a.placed < b.placed ? -1 : 1))
      const calcs = mine.map((o) => foCalc(db, o))
      const lastReceipt = mine.flatMap((o) => o.receipts).map((r) => r.date).sort().pop() || null
      return { id, name: f?.name || 'Factory', phone: f?.phone || '', address: f ? fullAddress(f) : '', preferred: !!p?.factoryIds?.includes(id), orders: mine.length, received: sum(calcs, (c) => c.received), pending: sum(calcs, (c) => c.pending), lastRate: mine[mine.length - 1]?.rate || 0, lastDate: lastReceipt }
    })
    const shipments = db.imports.filter((s) => s.direction !== 'export' && s.productId === productId)
    const names = [...new Set([...(p?.importFrom || []), ...shipments.map(importSourceName)])]
    const imports = names.map((name) => {
      const mine = shipments.filter((s) => importSourceName(s) === name)
      const arrived = mine.filter((s) => s.steps.warehouse?.date)
      const last = arrived.sort((a, b) => ((a.steps.warehouse?.date || '') < (b.steps.warehouse?.date || '') ? -1 : 1)).pop()
      return { name, country: mine[0]?.country || '', preferred: !!p?.importFrom?.includes(name), shipments: mine.length, qty: sum(arrived, (s) => s.qty), perUnit: last ? computeShipment(db, last).perUnit : 0, lastDate: last?.steps.warehouse?.date || null, onTheWay: sum(mine.filter((s) => !s.steps.warehouse?.date), (s) => s.qty) }
    })
    return { suppliers, factories, imports }
  })

/* ---------------------------------------------------------------- stock in each warehouse */

export interface SiteStock {
  /** Sites, main first. */
  sites: WarehouseSite[]
  mainId: string
  /** productId → siteId → quantity. */
  qty: Map<string, Record<string, number>>
}

/**
 * Where the stock is. Goods received into a warehouse, or moved there, stay there; everything else
 * (opening stock, sales, deliveries, adjustments, production) counts against the main warehouse.
 * If the main one would go below zero, the shortfall was sold from the other warehouses, in order.
 */
export const siteStock = (db: Db): SiteStock =>
  memo(db, 'siteStock', () => {
    const list = db.warehouses || []
    const main = list.find((w) => w.main) || list[0]
    const sites = main ? [main, ...list.filter((w) => w.id !== main.id)] : []
    const qty = new Map<string, Record<string, number>>()
    const others = new Set(sites.slice(1).map((w) => w.id))
    const add = (productId: string, siteId: string | undefined, n: number) => {
      if (!siteId || !others.has(siteId) || !productId) return
      const row = qty.get(productId) || {}
      row[siteId] = (row[siteId] || 0) + n
      qty.set(productId, row)
    }
    for (const p of db.purchases) add(p.productId, p.siteId, p.qty)
    for (const o of db.factoryOrders) for (const r of o.receipts) add(o.productId, r.siteId, r.qty)
    for (const s of db.imports) if (s.direction !== 'export' && s.steps.warehouse?.date) add(s.productId, s.siteId, s.qty)
    for (const t of db.stockTransfers || []) for (const l of t.lines) { add(l.productId, t.from, -l.qty); add(l.productId, t.to, l.qty) }
    if (main) {
      for (const p of db.products) {
        const row = qty.get(p.id) || {}
        let rest = p.stock - Object.values(row).reduce((a, b) => a + b, 0)
        // the main warehouse cannot be below zero while others hold stock: those goods left from there
        for (const id of Object.keys(row)) {
          if (rest >= 0) break
          const take = Math.min(row[id], -rest)
          if (take > 0) { row[id] -= take; rest += take }
        }
        row[main.id] = rest
        qty.set(p.id, row)
      }
    }
    return { sites, mainId: main?.id || '', qty }
  })

/** How much of a product is in one warehouse. */
export const qtyAt = (db: Db, siteId: string, productId: string): number => siteStock(db).qty.get(productId)?.[siteId] || 0

export interface SiteSummary {
  site: WarehouseSite
  /** Products with stock here. */
  items: { productId: string; name: string; unit: string; qty: number; value: number; low: boolean }[]
  units: number
  value: number
  /** Last 90 days: goods received here and moved in or out. */
  received: number
  movedIn: number
  movedOut: number
}

/** Each warehouse: what it holds and how busy it has been. */
export const siteSummaries = (db: Db): SiteSummary[] =>
  memo(db, 'siteSummaries', () => {
    const st = siteStock(db)
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const log = inboundLog(db).filter((r) => r.date >= since)
    return st.sites.map((site) => {
      const items = db.products.filter((p) => !p.archived).map((p) => {
        const q = st.qty.get(p.id)?.[site.id] || 0
        return { productId: p.id, name: p.name, unit: p.unit, qty: q, value: q * (p.cost || 0), low: site.id === st.mainId && p.lowAt > 0 && q <= p.lowAt }
      }).filter((x) => Math.abs(x.qty) > 0.0001).sort((a, b) => b.value - a.value)
      const transfers = (db.stockTransfers || []).filter((t) => t.date >= since)
      return {
        site, items, units: sum(items, (x) => x.qty), value: sum(items, (x) => x.value),
        received: log.filter((r) => (r.siteId || st.mainId) === site.id).length,
        movedIn: transfers.filter((t) => t.to === site.id).length, movedOut: transfers.filter((t) => t.from === site.id).length,
      }
    })
  })
