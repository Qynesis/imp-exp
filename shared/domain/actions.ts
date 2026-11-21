/**
 * Every change a person can make to the books. Each action receives a draft copy of the books and
 * edits it in place; the store swaps the draft in afterwards. Payload types are checked at every call site.
 */
import { applyBusinessTypes, TRANSPORT_HEAD } from './catalog'
import { byId, mustFind } from './calc/common'
import { emptyCustoms } from './calc/customs'
import { productInUse } from './calc/products'
import { sampleParcels } from './sampleParcels'
import { addSampleDelivery, hasSampleDelivery, removeSampleDelivery } from './sampleDelivery'
import { computeShipment } from './calc/shipments'
import { depreciationDue } from './calc/assets'
import { accountOf } from './calc/cashbook'
import { tk } from './format'
import { countryByCode } from './countries'
import { investorRows, profitPool, splitProfit } from './calc/investors'
import type {
  Advance, BusinessTypeId, Category, Collection, Company, CustomsInfo, CustomsStage, Dealer, Db, Direction, Employee, Expense, Factory,
  FactoryOrderType, FieldDef, ISODate, Invoice, Delivery, FactoryEstimate, MaterialGiven, MessageLog, MessagingSettings, SalesQuote, SalesReturn, MaterialSettlement, Parcel, Production, TransportLink, Trip, TripStatus, Vehicle, StockAdjustment, MonthKey, PayrollLine, Permissions, Product, Shipment, StepKey, Supplier, SupplierTerms,
  CustomValues, Role, FixedAsset, Investor, InvestorTxnKind, Attachment, ChangeArea, ChangeNote, Currency, ExpenseAccount, ExpenseEntry, TaxKind, TaxPayment, TaxRate, AccountHead, AttachTarget,
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

  saveRole(d: Db, p: { id?: string; name: string; perms: Permissions; see?: Role['see'] }) {
    const cur = byId(d.roles, p.id)
    if (cur) Object.assign(cur, { name: p.name, perms: p.perms, see: p.see })
    else d.roles.push({ id: uid(d, 'role'), name: p.name, perms: p.perms, see: p.see })
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
  saveProduct(d: Db, p: Omit<Product, 'id'> & { id?: string; costNote?: string; by?: string }) {
    const { costNote, by, ...product } = p
    const cur = byId(d.products, p.id)
    if (cur && cur.cost !== product.cost) {
      note(d, { area: 'costing', subject: `${cur.name}: cost per ${cur.unit}`, from: String(cur.cost), to: String(product.cost), note: costNote || 'Changed on the product form', by: by || '' })
    }
    if (cur) Object.assign(cur, product)
    else d.products.push({ ...product, id: uid(d, 'p') })
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
  /** Add a factory or change its details. */
  saveFactory(d: Db, p: Omit<Factory, 'id'> & { id?: string }) {
    const name = p.name.trim()
    if (!name) throw new Error('Enter the factory name')
    if (d.factories.some((f) => f.id !== p.id && f.name.toLowerCase() === name.toLowerCase())) throw new Error('There is already a factory with that name')
    const cur = byId(d.factories, p.id)
    if (cur) {
      const { id: _id, ...rest } = p
      Object.assign(cur, { ...rest, name })
    } else d.factories.push({ ...p, name, id: uid(d, 'f') })
  },
  /** Stop using a factory: it leaves the pickers, its orders and history stay. */
  archiveFactory(d: Db, p: { id: string; archived: boolean }) {
    mustFind(d.factories, p.id, 'Factory').archived = p.archived || undefined
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
  payFactory(d: Db, p: { orderId: string; date: ISODate; amount: number; method: string; note: string; attachments?: Attachment[] }) {
    mustFind(d.factoryOrders, p.orderId, 'Factory order').payments.push({ id: uid(d, 'fp'), ts: tick(d), date: p.date, amount: p.amount, method: p.method, note: p.note, attachments: p.attachments })
  },

  addSupplier(d: Db, p: Omit<Supplier, 'id'>) {
    d.suppliers.push({ id: uid(d, 's'), ...p })
  },
  newPurchase(d: Db, p: { supplierId: string; billNo: string; date: ISODate; productId: string; qty: number; rate: number; terms: SupplierTerms; paid: number; method: string; tax?: number; attachments?: Attachment[] }) {
    const id = uid(d, 'pur')
    d.seq.pb++
    if ((p.tax || 0) < 0) throw new Error('VAT cannot be negative')
    d.purchases.push({ id, billNo: p.billNo, ts: tick(d), supplierId: p.supplierId, date: p.date, productId: p.productId, qty: p.qty, rate: p.rate, terms: p.terms, tax: p.tax || undefined })
    const prod = mustFind(d.products, p.productId, 'Product')
    prod.stock += p.qty
    prod.cost = p.rate
    if (p.paid > 0) d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: id, date: p.date, amount: p.paid, method: p.method, note: 'Paid on purchase', attachments: p.attachments })
  },
  paySupplier(d: Db, p: { supplierId: string; purchaseId: string; date: ISODate; amount: number; method: string; note: string; attachments?: Attachment[] }) {
    d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: p.purchaseId, date: p.date, amount: p.amount, method: p.method, note: p.note, attachments: p.attachments })
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
  /**
   * Save a draft, or make the final bill. A final bill does not take stock out: it waits in the
   * delivery section until the goods go, unless `deliverNow` says they were handed over on the spot.
   */
  saveInvoice(d: Db, p: { id: string; data: InvoiceData; final: boolean; deliverNow?: boolean; quoteId?: string }) {
    let inv = byId(d.invoices, p.id)
    if (!inv) {
      inv = { ...p.data, id: uid(d, 'DRAFT-'), status: 'draft', ts: 0 }
      d.invoices.push(inv)
    }
    Object.assign(inv, p.data, { ts: tick(d) })
    if (p.quoteId) inv.quoteId = p.quoteId
    if (p.final) {
      inv.status = 'final'
      inv.id = (d.company.invoicePrefix || '') + d.seq.inv++
      inv.stockOnDelivery = true
      for (const l of inv.lines) {
        // freeze wording and cost so later edits to the product do not change old invoices or profit
        const prod = mustFind(d.products, l.productId, 'Product')
        l.name = prod.name
        l.unit = prod.unit
        l.cost = prod.cost
      }
      if (p.deliverNow) deliver(d, { invoiceId: inv.id, date: inv.date, lines: inv.lines.map((l) => ({ productId: l.productId, qty: l.qty })), via: 'pickup', receivedBy: '', note: 'Handed over with the bill' })
      const q = byId(d.quotes || [], inv.quoteId)
      if (q) {
        q.status = 'invoiced'
        q.invoiceId = inv.id
      }
    }
  },
  /** Goods handed over against an invoice, all or part. Stock leaves the warehouse here. */
  recordDelivery(d: Db, p: Omit<Delivery, 'id' | 'ts' | 'dealerId'>) {
    deliver(d, p)
  },
  /** Close what is left on a bill without delivering it; nothing leaves stock, and a credit can come off the dealer's due. */
  closeRemainder(d: Db, p: { invoiceId: string; date: ISODate; credit: number; note: string }) {
    const left = [...stillToGo(d, p.invoiceId).entries()].filter(([, q]) => q > 0)
    if (!left.length) throw new Error('Nothing left to close')
    deliver(d, { invoiceId: p.invoiceId, date: p.date, lines: left.map(([productId, qty]) => ({ productId, qty })), via: 'own', receivedBy: '', note: p.note, cancelled: true, credit: Math.max(p.credit, 0) || undefined })
  },
  /** Take back a delivery recorded by mistake: its goods return to stock and the bill waits again. */
  undoDelivery(d: Db, id: string) {
    const x = mustFind(d.deliveries || [], id, 'Delivery')
    const inv = mustFind(d.invoices, x.invoiceId, 'Invoice')
    if (!x.cancelled) {
      // goods already returned on this bill cannot be un-delivered underneath the return
      for (const l of x.lines) {
        const out = (d.deliveries || []).filter((y) => y.invoiceId === inv.id && !y.cancelled).reduce((s, y) => s + y.lines.filter((z) => z.productId === l.productId).reduce((m, z) => m + z.qty, 0), 0)
        const back = (d.returns || []).filter((r) => r.invoiceId === inv.id).reduce((s, r) => s + r.lines.filter((z) => z.productId === l.productId).reduce((m, z) => m + z.qty, 0), 0)
        if (out - l.qty < back - 1e-9) throw new Error('Goods from this delivery were returned; undo the return first')
      }
      if (!inv.sample) for (const l of x.lines) mustFind(d.products, l.productId, 'Product').stock += l.qty
    }
    d.deliveries = (d.deliveries || []).filter((y) => y.id !== id)
  },
  /** Sample bills, deliveries and returns to try the delivery section with. They never touch stock or money. */
  loadSampleDelivery(d: Db, p: { today: ISODate }) {
    if (hasSampleDelivery(d)) throw new Error('Sample data is already loaded')
    addSampleDelivery(d, p.today, () => tick(d))
  },
  removeSampleDelivery(d: Db, _: Record<string, never>) {
    removeSampleDelivery(d)
  },
  /** Goods coming back from a dealer: good ones go back into stock, and the credit comes off what they owe. */
  recordReturn(d: Db, p: Omit<SalesReturn, 'id' | 'ts'>) {
    const lines = p.lines.filter((l) => l.qty > 0)
    if (!lines.length) throw new Error('Nothing returned')
    const inv = mustFind(d.invoices, p.invoiceId, 'Invoice')
    if (inv.dealerId !== p.dealerId) throw new Error('That bill belongs to another dealer')
    // only what actually went out can come back
    for (const l of lines) {
      const billed = inv.lines.filter((x) => x.productId === l.productId).reduce((s, x) => s + x.qty, 0)
      const out = inv.stockOnDelivery
        ? (d.deliveries || []).filter((x) => x.invoiceId === inv.id && !x.cancelled).reduce((s, x) => s + x.lines.filter((y) => y.productId === l.productId).reduce((m, y) => m + y.qty, 0), 0)
        : billed
      const back = (d.returns || []).filter((r) => r.invoiceId === inv.id).reduce((s, r) => s + r.lines.filter((y) => y.productId === l.productId).reduce((m, y) => m + y.qty, 0), 0)
      if (l.qty > out - back + 1e-9) throw new Error(`Only ${out - back} of that item can come back on ${inv.id}`)
    }
    if (p.condition === 'restock' && !inv.sample) for (const l of lines) mustFind(d.products, l.productId, 'Product').stock += l.qty
    ;(d.returns ??= []).push({ ...p, lines, id: uid(d, 'RT-'), ts: tick(d), sample: inv.sample || undefined })
  },
  /** A new dealer estimate, or changes to one not yet billed. A changed estimate has to be approved again. */
  saveQuote(d: Db, p: Omit<SalesQuote, 'id' | 'ts' | 'status'> & { id?: string }) {
    const list = (d.quotes ??= [])
    const cur = byId(list, p.id)
    if (cur) {
      if (cur.status === 'invoiced') throw new Error('Estimate already billed')
      Object.assign(cur, p, { status: 'draft', sentOn: undefined, answeredOn: undefined, answer: undefined })
    } else {
      list.unshift({ ...p, id: 'QT-' + (d.seq.qt ??= 101), ts: tick(d), status: 'draft' })
      d.seq.qt++
    }
  },
  setQuoteStatus(d: Db, p: { id: string; status: 'sent' | 'approved' | 'rejected'; date: ISODate; answer?: string }) {
    const q = mustFind(d.quotes || [], p.id, 'Estimate')
    if (q.status === 'invoiced') throw new Error('Estimate already billed')
    q.status = p.status
    if (p.status === 'sent') q.sentOn = p.date
    else {
      q.answeredOn = p.date
      q.answer = p.answer || undefined
    }
  },
  removeQuote(d: Db, id: string) {
    d.quotes = (d.quotes || []).filter((q) => q.id !== id || q.status === 'invoiced')
  },
  logMessage(d: Db, p: Omit<MessageLog, 'id' | 'ts'>) {
    const list = (d.messages ??= [])
    list.unshift({ ...p, id: uid(d, 'msg'), ts: tick(d) })
    // keep the log to a sensible size
    if (list.length > 2000) list.length = 2000
  },
  saveMessaging(d: Db, p: MessagingSettings) {
    d.company.messaging = p
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
  /** Sample parcels across every courier, and test mode on, so the Courier screen can be tried without keys. */
  loadSampleParcels(d: Db, p: { today: ISODate }) {
    const list = (d.parcels ??= [])
    for (const x of sampleParcels(d, p.today)) list.unshift({ ...x, id: uid(d, 'pc'), ts: tick(d) })
    d.company.courier = { provider: d.company.courier?.provider || 'steadfast', autoBook: d.company.courier?.autoBook || false, enabled: ['steadfast', 'pathao', 'redx', 'manual', 'demo'], testMode: true }
  },
  /** Remove every sample parcel; real ones stay. */
  removeSampleParcels(d: Db, _: Record<string, never>) {
    d.parcels = (d.parcels || []).filter((x) => !x.test)
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

  /** Money in each account on the day the books start. The total is the opening cash used everywhere else. */
  setOpeningBalances(d: Db, p: Record<string, number>) {
    const others = Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'Cash' && Number.isFinite(v) && v !== 0))
    d.openingAccounts = others
    d.openingCash = Math.round(((p.Cash || 0) + Object.values(others).reduce((a, b) => a + b, 0)) * 100) / 100
  },

  /** Move money between our own accounts. The total does not change. */
  addTransfer(d: Db, p: { from: string; to: string; amount: number; note: string; date: ISODate; attachments?: Attachment[] }) {
    if (!(p.amount > 0)) throw new Error('Enter the amount')
    if (accountOf(p.from) === accountOf(p.to)) throw new Error('Choose two different accounts')
    ;(d.transfers ??= []).push({ id: uid(d, 'tr'), ts: tick(d), ...p })
  },
  removeTransfer(d: Db, id: string) {
    mustFind(d.transfers || [], id, 'Transfer')
    d.transfers = (d.transfers || []).filter((t) => t.id !== id)
  },

  /* ----- country, tax and VAT ----- */
  /** Pick the country: sets the currency and, if asked, replaces the tax rates with that country's usual ones. */
  setCountry(d: Db, p: { country: string; currency?: Currency; replaceRates: boolean; note: string; by: string }) {
    const c = countryByCode(p.country)
    const before = d.company.tax
    const currency = p.currency || c.currency
    d.company.tax = { country: c.code, currency, taxNo: before?.taxNo || '', salesDefault: before?.salesDefault || [], pricesIncludeTax: before?.pricesIncludeTax || false }
    if (p.replaceRates) {
      for (const r of d.taxRates || []) r.active = false
      const added = c.rates.map((r) => ({ ...r, id: uid(d, 'tx') }))
      d.taxRates = [...(d.taxRates || []), ...added]
      // the first sales VAT/GST/sales tax with a rate is ticked on new bills
      const first = added.find((r) => r.appliesTo !== 'purchases' && r.rate > 0)
      d.company.tax.salesDefault = first ? [first.id] : []
    }
    if (before?.country !== c.code || before?.currency.symbol !== currency.symbol) {
      note(d, { area: 'currency', subject: 'Country and currency', from: before ? `${countryByCode(before.country).name}, ${before.currency.code}` : 'Bangladesh, BDT', to: `${c.name}, ${currency.code}`, note: p.note || 'Changed in Accounts → Tax and VAT', by: p.by })
    }
    if (p.replaceRates) note(d, { area: 'vat', subject: `${c.taxName} rates set for ${c.name}`, note: p.note || `${c.rates.length} standard rates loaded`, by: p.by })
  },
  saveTaxSettings(d: Db, p: { taxNo: string; salesDefault: string[]; pricesIncludeTax: boolean }) {
    const t = d.company.tax || { country: 'BD', currency: countryByCode('BD').currency, taxNo: '', salesDefault: [], pricesIncludeTax: false }
    d.company.tax = { ...t, ...p }
  },
  /** Add or change a rate. Every change is kept with its reason, so old bills and reports can be explained later. */
  saveTaxRate(d: Db, p: { rate: Omit<TaxRate, 'id'> & { id?: string }; note: string; by: string; effective?: ISODate }) {
    const r = p.rate
    if (!r.name.trim()) throw new Error('Give the rate a name, e.g. VAT 15%')
    if (!(r.rate >= 0 && r.rate <= 100)) throw new Error('The rate must be between 0 and 100 percent')
    const list = (d.taxRates ??= [])
    const cur = byId(list, r.id)
    const area: ChangeArea = r.kind === 'income' || r.kind === 'withholding' ? 'tax' : 'vat'
    if (cur) {
      const changed = cur.rate !== r.rate || cur.active !== r.active || cur.name !== r.name || cur.appliesTo !== r.appliesTo || cur.kind !== r.kind
      if (changed && !p.note.trim()) throw new Error('Write a short note on why the rate changed (for example the NBR order or budget)')
      if (changed) note(d, { area, subject: cur.name === r.name ? r.name : `${cur.name} → ${r.name}`, from: `${cur.rate}%${cur.active ? '' : ' (off)'}`, to: `${r.rate}%${r.active ? '' : ' (off)'}`, note: p.note, by: p.by, effective: p.effective })
      const { id: _id, ...rest } = r
      Object.assign(cur, rest)
    } else {
      list.push({ ...r, id: uid(d, 'tx') })
      note(d, { area, subject: `New rate: ${r.name}`, to: `${r.rate}%`, note: p.note || 'Added', by: p.by, effective: p.effective })
    }
  },
  /** A note about VAT, tax, costing or anything else that changed, written by hand. */
  addChangeNote(d: Db, p: { area: ChangeArea; subject: string; note: string; by: string; effective?: ISODate; from?: string; to?: string }) {
    if (!p.subject.trim() || !p.note.trim()) throw new Error('Write what changed and the note')
    note(d, p)
  },
  removeChangeNote(d: Db, id: string) {
    mustFind(d.changeNotes || [], id, 'Note')
    d.changeNotes = (d.changeNotes || []).filter((n) => n.id !== id)
  },
  /** A new cost per unit, with the reason (new supplier price, freight went up…). */
  updateCost(d: Db, p: { productId: string; cost: number; note: string; by: string; date: ISODate }) {
    const prod = mustFind(d.products, p.productId, 'Product')
    if (!(p.cost >= 0)) throw new Error('Enter the new cost')
    if (!p.note.trim()) throw new Error('Write why the cost changed')
    if (prod.cost === p.cost) throw new Error('That is already the cost')
    note(d, { area: 'costing', subject: `${prod.name}: cost per ${prod.unit}`, from: String(prod.cost), to: String(p.cost), note: p.note, by: p.by, date: p.date })
    prod.cost = p.cost
  },
  payTax(d: Db, p: { kind: TaxKind; period: string; amount: number; method: string; ref: string; note: string; date: ISODate; attachments?: Attachment[] }) {
    if (!(p.amount > 0)) throw new Error('Enter the amount paid')
    if (!/^\d{4}-\d{2}$/.test(p.period)) throw new Error('Choose the month the tax is for')
    ;(d.taxPayments ??= []).push({ ...p, id: uid(d, 'tp'), ts: tick(d) } satisfies TaxPayment)
  },
  removeTaxPayment(d: Db, id: string) {
    mustFind(d.taxPayments || [], id, 'Tax payment')
    d.taxPayments = (d.taxPayments || []).filter((x) => x.id !== id)
  },

  /* ----- account heads and regular expenses ----- */
  saveAccountHead(d: Db, p: Omit<AccountHead, 'id'> & { id?: string }) {
    const name = p.name.trim()
    if (!name) throw new Error('Name the account, e.g. Rent or Bank charges')
    const list = (d.accountHeads ??= [])
    if (list.some((h) => h.name.toLowerCase() === name.toLowerCase() && h.id !== p.id)) throw new Error('There is already an account with that name')
    const cur = byId(list, p.id)
    if (cur) {
      // the expenses keep their head by name: rename them with it
      if (cur.name !== name) {
        for (const e of d.expenses) if (e.head === cur.name) e.head = name
        for (const a of d.expenseAccounts || []) if (a.head === cur.name) a.head = name
      }
      Object.assign(cur, { ...p, name })
    } else list.push({ ...p, name, id: uid(d, 'ah') })
  },
  archiveAccountHead(d: Db, p: { id: string; archived: boolean }) {
    mustFind(d.accountHeads || [], p.id, 'Account').archived = p.archived || undefined
  },
  /** Open (or change) a regular expense: rent, electricity, internet, a guard's wage. */
  saveExpenseAccount(d: Db, p: Omit<ExpenseAccount, 'id'> & { id?: string }) {
    if (!p.name.trim()) throw new Error('Name the expense, e.g. Warehouse rent')
    if (p.frequency !== 'variable' && !(p.amount > 0)) throw new Error('Enter the amount for each period, or choose “Bill amount changes”')
    if (p.end && p.end < p.start) throw new Error('The end date is before the start date')
    const list = (d.expenseAccounts ??= [])
    const cur = byId(list, p.id)
    if (cur) {
      if (cur.amount !== p.amount || cur.frequency !== p.frequency) {
        note(d, { area: 'expense', subject: `${p.name}: regular amount`, from: `${cur.amount} ${cur.frequency}`, to: `${p.amount} ${p.frequency}`, note: 'Changed on the expense account', by: '' })
      }
      const { id: _id, ...rest } = p
      Object.assign(cur, rest)
    } else list.push({ ...p, id: uid(d, 'ea') })
  },
  /** A bill for a period, a payment (whole or part, before or after it is due), or a correction. */
  expenseEntry(d: Db, p: Omit<ExpenseEntry, 'id' | 'ts'>) {
    const a = mustFind(d.expenseAccounts || [], p.accountId, 'Expense account')
    if (p.kind !== 'adjustment' && !(p.amount > 0)) throw new Error('Enter the amount')
    if (p.kind === 'adjustment' && !p.amount) throw new Error('Enter the amount to add (+) or take off (−)')
    if (p.kind === 'adjustment' && !p.note.trim()) throw new Error('Write why the balance is corrected')
    if (p.kind === 'bill' && p.period && (d.expenseEntries || []).some((e) => e.accountId === a.id && e.kind === 'bill' && e.period === p.period)) throw new Error('There is already a bill for that period. Remove it first to enter a new one')
    ;(d.expenseEntries ??= []).push({ ...p, id: uid(d, 'ee'), ts: tick(d) })
  },
  removeExpenseEntry(d: Db, id: string) {
    mustFind(d.expenseEntries || [], id, 'Entry')
    d.expenseEntries = (d.expenseEntries || []).filter((e) => e.id !== id)
  },

  /* ----- attachments ----- */
  /** Keep a money receipt, bank slip or other document with a payment. The file is uploaded first; this links it. */
  attach(d: Db, p: { target: AttachTarget; id: string; file: Attachment }) {
    const rec = attachable(d, p.target, p.id)
    if ((rec.attachments || []).length >= 10) throw new Error('Up to 10 files per payment')
    rec.attachments = [...(rec.attachments || []), p.file]
  },
  detach(d: Db, p: { target: AttachTarget; id: string; fileId: string }) {
    const rec = attachable(d, p.target, p.id)
    rec.attachments = (rec.attachments || []).filter((f) => f.id !== p.fileId)
    if (!rec.attachments.length) delete rec.attachments
  },

  /* ----- fixed assets ----- */
  /** Add an asset, or change one. Once depreciation is booked, its cost and life are fixed until that is undone. */
  saveAsset(d: Db, p: AssetInput & { id?: string }) {
    if (!p.name.trim()) throw new Error('Enter the asset name')
    if (!(p.cost > 0)) throw new Error('Enter what the asset cost')
    if (p.salvage < 0 || p.salvage >= p.cost) throw new Error('Scrap value must be less than the cost')
    if (p.method === 'straight' && !(p.lifeMonths > 0)) throw new Error('Enter how many months the asset will last')
    if (p.method === 'declining' && !(p.rate > 0 && p.rate < 100)) throw new Error('Enter the yearly depreciation rate, between 1 and 99 percent')
    const list = (d.assets ??= [])
    const cur = byId(list, p.id)
    if (cur) {
      if (cur.depreciation.length && (cur.cost !== p.cost || cur.salvage !== p.salvage || cur.method !== p.method || cur.lifeMonths !== p.lifeMonths || cur.rate !== p.rate || cur.date !== p.date)) {
        throw new Error('Depreciation is already booked on this asset. Undo it first to change cost, date or life')
      }
      const { id: _id, ...rest } = p
      Object.assign(cur, rest)
      return
    }
    const n = (d.seq.fa = (d.seq.fa || 0) + 1)
    list.push({ ...p, id: `FA-${p.date.slice(0, 4)}-${String(n).padStart(5, '0')}`, ts: tick(d), status: 'active', depreciation: [] })
  },
  /** Remove an asset entered by mistake. Its purchase leaves the cashbook too. */
  removeAsset(d: Db, id: string) {
    const a = mustFind(d.assets || [], id, 'Asset')
    if (a.depreciation.length) throw new Error('Depreciation is booked on this asset. Dispose of it instead, or undo the depreciation first')
    if (a.status === 'disposed') throw new Error('This asset is already disposed. Undo the disposal first')
    d.assets = (d.assets || []).filter((x) => x.id !== id)
  },
  /** Book one month's depreciation for every active asset that still needs it. */
  runDepreciation(d: Db, p: { month: MonthKey; date: ISODate }) {
    const due = depreciationDue(d, p.month)
    if (!due.length) throw new Error('Nothing to depreciate for that month: every active asset is done or bought later')
    for (const { asset, amount } of due) {
      mustFind(d.assets || [], asset.id, 'Asset').depreciation.push({ id: uid(d, 'dp'), month: p.month, date: p.date, amount })
    }
  },
  /** Take back a month's depreciation, for one asset or for all of them. */
  undoDepreciation(d: Db, p: { month: MonthKey; assetId?: string }) {
    let n = 0
    for (const a of d.assets || []) {
      if (p.assetId && a.id !== p.assetId) continue
      if (a.status === 'disposed') continue
      const before = a.depreciation.length
      a.depreciation = a.depreciation.filter((x) => x.month !== p.month)
      n += before - a.depreciation.length
    }
    if (!n) throw new Error('No depreciation booked for that month')
  },
  /** Sell or scrap an asset. The sale price comes into the cashbook; profit or loss against its book value goes to P&L. */
  disposeAsset(d: Db, p: { id: string; date: ISODate; amount: number; method: string; note: string }) {
    const a = mustFind(d.assets || [], p.id, 'Asset')
    if (a.status === 'disposed') throw new Error('This asset is already disposed')
    if (p.amount < 0) throw new Error('The sale price cannot be negative')
    if (p.date < a.date) throw new Error('It cannot be disposed before it was bought')
    if (a.depreciation.some((x) => x.month > p.date.slice(0, 7))) throw new Error('Depreciation is booked after that date. Undo it first')
    Object.assign(a, { status: 'disposed', disposedOn: p.date, disposalAmount: p.amount, disposalMethod: p.method, disposalNote: p.note })
  },
  undoDisposal(d: Db, id: string) {
    const a = mustFind(d.assets || [], id, 'Asset')
    if (a.status !== 'disposed') throw new Error('This asset is not disposed')
    a.status = 'active'
    delete a.disposedOn
    delete a.disposalAmount
    delete a.disposalMethod
    delete a.disposalNote
  },

  /* ----- investors ----- */
  /** Add an investor (with the capital they bring in), or change their details. */
  saveInvestor(d: Db, p: { investor: Omit<Investor, 'id' | 'status'> & { id?: string }; capital?: number; method?: string; date?: ISODate }) {
    if (!p.investor.name.trim()) throw new Error('Enter the investor’s name')
    const list = (d.investors ??= [])
    const cur = byId(list, p.investor.id)
    if (cur) {
      const { id: _id, ...rest } = p.investor
      Object.assign(cur, rest)
      return
    }
    const inv: Investor = { ...p.investor, id: uid(d, 'iv'), status: 'active' }
    list.push(inv)
    if (p.capital && p.capital > 0) {
      ;(d.investorTxns ??= []).push({ id: uid(d, 'it'), ts: tick(d), date: p.date || inv.joined, investorId: inv.id, kind: 'invest', amount: p.capital, method: p.method || 'Cash', note: 'Opening capital' })
    }
  },
  /** Money between the company and an investor: capital in or back, profit paid, or profit kept as capital. */
  investorMoney(d: Db, p: { investorId: string; kind: Exclude<InvestorTxnKind, 'share'>; amount: number; method: string; note: string; date: ISODate; attachments?: Attachment[] }) {
    const inv = mustFind(d.investors || [], p.investorId, 'Investor')
    if (!(p.amount > 0)) throw new Error('Enter the amount')
    const row = investorRows(d).find((r) => r.investor.id === inv.id)
    if (p.kind === 'invest' && inv.status !== 'active') throw new Error('This investor has left. Make them active again first')
    if (p.kind === 'withdraw' && p.amount > (row?.capital || 0) + 0.005) throw new Error(`Only ${tk(row?.capital || 0)} of capital is in the business`)
    if ((p.kind === 'payout' || p.kind === 'reinvest') && p.amount > (row?.available || 0) + 0.005) throw new Error(`Only ${tk(row?.available || 0)} of profit is waiting for this investor`)
    ;(d.investorTxns ??= []).push({ id: uid(d, 'it'), ts: tick(d), ...p, method: p.kind === 'reinvest' ? '' : p.method })
  },
  removeInvestorTxn(d: Db, id: string) {
    const t = mustFind(d.investorTxns || [], id, 'Entry')
    if (t.kind === 'share') throw new Error('Profit shares come from a distribution. Undo the distribution instead')
    d.investorTxns = (d.investorTxns || []).filter((x) => x.id !== id)
    // taking back capital or profit later must still be covered
    const row = investorRows(d).find((r) => r.investor.id === t.investorId)
    if (row && (row.capital < -0.005 || row.available < -0.005)) throw new Error('Later entries depend on this one. Remove those first')
  },
  setInvestorStatus(d: Db, p: { id: string; status: Investor['status'] }) {
    const inv = mustFind(d.investors || [], p.id, 'Investor')
    const row = investorRows(d).find((r) => r.investor.id === inv.id)
    if (p.status === 'exited' && row && (row.capital > 0.005 || row.available > 0.005)) throw new Error('Pay back their capital and profit before they leave')
    inv.status = p.status
  },
  /** Share profit out among active investors by ownership today. */
  distributeProfit(d: Db, p: { amount: number; period: string; note: string; date: ISODate; allowOverPool?: boolean }) {
    if (!(p.amount > 0)) throw new Error('Enter the amount to share out')
    const pool = profitPool(d).pool
    if (!p.allowOverPool && p.amount > pool + 0.005) throw new Error(`Only ${tk(Math.max(pool, 0))} of profit is not shared out yet`)
    const parts = splitProfit(d, p.amount)
    if (!parts.length) throw new Error('No active investor has capital in the business')
    const n = (d.seq.pd = (d.seq.pd || 0) + 1)
    const id = 'PD-' + n
    ;(d.distributions ??= []).push({ id, ts: tick(d), amount: p.amount, period: p.period, note: p.note, date: p.date })
    for (const part of parts) {
      ;(d.investorTxns ??= []).push({ id: uid(d, 'it'), ts: tick(d), date: p.date, investorId: part.investorId, kind: 'share', amount: part.amount, method: '', note: p.period, distributionId: id })
    }
  },
  undoDistribution(d: Db, id: string) {
    mustFind(d.distributions || [], id, 'Distribution')
    d.distributions = (d.distributions || []).filter((x) => x.id !== id)
    d.investorTxns = (d.investorTxns || []).filter((t) => t.distributionId !== id)
    if (investorRows(d).some((r) => r.available < -0.005)) throw new Error('Some of this profit is already paid out. Remove those payments first')
  },
} satisfies Record<string, (d: Db, payload: never) => void>

