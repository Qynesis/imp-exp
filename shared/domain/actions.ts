/**
 * Every change a person can make to the books. Each action receives a draft copy of the books and
 * edits it in place; the store swaps the draft in afterwards. Payload types are checked at every call site.
 */
import { applyBusinessTypes, TRANSPORT_HEAD } from './catalog'
import { byId, mustFind } from './calc/common'
import { emptyCustoms } from './calc/customs'
import { productInUse } from './calc/products'
import { computeShipment } from './calc/shipments'
import type {
  Advance, BusinessTypeId, Category, Collection, Company, CustomsInfo, CustomsStage, Dealer, Db, Direction, Employee, Expense, Factory,
  FactoryOrderType, FieldDef, ISODate, Invoice, FactoryEstimate, MaterialGiven, MaterialSettlement, Parcel, Production, TransportLink, Trip, TripStatus, Vehicle, StockAdjustment, MonthKey, PayrollLine, Permissions, Product, Shipment, StepKey, Supplier, SupplierTerms,
  CustomValues,
} from './types'

const tick = (d: Db) => ++d.seq.ts
const uid = (d: Db, prefix: string) => prefix + ++d.seq.id
const customsOf = (s: Shipment): CustomsInfo => (s.customs = { ...emptyCustoms(), ...s.customs })

export interface NewFactoryOrderInput {
  factoryId: string
  type: FactoryOrderType
  productId: string
  qty: number
  rate: number
  placed: ISODate
  expected: ISODate
  advance: number
  method: string
  materials: MaterialGiven[]
  custom: CustomValues
  /** Set when the order comes from an approved estimate. */
  estimateId?: string
}
export interface NewShipmentInput extends Omit<Shipment, 'id' | 'ts' | 'costs' | 'steps'> {
  direction: Direction
  startDate: ISODate
  expected: ISODate
}
export type InvoiceData = Omit<Invoice, 'id' | 'ts' | 'status'>

