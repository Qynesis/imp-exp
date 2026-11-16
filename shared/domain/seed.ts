import { applyBusinessTypes, TRANSPORT_HEAD, WAREHOUSE_PLACE } from './catalog'
import { cashForDay } from './calc/cashbook'
import { stockHistory } from './calc/products'
import { addDays, addMonths, daysBetween, parse, todayISO } from './format'
import { defaultRoles } from './permissions'
import type {
  Collection, Dealer, DealerTerms, Expense, TransportCostKind, TransportLink, Trip, TripStatus, Vehicle, Db, Employee, FactoryBill, FactoryOrder, FactoryOrderType, FactoryPayment, FactoryReceipt, Invoice, InvoiceLine, ISODate,
  MaterialGiven, Product, ProductKind, Purchase, ShipmentCost, SupplierPayment, SupplierTerms,
} from './types'

/** Empty books for a new company. */
export function emptyDb(): Db {
  return {
    v: 1,
    seq: { id: 100, ts: 0, fo: 1001, inv: 1, imp: 1, exp: 1, pb: 1 },
    company: { name: '', tagline: 'Import and trading', phone: '', address: '', invoicePrefix: 'INV-', invoiceNote: '', logo: '' },
    users: [],
    roles: defaultRoles(),
    businessTypes: [],
    fieldDefs: [],
    openingCash: 0,
    categories: [], products: [], factories: [], factoryOrders: [],
    suppliers: [], purchases: [], supplierPayments: [], imports: [],
    dealers: [], invoices: [], collections: [],
    expenses: [], advances: [], employees: [], payroll: [],
  }
}