/** How much of each product on a bill is still to go: billed less delivered and closed. */
function stillToGo(d: Db, invoiceId: string): Map<string, number> {
  const inv = mustFind(d.invoices, invoiceId, 'Invoice')
  const left = new Map<string, number>()
  for (const l of inv.lines) left.set(l.productId, (left.get(l.productId) || 0) + l.qty)
  for (const x of (d.deliveries || []).filter((x) => x.invoiceId === invoiceId)) for (const l of x.lines) left.set(l.productId, (left.get(l.productId) || 0) - l.qty)
  return left
}

/**
 * Goods leaving against a bill, or (cancelled) the rest of a bill closed without going. The books
 * refuse more than is still to go, and more than the warehouse holds, whoever asks.
 */
function deliver(d: Db, p: Omit<Delivery, 'id' | 'ts' | 'dealerId'>) {
  const inv = mustFind(d.invoices, p.invoiceId, 'Invoice')
  if (inv.status !== 'final' || !inv.stockOnDelivery) throw new Error('This bill does not wait for delivery')
  const lines = p.lines.filter((l) => l.qty > 0)
  if (!lines.length) throw new Error('Nothing delivered')
  const left = stillToGo(d, inv.id)
  for (const l of lines) {
    const prod = mustFind(d.products, l.productId, 'Product')
    if (!left.has(l.productId)) throw new Error(`${prod.name} is not on bill ${inv.id}`)
    if (l.qty > (left.get(l.productId) || 0) + 1e-9) throw new Error(`Only ${left.get(l.productId)} ${prod.unit} of ${prod.name} is left on ${inv.id}`)
    if (!p.cancelled && !inv.sample && l.qty > prod.stock + 1e-9) throw new Error(`Only ${prod.stock} ${prod.unit} of ${prod.name} in the warehouse`)
  }
  // sample bills only show how delivery works; they never touch real stock
  if (!p.cancelled && !inv.sample) for (const l of lines) mustFind(d.products, l.productId, 'Product').stock -= l.qty
  ;(d.deliveries ??= []).push({ ...p, lines, dealerId: inv.dealerId, id: uid(d, p.cancelled ? 'CL-' : 'DL-'), ts: tick(d), sample: inv.sample || undefined })
}