export const actions = {
  /** Restore a backup. Users and roles stay as they are. */
  replaceAll(d: Db, next: Db) {
    const keep = { users: d.users, roles: d.roles }
    Object.assign(d, next, keep)
  },
  saveCompany(d: Db, p: Partial<Company>) {
    Object.assign(d.company, p)
  },

  saveRole(d: Db, p: { id?: string; name: string; perms: Permissions }) {
    const cur = byId(d.roles, p.id)
    if (cur) Object.assign(cur, { name: p.name, perms: p.perms })
    else d.roles.push({ id: uid(d, 'role'), name: p.name, perms: p.perms })
  },
  removeRole(d: Db, id: string) {
    d.roles = d.roles.filter((r) => r.id !== id || r.system)
  },
  addField(d: Db, p: Omit<FieldDef, 'id'>) {
    d.fieldDefs.push({ id: uid(d, 'cf'), ...p })
  },
  removeField(d: Db, id: string) {
    d.fieldDefs = d.fieldDefs.filter((f) => f.id !== id)
  },
  setBusinessTypes(d: Db, types: BusinessTypeId[]) {
    const added = types.filter((t) => !d.businessTypes.includes(t))
    d.businessTypes = types
    applyBusinessTypes(d, added)
  },

  addCategory(d: Db, p: Omit<Category, 'id'>) {
    d.categories.push({ id: uid(d, 'c'), name: p.name, parentId: p.parentId || null })
  },
  saveCategory(d: Db, p: Category) {
    const c = mustFind(d.categories, p.id, 'Category')
    c.name = p.name
    // a category with sub categories stays at the top level
    c.parentId = p.parentId && p.parentId !== p.id && !d.categories.some((x) => x.parentId === p.id) ? p.parentId : null
  },
  removeCategory(d: Db, id: string) {
    if (d.products.some((p) => p.categoryId === id) || d.categories.some((c) => c.parentId === id)) throw new Error('Category is not empty')
    d.categories = d.categories.filter((c) => c.id !== id)
  },
  saveProduct(d: Db, p: Omit<Product, 'id'> & { id?: string }) {
    const cur = byId(d.products, p.id)
    if (cur) Object.assign(cur, p)
    else d.products.push({ ...p, id: uid(d, 'p') })
  },
  archiveProduct(d: Db, p: { id: string; archived: boolean }) {
    mustFind(d.products, p.id, 'Product').archived = p.archived || undefined
  },
  /** Only for products that never appear in any record; others are archived instead. */
  removeProduct(d: Db, id: string) {
    if (productInUse(d, id)) throw new Error('Product is used in records')
    d.products = d.products.filter((p) => p.id !== id)
  },
  adjustStock(d: Db, p: Omit<StockAdjustment, 'id' | 'ts'>) {
    mustFind(d.products, p.productId, 'Product').stock += p.qty
    ;(d.adjustments ??= []).push({ id: uid(d, 'adj'), ts: tick(d), ...p })
  },
  /** Make finished goods in our own workshop: materials leave stock, the product comes in at material plus making cost. */
  produce(d: Db, p: Omit<Production, 'id' | 'ts'>) {
    const prod = mustFind(d.products, p.productId, 'Product')
    let materialCost = 0
    for (const m of p.materials) {
      const mat = mustFind(d.products, m.productId, 'Product')
      mat.stock -= m.given
      materialCost += m.given * mat.cost
    }
    if (p.qty > 0) prod.cost = Math.round(((materialCost + p.extraCost) / p.qty) * 100) / 100
    prod.stock += p.qty
    ;(d.productions ??= []).push({ id: uid(d, 'mk'), ts: tick(d), ...p })
  },

  addFactory(d: Db, p: Omit<Factory, 'id'>) {
    d.factories.push({ id: uid(d, 'f'), ...p })
  },
  newFactoryOrder(d: Db, p: NewFactoryOrderInput) {
    const id = 'FO-' + d.seq.fo++
    const order = {
      id, ts: tick(d), factoryId: p.factoryId, type: p.type, productId: p.productId, qty: p.qty, rate: p.rate,
      placed: p.placed, expected: p.expected, materials: p.materials, custom: p.custom, receipts: [], bills: [], estimateId: p.estimateId,
      payments: p.advance > 0 ? [{ id: uid(d, 'fp'), ts: tick(d), date: p.placed, amount: p.advance, method: p.method, note: `Advance for ${id}` }] : [],
    }
    // materials handed to the factory leave our warehouse
    for (const m of p.materials) mustFind(d.products, m.productId, 'Product').stock -= m.given
    d.factoryOrders.unshift(order)
    const est = byId(d.estimates || [], p.estimateId)
    if (est) {
      est.status = 'ordered'
      est.orderId = id
    }
  },
  /** A new estimate, or changes to one that has not become an order yet. */
  saveEstimate(d: Db, p: Omit<FactoryEstimate, 'id' | 'ts' | 'status'> & { id?: string }) {
    const list = (d.estimates ??= [])
    const cur = byId(list, p.id)
    if (cur) {
      if (cur.status === 'ordered') throw new Error('Estimate already confirmed')
      // a changed estimate has to be sent and approved again
      Object.assign(cur, p, { status: 'draft', sentOn: undefined, answeredOn: undefined, answer: undefined })
    } else {
      list.unshift({ ...p, id: 'EST-' + (d.seq.est ??= 101), ts: tick(d), status: 'draft' })
      d.seq.est++
    }
  },
  setEstimateStatus(d: Db, p: { id: string; status: 'sent' | 'approved' | 'rejected' | 'draft'; date: ISODate; answer?: string; rate?: number; qty?: number }) {
    const e = mustFind(d.estimates || [], p.id, 'Estimate')
    if (e.status === 'ordered') throw new Error('Estimate already confirmed')
    e.status = p.status
    if (p.status === 'sent') e.sentOn = p.date
    if (p.status === 'approved' || p.status === 'rejected') {
      e.answeredOn = p.date
      e.answer = p.answer || undefined
      // the factory may come back with its own price or quantity
      if (p.rate) e.rate = p.rate
      if (p.qty) e.qty = p.qty
    }
  },
  removeEstimate(d: Db, id: string) {
    d.estimates = (d.estimates || []).filter((e) => e.id !== id || e.status === 'ordered')
  },
  /** Change the quantity or rate while the factory is working. Never below what has already arrived. */
  amendOrder(d: Db, p: { orderId: string; qty: number; rate: number; date: ISODate; reason: string }) {
    const o = mustFind(d.factoryOrders, p.orderId, 'Factory order')
    const received = o.receipts.reduce((s, r) => s + r.qty, 0)
    if (p.qty < received) throw new Error('Below what has arrived')
    ;(o.amendments ??= []).push({ id: uid(d, 'am'), ts: tick(d), date: p.date, fromQty: o.qty, toQty: p.qty, fromRate: o.rate, toRate: p.rate, reason: p.reason })
    o.qty = p.qty
    o.rate = p.rate
  },
  /** Take leftover material back from a factory, or write it off as wastage there. */
  settleFactoryMaterial(d: Db, p: Omit<MaterialSettlement, 'id' | 'ts'> & { orderId: string }) {
    const { orderId, ...rest } = p
    const o = mustFind(d.factoryOrders, orderId, 'Factory order')
    ;(o.settlements ??= []).push({ id: uid(d, 'ms'), ts: tick(d), ...rest })
    if (p.kind === 'returned') mustFind(d.products, p.productId, 'Product').stock += p.qty
  },
  /**
   * Goods arriving from a factory. Freight paid to bring them in is saved as a Transport expense; when
   * it is part of the product's cost, the cost per unit becomes the average of what was in stock and
   * this shipment at its order rate plus freight.
   */
  receiveShipment(d: Db, p: { orderId: string; date: ISODate; challan: string; qty: number; damaged: number; note: string; freight?: number; freightInCost?: boolean; method?: string }) {
    const o = mustFind(d.factoryOrders, p.orderId, 'Factory order')
    const id = uid(d, 'fr')
    const freight = p.freight && p.freight > 0 ? p.freight : 0
    o.receipts.push({ id, ts: tick(d), date: p.date, challan: p.challan, qty: p.qty, damaged: p.damaged, note: p.note, freight: freight || undefined, freightInCost: freight ? !!p.freightInCost : undefined })
    if (freight) {
      d.expenses.push({ id: uid(d, 'ex'), ts: tick(d), date: p.date, head: TRANSPORT_HEAD, amount: freight, method: p.method || 'Cash',
        details: `Freight to warehouse · ${o.id}${p.challan ? ` · ${p.challan}` : ''}`, transport: { kind: 'Freight to warehouse', orderId: o.id } })
    }
    const prod = byId(d.products, o.productId)
    if (!prod) return
    if (freight && p.freightInCost && p.qty > 0) {
      const unit = o.rate + freight / p.qty
      const before = Math.max(prod.stock, 0)
      prod.cost = Math.round(((before * prod.cost + p.qty * unit) / (before + p.qty)) * 100) / 100
    }
    prod.stock += p.qty
  },
  factoryBill(d: Db, p: { orderId: string; date: ISODate; billNo: string; amount: number; receiptId: string }) {
    mustFind(d.factoryOrders, p.orderId, 'Factory order').bills.push({ id: uid(d, 'fb'), ts: tick(d), date: p.date, billNo: p.billNo, amount: p.amount, receiptId: p.receiptId })
  },
  payFactory(d: Db, p: { orderId: string; date: ISODate; amount: number; method: string; note: string }) {
    mustFind(d.factoryOrders, p.orderId, 'Factory order').payments.push({ id: uid(d, 'fp'), ts: tick(d), date: p.date, amount: p.amount, method: p.method, note: p.note })
  },

  addSupplier(d: Db, p: Omit<Supplier, 'id'>) {
    d.suppliers.push({ id: uid(d, 's'), ...p })
  },
  newPurchase(d: Db, p: { supplierId: string; billNo: string; date: ISODate; productId: string; qty: number; rate: number; terms: SupplierTerms; paid: number; method: string }) {
    const id = uid(d, 'pur')
    d.seq.pb++
    d.purchases.push({ id, billNo: p.billNo, ts: tick(d), supplierId: p.supplierId, date: p.date, productId: p.productId, qty: p.qty, rate: p.rate, terms: p.terms })
    const prod = mustFind(d.products, p.productId, 'Product')
    prod.stock += p.qty
    prod.cost = p.rate
    if (p.paid > 0) d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: id, date: p.date, amount: p.paid, method: p.method, note: 'Paid on purchase' })
  },
  paySupplier(d: Db, p: { supplierId: string; purchaseId: string; date: ISODate; amount: number; method: string; note: string }) {
    d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: p.purchaseId, date: p.date, amount: p.amount, method: p.method, note: p.note })
  },

  newImport(d: Db, p: NewShipmentInput) {
    const { startDate, expected, ...rest } = p
    const exp = p.direction === 'export'
    const steps: Shipment['steps'] = exp
      ? { contract: { date: startDate }, ready: {}, customs: {}, shipped: { expected }, paid: {} }
      : { lc: { date: startDate }, shipped: {}, port: { expected }, customs: {}, warehouse: {} }
    const id = exp ? 'EXP-' + String(d.seq.exp++).padStart(3, '0') : 'IMP-' + String(d.seq.imp++).padStart(3, '0')
    d.imports.unshift({ ...rest, id, ts: tick(d), costs: [], steps })
  },
  addImportCost(d: Db, p: { importId: string; type: string; amount: number; method: string; date: ISODate }) {
    mustFind(d.imports, p.importId, 'Shipment').costs.push({ id: uid(d, 'ic'), ts: tick(d), type: p.type, amount: p.amount, method: p.method, date: p.date })
  },
  markImportStep(d: Db, p: { importId: string; key: StepKey; date: ISODate }) {
    const s = mustFind(d.imports, p.importId, 'Shipment')
    s.steps[p.key] = { date: p.date }
    const prod = byId(d.products, s.productId)
    if (!prod) return
    if (s.direction !== 'export' && p.key === 'warehouse') {
      // imported goods enter stock at their landed cost
      prod.stock += s.qty
      prod.cost = Math.round(computeShipment(d, s).perUnit * 100) / 100
    }
    if (s.direction === 'export' && p.key === 'shipped') {
      s.unitCost = prod.cost
      prod.stock -= s.qty
    }
  },
  saveCustoms(d: Db, p: { importId: string; data: Partial<CustomsInfo> }) {
    const s = mustFind(d.imports, p.importId, 'Shipment')
    s.customs = { ...customsOf(s), ...p.data }
  },
  toggleCustomsDoc(d: Db, p: { importId: string; name: string }) {
    const cu = customsOf(mustFind(d.imports, p.importId, 'Shipment'))
    cu.docs[p.name] = !cu.docs[p.name]
  },
  markCustomsStage(d: Db, p: { importId: string; key: CustomsStage; date: ISODate }) {
    const s = mustFind(d.imports, p.importId, 'Shipment')
    customsOf(s).stages[p.key] = p.date
    if (p.key === 'release' && !s.steps.customs?.date) s.steps.customs = { date: p.date }
  },

  saveDealer(d: Db, p: Omit<Dealer, 'id'> & { id?: string }) {
    const cur = byId(d.dealers, p.id)
    if (cur) Object.assign(cur, p)
    else d.dealers.push({ ...p, id: uid(d, 'd') })
  },
  saveInvoice(d: Db, p: { id: string; data: InvoiceData; final: boolean }) {
    let inv = byId(d.invoices, p.id)
    if (!inv) {
      inv = { ...p.data, id: uid(d, 'DRAFT-'), status: 'draft', ts: 0 }
      d.invoices.push(inv)
    }
    Object.assign(inv, p.data, { ts: tick(d) })
    if (p.final) {
      inv.status = 'final'
      inv.id = (d.company.invoicePrefix || '') + d.seq.inv++
      for (const l of inv.lines) {
        // freeze wording and cost so later edits to the product do not change old invoices or profit
        const prod = mustFind(d.products, l.productId, 'Product')
        l.name = prod.name
        l.unit = prod.unit
        l.cost = prod.cost
        prod.stock -= l.qty
      }
    }
  },
  collect(d: Db, p: Omit<Collection, 'id' | 'ts'>) {
    d.collections.push({ id: uid(d, 'col'), ts: tick(d), ...p })
  },

  saveVehicle(d: Db, p: Omit<Vehicle, 'id'> & { id?: string }) {
    const list = (d.vehicles ??= [])
    const cur = byId(list, p.id)
    if (cur) Object.assign(cur, p)
    else list.push({ ...p, id: uid(d, 'v') })
  },
  archiveVehicle(d: Db, p: { id: string; archived: boolean }) {
    mustFind(d.vehicles || [], p.id, 'Vehicle').archived = p.archived || undefined
  },
  /** A new trip (with any costs paid when it is booked), or changes to one. */
  saveTrip(d: Db, p: { trip: Omit<Trip, 'id' | 'ts'> & { id?: string }; costs?: { kind: TransportLink['kind']; amount: number; method: string }[] }) {
    const list = (d.trips ??= [])
    let trip = byId(list, p.trip.id)
    if (trip) Object.assign(trip, p.trip)
    else {
      trip = { ...p.trip, id: 'TR-' + (d.seq.trip ??= 1001), ts: tick(d) }
      d.seq.trip++
      list.unshift(trip)
    }
    for (const c of p.costs || []) {
      if (c.amount <= 0) continue
      addTransportExpense(d, { date: trip.date, amount: c.amount, method: c.method, details: '', link: { kind: c.kind, tripId: trip.id, vehicleId: trip.vehicleId || undefined, transporter: c.kind === 'Hire charge' ? trip.hire?.transporter : undefined } })
    }
  },
  setTripStatus(d: Db, p: { id: string; status: TripStatus; date: ISODate; receivedBy?: string; deliveryNote?: string }) {
    const t = mustFind(d.trips || [], p.id, 'Trip')
    t.status = p.status
    t.doneOn = p.status === 'done' ? p.date : undefined
    if (p.status === 'done') {
      t.receivedBy = p.receivedBy || undefined
      t.deliveryNote = p.deliveryNote || undefined
    }
  },
  /** Fuel, repairs, hire charges and every other transport cost. Goes into the cashbook as a Transport expense. */
  addTransportCost(d: Db, p: { date: ISODate; amount: number; method: string; details: string; link: TransportLink }) {
    addTransportExpense(d, p)
  },

  saveCourierSettings(d: Db, p: NonNullable<Company['courier']>) {
    d.company.courier = p
  },
  saveParcel(d: Db, p: Omit<Parcel, 'id' | 'ts'> & { id?: string }) {
    const list = (d.parcels ??= [])
    const cur = byId(list, p.id)
    if (cur) Object.assign(cur, p)
    else list.unshift({ ...p, id: uid(d, 'pc'), ts: tick(d) })
  },
  setParcelStatus(d: Db, p: { id: string; status: string; date: ISODate }) {
    const x = mustFind(d.parcels || [], p.id, 'Parcel')
    if (x.status === p.status) return
    x.status = p.status
    x.history.push({ date: p.date, status: p.status })
  },

  addExpense(d: Db, p: Omit<Expense, 'id' | 'ts'>) {
    d.expenses.push({ id: uid(d, 'ex'), ts: tick(d), ...p })
  },
  addAdvance(d: Db, p: Omit<Advance, 'id' | 'ts'>) {
    d.advances.push({ id: uid(d, 'ad'), ts: tick(d), ...p })
  },
  /** Monthly targets: the company's, and each salesperson's by employee id. */
  setSalesTargets(d: Db, p: { company: number; staff: Record<string, number> }) {
    d.company.salesTarget = p.company || undefined
    for (const e of d.employees) if (e.id in p.staff) e.salesTarget = p.staff[e.id] || undefined
  },
  saveEmployee(d: Db, p: Omit<Employee, 'id'> & { id?: string }) {
    const cur = byId(d.employees, p.id)
    if (cur) Object.assign(cur, p)
    else d.employees.push({ ...p, id: uid(d, 'e') })
  },
  payPayroll(d: Db, p: { month: MonthKey; date: ISODate; method: string; lines: PayrollLine[] }) {
    d.payroll.push({ id: uid(d, 'pr'), ts: tick(d), ...p })
  },
} satisfies Record<string, (d: Db, payload: never) => void>

function addTransportExpense(d: Db, p: { date: ISODate; amount: number; method: string; details: string; link: TransportLink }) {
  const v = byId(d.vehicles || [], p.link.vehicleId)
  const who = v ? `${v.name}${v.regNo ? ` (${v.regNo})` : ''}` : p.link.transporter || ''
  const details = p.details || [p.link.kind, who, p.link.tripId].filter(Boolean).join(' · ')
  d.expenses.push({ id: uid(d, 'ex'), ts: tick(d), date: p.date, head: TRANSPORT_HEAD, details, amount: p.amount, method: p.method, transport: p.link })
}

export type Actions = typeof actions
export type ActionName = keyof Actions
export type ActionPayload<K extends ActionName> = Parameters<Actions[K]>[1]

/** Apply one action to a copy of the books and return the copy. The original is never changed. */
export function applyAction<K extends ActionName>(db: Db, name: K, payload: ActionPayload<K>): Db {
  const draft = structuredClone(db)
  ;(actions[name] as (d: Db, p: ActionPayload<K>) => void)(draft, payload)
  return draft
}