/** Sample books, dated relative to the day they are created so "today" always has activity. */
export function demoDb(): Db {
  const T = todayISO()
  const d = (n: number): ISODate => addDays(T, -n)
  let ts = 0
  const t = () => ++ts
  const db = emptyDb()

  db.categories = [
    { id: 'c1', name: 'Edible oil', parentId: null },
    { id: 'c1a', name: 'Soyabean oil', parentId: 'c1' },
    { id: 'c1b', name: 'Mustard oil', parentId: 'c1' },
    { id: 'c2', name: 'Household', parentId: null },
    { id: 'c2a', name: 'Mosquito coil', parentId: 'c2' },
    { id: 'c2b', name: 'Aerosol', parentId: 'c2' },
    { id: 'c3', name: 'Raw materials', parentId: null },
    { id: 'c3a', name: 'Coil powder', parentId: 'c3' },
    { id: 'c3b', name: 'Crude oil', parentId: 'c3' },
    { id: 'c4', name: 'Packaging', parentId: null },
    { id: 'c4a', name: 'Cartons and boxes', parentId: 'c4' },
    { id: 'c4b', name: 'Jars and pouches', parentId: 'c4' },
  ]

  const P = (id: string, name: string, code: string, categoryId: string, kind: ProductKind, unit: string, pack: string, cost: number, price: number, stock: number, lowAt: number): Product =>
    ({ id, name, code, categoryId, kind, unit, pack, cost, price, stock, lowAt })
  db.products = [
    P('coil', 'Mosquito coil (10-pc box)', 'MC-10', 'c2a', 'finished', 'cartons', 'carton of 60 boxes', 1800, 2400, 15, 10),
    P('jar', 'Soyabean oil 5 L jar', 'SO-5L', 'c1a', 'finished', 'jars', '', 700, 850, 100, 40),
    P('pouch', 'Soyabean oil 1 L pouch', 'SO-1L', 'c1a', 'finished', 'pouches', '', 150, 180, 420, 100),
    P('powder', 'Coil powder mix', 'RM-CP', 'c3a', 'raw', 'kg', '', 300, 0, 0, 0),
    P('crude', 'Crude soyabean oil', 'RM-CO', 'c3b', 'raw', 'litres', '', 122, 0, 900, 0),
    P('inner', 'Inner coil boxes', 'PK-IB', 'c4a', 'packaging', 'pcs', '', 6, 0, 0, 0),
    P('master', 'Printed master cartons', 'PK-MC', 'c4a', 'packaging', 'pcs', '', 18, 0, 0, 0),
    P('ejar', 'Empty 5 L jars', 'PK-J5', 'c4b', 'packaging', 'pcs', '', 45, 0, 260, 100),
  ]

  // where each product comes from, and what goes into the finished goods
  const setUp = (id: string, extra: Pick<Product, 'sources' | 'supplierIds' | 'recipe'>) => Object.assign(db.products.find((p) => p.id === id) as Product, extra)
  setUp('coil', { sources: ['factory'], recipe: [{ productId: 'powder', qty: 10 }, { productId: 'inner', qty: 60 }, { productId: 'master', qty: 1 }] })
  setUp('jar', { sources: ['factory', 'workshop'], recipe: [{ productId: 'crude', qty: 5 }, { productId: 'ejar', qty: 1 }] })
  setUp('pouch', { sources: ['factory'], recipe: [{ productId: 'crude', qty: 1 }] })
  setUp('powder', { sources: ['supplier', 'import'], supplierIds: ['s1'] })
  setUp('crude', { sources: ['supplier', 'import'], supplierIds: ['s2'] })
  setUp('inner', { sources: ['factory'] })
  setUp('master', { sources: ['factory'] })
  setUp('ejar', { sources: ['supplier'], supplierIds: ['s3'] })

  db.factories = [
    { id: 'f1', name: 'Shapla Chemical Works', contact: '', phone: '', address: '', makes: 'Mosquito coil' },
    { id: 'f2', name: 'Halda Oil Refinery', contact: '', phone: '', address: '', makes: 'Edible oil refining and filling' },
    { id: 'f3', name: 'Patenga Packaging', contact: '', phone: '', address: '', makes: 'Cartons and boxes' },
  ]

  const pay = (date: ISODate, amount: number, method: string, note: string): FactoryPayment => ({ id: 'fp' + t(), ts, date, amount, method, note })
  const rec = (date: ISODate, challan: string, qty: number): FactoryReceipt => ({ id: 'fr' + t(), ts, date, challan, qty, damaged: 0, note: '' })
  const bill = (date: ISODate, billNo: string, amount: number, receiptId: string): FactoryBill => ({ id: 'fb' + t(), ts, date, billNo, amount, receiptId })
  const settled = (id: string, factoryId: string, type: FactoryOrderType, productId: string, qty: number, rate: number, ago: number, materials: MaterialGiven[]): FactoryOrder => {
    const r = rec(d(ago - 6), 'CH-' + (200 + ago), qty)
    return {
      id, ts: t(), factoryId, type, productId, qty, rate, placed: d(ago), expected: d(ago - 6), materials,
      receipts: [r], bills: [bill(d(ago - 6), 'INV-F-' + (120 + ago), qty * rate, r.id)], payments: [pay(d(ago - 4), qty * rate, 'Bank transfer', id + ' settled')],
    }
  }
  const r1042 = rec(d(12), 'CH-311', 20)
  const r1041 = rec(d(6), 'CH-88', 120)
  db.factoryOrders = [
    {
      id: 'FO-1042', ts: t(), factoryId: 'f1', type: 1, productId: 'coil', qty: 50, rate: 1200, placed: d(17), expected: d(-6),
      materials: [{ productId: 'powder', given: 500 }, { productId: 'inner', given: 3000 }, { productId: 'master', given: 50 }],
      receipts: [r1042], bills: [bill(d(12), 'INV-F-208', 24000, r1042.id)], payments: [pay(d(17), 30000, 'Cash', 'Advance for FO-1042')],
    },
    {
      id: 'FO-1041', ts: t(), factoryId: 'f2', type: 2, productId: 'jar', qty: 200, rate: 700, placed: d(14), expected: d(-5), materials: [],
      receipts: [r1041], bills: [bill(d(6), 'HOR-441', 84000, r1041.id)], payments: [pay(d(6), 42000, 'Bank transfer', 'Part of factory bill'), pay(T, 7000, 'Cash', 'Part of factory bill')],
    },
    { id: 'FO-1039', ts: t(), factoryId: 'f3', type: 2, productId: 'master', qty: 5000, rate: 18, placed: d(3), expected: d(-10), materials: [], receipts: [], bills: [], payments: [] },
    settled('FO-1036', 'f2', 1, 'pouch', 600, 12, 30, [{ productId: 'crude', given: 600 }]),
    settled('FO-1033', 'f1', 1, 'coil', 40, 1200, 40, [{ productId: 'powder', given: 400 }, { productId: 'inner', given: 2400 }, { productId: 'master', given: 40 }]),
    settled('FO-1030', 'f3', 2, 'inner', 3000, 6, 48, []),
  ]

  db.suppliers = [
    { id: 's1', name: 'Eastern Chem Supply', contact: '', phone: '', address: '', goods: 'Coil powder mix, chemicals', terms: 'credit', days: 30, opening: 0 },
    { id: 's2', name: 'Sagorika Trading', contact: '', phone: '', address: '', goods: 'Crude soyabean oil', terms: 'credit', days: 15, opening: 0 },
    { id: 's3', name: 'Polyfab Packaging', contact: '', phone: '', address: '', goods: 'Jars, pouches, caps', terms: 'cash', days: 0, opening: 0 },
  ]
  const PB = (id: string, supplierId: string, ago: number, productId: string, qty: number, rate: number, terms: SupplierTerms): Purchase =>
    ({ id, billNo: id, ts: t(), supplierId, date: d(ago), productId, qty, rate, terms })
  db.purchases = [
    PB('PB-203', 's1', 43, 'powder', 600, 300, 'credit'),
    PB('PB-209', 's3', 30, 'ejar', 400, 45, 'cash'),
    PB('PB-214', 's1', 27, 'powder', 300, 300, 'cash'),
    PB('PB-218', 's2', 15, 'crude', 1500, 122, 'credit'),
    PB('PB-221', 's1', 9, 'powder', 500, 300, 'credit'),
  ]
  const SP = (supplierId: string, purchaseId: string, ago: number, amount: number, method: string, note: string): SupplierPayment =>
    ({ id: 'sp' + t(), ts, supplierId, purchaseId, date: d(ago), amount, method, note })
  db.supplierPayments = [
    SP('s3', 'PB-209', 30, 18000, 'Cash', 'Paid on purchase'),
    SP('s1', 'PB-214', 27, 90000, 'Cash', 'Paid on purchase'),
    SP('s1', 'PB-203', 25, 180000, 'Bank transfer', 'Bill cleared'),
    SP('s2', 'PB-218', 15, 122000, 'Bank transfer', 'Paid on purchase'),
    SP('s1', 'PB-221', 9, 30000, 'Cash', 'Part payment'),
  ]

  const cost = (ago: number, type: string, amount: number): ShipmentCost => ({ id: 'ic' + t(), ts, date: d(ago), type, amount, method: 'Bank transfer' })
  db.imports = [
    {
      id: 'EXP-001', direction: 'export', ts: t(), supplier: '', country: 'Nepal', productId: 'pouch', productName: 'Soyabean oil 1 L pouch', qty: 200, unit: 'pouches',
      lcNo: 'SC-2026-014', bank: '', usd: 420, rate: 122, costs: [], steps: { contract: { date: d(2) }, ready: {}, customs: {}, shipped: { expected: d(-9) }, paid: {} },
    },
    {
      id: 'IMP-015', direction: 'import', ts: t(), supplier: '', country: 'China', productId: '', productName: 'Aerosol cans', qty: 10000, unit: 'pcs', lcNo: 'LC-2026-0471', bank: '', usd: 6500, rate: 122,
      costs: [], steps: { lc: { date: d(4) }, shipped: { expected: d(-8) }, port: { expected: d(-30) }, customs: {}, warehouse: {} },
    },
    {
      id: 'IMP-014', direction: 'import', ts: t(), supplier: '', country: 'Malaysia', productId: 'crude', productName: 'Crude soyabean oil', qty: 20000, unit: 'litres', lcNo: 'LC-2026-0457', bank: '', usd: 18000, rate: 122,
      customs: {
        hsCode: '1507.10.00', port: 'Chattogram port', cnf: '', boeNo: 'C-184532', boeDate: d(4), container: 'MSKU 482915-3', av: 0,
        rates: { cd: 10, rd: 0, sd: 0, vat: 5, ait: 0, at: 0 }, freeUntil: d(1), demurragePerDay: 2400,
        stages: { docs: d(6), boe: d(5), assess: d(4), duty: d(4) },
        docs: { 'Commercial invoice': true, 'Packing list': true, 'Bill of lading or airway bill': true, 'LC copy': true, 'Insurance cover note': true },
      },
      costs: [cost(24, 'Sea freight', 110000), cost(24, 'Insurance', 12000), cost(4, 'Customs duty and VAT', 330000), cost(4, 'C&F agent', 25000), cost(3, 'Port charge', 18000), cost(2, 'Transport to warehouse', 22000)],
      steps: { lc: { date: d(33) }, shipped: { date: d(24) }, port: { date: d(5) }, customs: { expected: d(-3) }, warehouse: { expected: d(-4) } },
    },
    {
      id: 'IMP-013', direction: 'import', ts: t(), supplier: '', country: 'India', productId: 'powder', productName: 'Coil powder mix', qty: 5000, unit: 'kg', lcNo: 'LC-2026-0432', bank: '', usd: 4200, rate: 122,
      costs: [cost(50, 'Sea freight', 38000), cost(38, 'Customs duty and VAT', 72600), cost(38, 'C&F agent', 12000), cost(37, 'Port charge', 6000), cost(36, 'Transport to warehouse', 7000)],
      steps: { lc: { date: d(62) }, shipped: { date: d(52) }, port: { date: d(40) }, customs: { date: d(37) }, warehouse: { expected: d(-1) } },
    },
  ]

  const E = (id: string, name: string, role: string, payType: Employee['payType'], salary: number, rate: number, ago: number): Employee =>
    ({ id, name, phone: '', role, payType, salary, rate, commissionOn: 'sales', joined: d(ago) })
  db.employees = [
    E('e1', 'Shirin Sultana', 'Accountant', 'salary', 25000, 0, 700),
    E('e2', 'Kamal Hossain', 'Warehouse keeper', 'salary', 18000, 0, 520),
    E('e3', 'Babul Mia', 'Driver', 'salary', 15000, 0, 300),
    E('e4', 'Jamal Uddin', 'Sales officer', 'sales', 0, 2, 410),
    E('e5', 'Rina Akter', 'Sales officer', 'sales', 0, 2, 200),
  ]

  const D = (id: string, name: string, area: string, terms: DealerTerms, limit: number, days: number, salesId: string): Dealer =>
    ({ id, name, owner: '', phone: '', area, address: '', opening: 0, terms, limit, days, salesId })
  db.dealers = [
    D('d1', 'Rahman Traders', 'Agrabad', 'credit', 100000, 30, 'e4'),
    D('d2', 'Bismillah Store', 'Chawkbazar', 'credit', 150000, 15, 'e4'),
    D('d3', 'Notun Bazar Enterprise', 'Hathazari', 'credit', 150000, 30, 'e5'),
    D('d4', 'Al-Amin Distribution', 'Patiya', 'credit', 80000, 30, 'e5'),
    D('d5', 'Madina General Store', 'Halishahar', 'cod', 0, 0, ''),
  ]

  const line = (productId: string, qty: number): InvoiceLine => {
    const p = db.products.find((x) => x.id === productId) as Product
    return { productId, name: p.name, unit: p.unit, qty, price: p.price, cost: p.cost }
  }
  /** An invoice for roughly `total`, split across coils, jars and pouches. */
  const INV = (no: number, dealerId: string, soldBy: string, ago: number, total: number, received: number, terms: DealerTerms): Invoice => {
    const c = Math.floor((total * 0.45) / 2400)
    let rest = total - c * 2400
    const j = Math.floor((rest * 0.7) / 850)
    rest -= j * 850
    const p = Math.ceil(rest / 180)
    const lines = [line('coil', c), line('jar', j), line('pouch', p)].filter((l) => l.qty > 0)
    return { id: 'INV-' + no, ts: t(), status: 'final', dealerId, soldBy, date: d(ago), terms, lines, discount: p * 180 - rest, received, method: 'Cash' }
  }
  db.invoices = [
    INV(2296, 'd3', 'e5', 76, 167000, 0, 'credit'),
    INV(2301, 'd2', 'e4', 24, 120000, 0, 'credit'),
    INV(2303, 'd1', 'e4', 18, 42000, 0, 'credit'),
    INV(2305, 'd4', 'e5', 12, 130000, 130000, 'cod'),
    INV(2306, 'd2', 'e4', 11, 141500, 141500, 'cod'),
    INV(2307, 'd4', 'e5', 10, 80000, 30000, 'credit'),
    INV(2308, 'd1', 'e4', 8, 150000, 150000, 'cod'),
    INV(2310, 'd5', '', 3, 8500, 8500, 'cod'),
    { id: 'INV-2311', ts: t(), status: 'final', dealerId: 'd1', soldBy: 'e4', date: T, terms: 'credit', lines: [line('coil', 5), line('jar', 20)], discount: 500, received: 10000, method: 'Cash' },
  ]
  db.collections = [
    { id: 'col1', ts: t(), dealerId: 'd3', invoiceId: '', amount: 20000, method: 'Cash', collectedBy: 'e5', date: d(46) },
    { id: 'col2', ts: t(), dealerId: 'd2', invoiceId: '', amount: 65000, method: 'Cash', collectedBy: 'e4', date: T },
  ]

  addSalesHistory(db, T, t)

  const EX = (ago: number, head: string, details: string, amount: number) => ({ id: 'ex' + t(), ts, date: d(ago), head, details, amount, method: 'Cash' })
  db.expenses = [
    EX(9, 'Office', 'Office rent top-up and stationery', 3000),
    EX(7, 'Transport', 'Truck fare, port to warehouse', 8200),
    EX(0, 'Transport', 'Truck fare, factory to warehouse', 4200),
    EX(0, 'Office', 'Electricity bill, warehouse', 3500),
  ]
  db.advances = [
    { id: 'ad1', ts: t(), employeeId: 'e3', amount: 2000, date: d(4), method: 'Cash' },
    { id: 'ad2', ts: t(), employeeId: 'e2', amount: 5000, date: T, method: 'Cash' },
  ]

  db.company.salesTarget = 3000000
  for (const [id, target] of [['e4', 1500000], ['e5', 1200000]] as const) (db.employees.find((e) => e.id === id) as Employee).salesTarget = target
  db.seq = { id: 1000, ts, fo: 1043, inv: 2312, imp: 16, exp: 2, pb: 222 }
  ts = addTransportHistory(db, T, ts)
  applyBusinessTypes(db, ['food'])
  // choose the opening cash so that today opens at Tk 4,10,000
  db.openingCash = 410000 - cashForDay(db, T).opening
  // raise stock where the sample history would otherwise dip below zero, so every product has a sensible opening figure
  for (const p of db.products) {
    const h = stockHistory(db, p.id)
    const low = Math.min(h.opening, ...h.moves.map((m) => m.balance))
    if (low < 0) p.stock -= low
  }
  // a new top-level object, so nothing cached while seeding is reused for the finished books
  return { ...db }
}