/** Keep a dated "why" note for a change to VAT, tax, costing or currency. */
function note(d: Db, n: Omit<ChangeNote, 'id' | 'ts' | 'date'> & { date?: ISODate }) {
  ;(d.changeNotes ??= []).push({ ...n, date: n.date || new Date().toISOString().slice(0, 10), id: uid(d, 'cn'), ts: tick(d) })
}

function attachable(d: Db, kind: AttachTarget, id: string): { attachments?: Attachment[] } {
  switch (kind) {
    case 'collection': return mustFind(d.collections, id, 'Collection')
    case 'supplierPayment': return mustFind(d.supplierPayments, id, 'Payment')
    case 'factoryPayment': {
      for (const o of d.factoryOrders) {
        const pay = o.payments.find((x) => x.id === id)
        if (pay) return pay
      }
      throw new Error('Payment not found')
    }
    case 'expense': return mustFind(d.expenses, id, 'Expense')
    case 'advance': return mustFind(d.advances, id, 'Advance')
    case 'investorTxn': return mustFind(d.investorTxns || [], id, 'Entry')
    case 'transfer': return mustFind(d.transfers || [], id, 'Transfer')
    case 'taxPayment': return mustFind(d.taxPayments || [], id, 'Tax payment')
    case 'expenseEntry': return mustFind(d.expenseEntries || [], id, 'Entry')
  }
}