/**
 * About fifteen months of past sales for the demo, so daily, monthly and yearly charts have
 * something to show. Deterministic, so every demo looks the same. Credit sales are collected in
 * full before today, which leaves the demo's hand-made dues exactly as they were.
 */
function addSalesHistory(db: Db, today: ISODate, tick: () => number) {
  let seed = 20240607
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]
  const products = db.products.filter((p) => p.kind === 'finished')
  const days = 700
  let no = 1000
  const invoices: Invoice[] = []
  const collections: Collection[] = []
  for (let ago = days; ago >= 1; ago--) {
    const date = addDays(today, -ago)
    const dt = parse(date)
    if (dt.getDay() === 5) continue // Friday, shops shut
    const month = dt.getMonth()
    // slow growth over time, busier before the Eid months and in winter, quieter in the monsoon
    const growth = 0.7 + 0.3 * (1 - ago / days)
    const season = 1 + 0.35 * Math.cos(((month - 2) / 12) * 2 * Math.PI) * 0.6 + (month === 2 || month === 5 ? 0.35 : 0)
    const count = Math.max(0, Math.round((rnd() * 3.4 + 0.8) * growth * season - 0.3))
    for (let k = 0; k < count; k++) {
      const dealer = pick(db.dealers)
      const lines: InvoiceLine[] = []
      for (const p of products) {
        if (rnd() < 0.45) continue
        const base = p.id === 'coil' ? 22 : p.id === 'jar' ? 55 : 220
        const qty = Math.max(1, Math.round(base * (0.3 + rnd()) * growth))
        // prices were a little lower a year ago
        const price = Math.round(p.price * (0.93 + 0.07 * (1 - ago / days)))
        lines.push({ productId: p.id, name: p.name, unit: p.unit, qty, price, cost: Math.round(p.cost * (0.94 + 0.06 * (1 - ago / days))) })
      }
      if (!lines.length) continue
      const subtotal = lines.reduce((x, l) => x + l.qty * l.price, 0)
      const discount = rnd() < 0.3 ? Math.round((subtotal * 0.01 * Math.ceil(rnd() * 3)) / 10) * 10 : 0
      const total = subtotal - discount
      // recent credit sales would change the demo's dues, so the last month is cash only
      const credit = dealer.terms === 'credit' && ago > 35
      const id = 'INV-' + no++
      invoices.push({ id, ts: tick(), status: 'final', dealerId: dealer.id, soldBy: dealer.salesId, date, terms: credit ? 'credit' : 'cod', lines, discount, received: credit ? 0 : total, method: 'Cash' })
      if (credit) {
        const paidOn = addDays(date, 7 + Math.floor(rnd() * Math.min(dealer.days || 20, ago - 8)))
        collections.push({ id: 'colh' + no, ts: tick(), dealerId: dealer.id, invoiceId: id, amount: total, method: rnd() < 0.5 ? 'Cash' : 'Bank transfer', collectedBy: dealer.salesId, date: paidOn })
      }
    }
  }
  db.invoices = [...invoices, ...db.invoices]
  db.collections = [...collections, ...db.collections]
}