function addTransportExpense(d: Db, p: { date: ISODate; amount: number; method: string; details: string; link: TransportLink }) {
  const v = byId(d.vehicles || [], p.link.vehicleId)
  const who = v ? `${v.name}${v.regNo ? ` (${v.regNo})` : ''}` : p.link.transporter || ''
  const details = p.details || [p.link.kind, who, p.link.tripId].filter(Boolean).join(' · ')
  d.expenses.push({ id: uid(d, 'ex'), ts: tick(d), date: p.date, head: TRANSPORT_HEAD, details, amount: p.amount, method: p.method, transport: p.link })
}

export type AssetInput = Omit<FixedAsset, 'id' | 'ts' | 'status' | 'depreciation' | 'disposedOn' | 'disposalAmount' | 'disposalMethod' | 'disposalNote'>

export type Actions = typeof actions
export type ActionName = keyof Actions
export type ActionPayload<K extends ActionName> = Parameters<Actions[K]>[1]

/** Apply one action to a copy of the books and return the copy. The original is never changed. */
export function applyAction<K extends ActionName>(db: Db, name: K, payload: ActionPayload<K>): Db {
  const draft = structuredClone(db)
  ;(actions[name] as (d: Db, p: ActionPayload<K>) => void)(draft, payload)
  // a new top-level object: anything an action worked out on the draft is cached against it, before its own change
  return { ...draft }
}