/**
 * A fleet and about four months of trips and running costs for the demo: three own vehicles, one
 * rented by the month, and trucks hired per trip from two agencies. One truck has an expired
 * insurance and a fitness certificate about to run out, so the warnings show. Returns the last `ts`.
 */
function addTransportHistory(db: Db, today: ISODate, ts: number): number {
  const d = (n: number) => addDays(today, -n)
  let seed = 4417
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const tick = () => ++ts
  const V = (id: string, name: string, regNo: string, type: Vehicle['type'], capacity: string, extra: Partial<Vehicle>): Vehicle =>
    ({ id, name, regNo, type, capacity, ownership: 'own', owner: '', monthlyRent: 0, driverId: '', driverName: '', driverPhone: '', papers: {}, note: '', ...extra })
  db.vehicles = [
    V('v1', 'Truck 1', 'Chatta Metro-Ta 11-2345', 'truck', '5 ton', { driverId: 'e3', driverPhone: '01711-402233', phone: '01730-118822', serviceKm: 5000, serviceDays: 90, papers: { fitness: d(-18), taxToken: d(-140), insurance: d(6), routePermit: d(-95), license: d(-400) } }),
    V('v2', 'Covered van', 'Chatta Metro-Ma 14-7788', 'covered-van', '3 ton', { driverName: 'Selim Reza', driverPhone: '01819-556712', phone: '01730-118823', serviceKm: 5000, serviceDays: 90, papers: { fitness: d(-210), taxToken: d(-60), insurance: d(-120), routePermit: d(-170), license: d(-300) } }),
    V('v3', 'Pickup', 'Chatta Metro-Na 12-4410', 'pickup', '1 ton', { driverName: 'Rubel Hossain', driverPhone: '01914-778201', serviceKm: 4000, serviceDays: 60, papers: { fitness: d(-80), taxToken: d(-340), insurance: d(-200), routePermit: d(-150), license: d(-500) } }),
    V('v4', 'Rented truck', 'Dhaka Metro-Ta 18-9021', 'truck', '7 ton', { ownership: 'rented', owner: 'Rahim Truck Service', monthlyRent: 45000, driverName: 'Alamgir', driverPhone: '01556-120934', papers: { fitness: d(-60), insurance: d(-90) } }),
  ]
  const trips: Trip[] = []
  const exp: Expense[] = []
  let no = 1001
  const odometers: Record<string, number> = {}
  const cost = (date: ISODate, kind: TransportCostKind, amount: number, link: Partial<TransportLink> = {}, details = '') => {
    const v = db.vehicles?.find((x) => x.id === link.vehicleId)
    exp.push({ id: 'exT' + exp.length, ts: tick(), date, head: TRANSPORT_HEAD, amount, method: kind === 'Hire charge' || kind === 'Vehicle rent' ? (rnd() < 0.5 ? 'Cash' : 'bKash') : 'Cash',
      details: details || [kind, v ? `${v.name} (${v.regNo})` : link.transporter, link.tripId].filter(Boolean).join(' · '), transport: { kind, ...link } })
  }
  const agencies = ['Chattogram Transport Agency', 'Sagor Covered Van Service']
  const hiredNo = ['Chatta Metro-Ta 14-1180', 'Chatta Metro-Ta 16-0442', 'Chatta Metro-Ma 11-9076', 'Dhaka Metro-Ta 20-3315']
  const trip = (t: Omit<Trip, 'id' | 'ts' | 'kmStart' | 'kmEnd' | 'note'> & { km?: number }) => {
    const id = 'TR-' + no++
    const { km, ...rest } = t
    const own = !t.hire
    // each vehicle keeps its own odometer, rolling on trip by trip
    const odo = own ? (odometers[t.vehicleId] ??= 38000 + Math.round(rnd() * 20000)) : undefined
    if (own && km) odometers[t.vehicleId] += km + Math.round(rnd() * 15)
    trips.push({ ...rest, id, ts: tick(), kmStart: odo, kmEnd: odo && km ? odo + km : undefined, note: '' })
    if (own) {
      cost(t.date, 'Fuel', Math.round((km || 30) * 28 / 10) * 10, { vehicleId: t.vehicleId, tripId: id })
      cost(t.date, 'Driver allowance', 300, { vehicleId: t.vehicleId, tripId: id })
      if (rnd() < 0.5) cost(t.date, 'Toll and parking', 100 + Math.round(rnd() * 3) * 50, { vehicleId: t.vehicleId, tripId: id })
    } else if (t.hire) {
      // older hire is paid; the latest few are still owed in part or in full
      const ago = daysBetween(t.date, today)
      const paid = ago > 12 ? t.hire.fare : ago > 4 ? Math.round(t.hire.fare / 2 / 100) * 100 : 0
      if (paid) cost(t.date, 'Hire charge', paid, { tripId: id, transporter: t.hire.transporter })
      if (rnd() < 0.4) cost(t.date, 'Loading and unloading', 400 + Math.round(rnd() * 4) * 100, { tripId: id })
    }
    return id
  }
  // deliveries for invoices of the last four months, one trip each
  const since = d(120)
  const invoices = db.invoices.filter((i) => i.status === 'final' && i.date >= since)
  for (const inv of invoices) {
    const dealer = db.dealers.find((x) => x.id === inv.dealerId)
    const r = rnd()
    const km = 12 + Math.round(rnd() * 45)
    const ago = daysBetween(inv.date, today)
    // a few of the latest orders are still waiting for a truck
    if (ago <= 4 && rnd() < 0.45) continue
    const status: TripStatus = ago === 0 ? (r < 0.5 ? 'on-the-way' : 'planned') : 'done'
    const base = { purpose: 'delivery' as const, status, date: inv.date, from: WAREHOUSE_PLACE, to: [dealer?.name, dealer?.area].filter(Boolean).join(', '), dealerId: inv.dealerId, invoiceId: inv.id, orderId: '', shipmentId: '',
      load: inv.lines.map((l) => `${l.qty} ${l.unit || ''}`.trim()).join(', '), doneOn: status === 'done' ? addDays(inv.date, ago > 1 && rnd() < 0.2 ? 1 : 0) : undefined }
    if (r < 0.72) {
      const vehicleId = r < 0.3 ? 'v1' : r < 0.48 ? 'v2' : r < 0.6 ? 'v3' : 'v4'
      trip({ ...base, vehicleId, km })
    } else {
      trip({ ...base, vehicleId: '', hire: { transporter: agencies[Math.floor(rnd() * 2)], vehicleNo: hiredNo[Math.floor(rnd() * 4)], driver: '', phone: '', fare: 2500 + Math.round(rnd() * 14) * 250 } })
    }
  }
  // pickups: goods from the factories, and imports from the port
  for (const o of db.factoryOrders) for (const rcv of o.receipts) if (rcv.date >= since) {
    const f = db.factories.find((x) => x.id === o.factoryId)
    trip({ purpose: 'pickup', status: 'done', date: rcv.date, doneOn: rcv.date, vehicleId: 'v4', from: f?.name || 'Factory', to: WAREHOUSE_PLACE, dealerId: '', invoiceId: '', orderId: o.id, shipmentId: '', load: `${rcv.qty} from ${o.id}`, km: 25 + Math.round(rnd() * 20) })
  }
  trip({ purpose: 'pickup', status: 'planned', date: today, vehicleId: '', hire: { transporter: 'Chattogram Transport Agency', vehicleNo: 'Chatta Metro-Ta 16-0442', driver: 'Kashem', phone: '01820-334455', fare: 14000 },
    from: 'Chattogram port', to: WAREHOUSE_PLACE, dealerId: '', invoiceId: '', orderId: '', shipmentId: 'IMP-013', load: '5,000 kg coil powder mix' })
  // keeping the fleet on the road: rent, servicing, repairs, tyres, papers
  for (let m = 0; m < 4; m++) {
    const first = `${addMonths(today.slice(0, 7), -m)}-01`
    cost(first < since ? since : first, 'Vehicle rent', 45000, { vehicleId: 'v4', transporter: 'Rahim Truck Service' })
    cost(d(10 + m * 30), 'Servicing', 3500 + m * 200, { vehicleId: m % 2 ? 'v2' : 'v1', odometer: (odometers[m % 2 ? 'v2' : 'v1'] || 40000) - 400 - m * 700 })
    if (m !== 1) cost(d(17 + m * 30), 'Repair', 2500 + Math.round(rnd() * 12) * 500, { vehicleId: m === 2 ? 'v3' : 'v1' }, m === 0 ? 'Repair · Truck 1 · clutch plate changed at Bahaddarhat' : '')
  }
  cost(d(54), 'Tyres and parts', 38000, { vehicleId: 'v1' }, 'Tyres and parts · Truck 1 · two new rear tyres')
  cost(d(75), 'Servicing', 2800, { vehicleId: 'v3', odometer: (odometers.v3 || 40000) - 4300 })
  cost(d(25), 'Papers and tax', 9800, { vehicleId: 'v3' }, 'Papers and tax · Pickup · tax token renewed at BRTA')
  db.trips = trips.sort((a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1))
  db.expenses = [...db.expenses, ...exp]
  db.seq.trip = no
  return ts
}
