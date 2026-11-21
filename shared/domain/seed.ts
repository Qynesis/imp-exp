import { applyBusinessTypes, TRANSPORT_HEAD, WAREHOUSE_PLACE } from './catalog'
import { actions } from './actions'
import { depreciationDue } from './calc/assets'
import { accountBalances, accountOf, cashEntries, cashForDay } from './calc/cashbook'
import { newBarcode } from './barcode'
import { profitPool } from './calc/investors'
import { stockHistory } from './calc/products'
import { sampleParcels } from './sampleParcels'
import { addSampleDelivery } from './sampleDelivery'
import { addDays, addMonths, daysBetween, fmonth, parse, todayISO } from './format'
import { defaultRoles } from './permissions'
import type {
  Collection, Dealer, DealerTerms, Expense, MessageKind, TransportCostKind, TransportLink, Trip, TripStatus, Vehicle, Db, Employee, FactoryBill, FactoryOrder, FactoryOrderType, FactoryPayment, FactoryReceipt, Invoice, InvoiceLine, ISODate,
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

  // FO-1042 went up from 40 to 50 cartons while the factory was working; one shipment came in with freight
  const fo42 = db.factoryOrders.find((o) => o.id === 'FO-1042')
  if (fo42) {
    fo42.amendments = [{ id: 'am1', ts: t(), date: d(12), fromQty: 40, toQty: 50, fromRate: 1200, toRate: 1200, reason: 'Dealer demand up before winter, factory agreed 10 more' }]
    if (fo42.receipts[0]) Object.assign(fo42.receipts[0], { freight: 3500, freightInCost: true })
  }
  db.estimates = [
    { id: 'EST-103', ts: t(), date: d(1), factoryId: 'f2', type: 2, productId: 'pouch', qty: 1500, rate: 148, wanted: d(-20), validUntil: d(-10), materials: [], note: 'Same pouch print as last lot', status: 'draft' },
    { id: 'EST-102', ts: t(), date: d(4), factoryId: 'f1', type: 1, productId: 'coil', qty: 60, rate: 1150, wanted: d(-25), validUntil: '', materials: [{ productId: 'powder', given: 600 }, { productId: 'inner', given: 3600 }, { productId: 'master', given: 60 }], note: '', status: 'sent', sentOn: d(3) },
    { id: 'EST-101', ts: t(), date: d(9), factoryId: 'f3', type: 2, productId: 'inner', qty: 6000, rate: 6, wanted: d(-12), validUntil: '', materials: [], note: 'Inner boxes, 2-colour print', status: 'approved', sentOn: d(8), answeredOn: d(6), answer: 'Approved at Tk 6, delivery in two lots' },
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
  // contact details so messages and couriers have someone to reach
  const contacts: Record<string, [string, string, string]> = {
    d1: ['Abdur Rahman', '01711-284530', 'Shop 22, Agrabad Commercial Area'],
    d2: ['Mohammad Ali', '01819-336721', 'Chawkbazar Main Road'],
    d3: ['Nurul Islam', '01915-702288', 'Hathazari Bazar'],
    d4: ['Aminul Haque', '01672-440913', 'Patiya Sadar Road'],
  }
  for (const x of db.dealers) if (contacts[x.id]) Object.assign(x, { owner: contacts[x.id][0], phone: contacts[x.id][1], address: contacts[x.id][2] })
  const phones: Record<string, [string, string]> = {
    s1: ['Kamrul Hasan', '01713-405566'], s2: ['Jahangir Alam', '01817-229034'], s3: ['Faruk Ahmed', '01911-760143'],
    f1: ['Mizanur Rahman', '01715-338890'], f2: ['Delwar Hossain', '01819-447712'], f3: ['Shahidul Islam', '01712-905521'],
  }
  for (const x of [...db.suppliers, ...db.factories]) if (phones[x.id] && !x.phone) Object.assign(x, { contact: phones[x.id][0], phone: phones[x.id][1] })
  const staffPhones: Record<string, string> = { e1: '01711-120034', e2: '01811-450672', e4: '01712-660981', e5: '01913-284415' }
  for (const e of db.employees) if (staffPhones[e.id] && !e.phone) e.phone = staffPhones[e.id]

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
  const madina = db.dealers.find((x) => x.id === 'd5')
  if (madina) Object.assign(madina, { courier: true, phone: '01812-447090', owner: 'Abdul Kader', address: 'Shop 14, Port Connecting Road' })
  // sample parcels across every courier, with test mode on so nothing real is ever booked
  db.company.courier = { provider: 'steadfast', autoBook: false, enabled: ['steadfast', 'pathao', 'redx', 'manual', 'demo'], testMode: true }
  db.parcels = sampleParcels(db, T).map((x, k) => ({ ...x, id: 'pc' + (k + 1), ts: t() }))
  addDeliveryAndMessages(db, T, t)
  for (const [id, target] of [['e4', 1500000], ['e5', 1200000]] as const) (db.employees.find((e) => e.id === id) as Employee).salesTarget = target
  db.seq = { id: 1000, ts, fo: 1043, inv: 2312, imp: 16, exp: 2, pb: 222, est: 104, qt: 104 }
  ts = addTransportHistory(db, T, ts)
  addAssetsAndInvestors(db, T)
  addAccountsAndExpenses(db, T)
  applyBusinessTypes(db, ['food'])
  // choose the opening cash so that today opens at Tk 4,10,000: Tk 85,000 in hand, Tk 2,90,000 in the bank, Tk 35,000 in bKash
  db.openingCash = 410000 - cashForDay(db, T).opening
  addAccountTransfers(db, T)
  const opened = accountBalances({ ...db, openingAccounts: {} }, addDays(T, -1))
  const need = (a: string, target: number) => target - (opened.find((r) => r.account === a)?.balance || 0)
  db.openingAccounts = { Bank: need('Bank', 290000), bKash: need('bKash', 35000) }
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

/**
 * Delivery, returns, dealer estimates and a message log for the demo. The bills of the last few days
 * wait in the delivery section (one part delivered); older bills count as delivered, a few with returns.
 */
function addDeliveryAndMessages(db: Db, today: ISODate, tick: () => number) {
  const d = (n: number) => addDays(today, -n)
  const finals = db.invoices.filter((i) => i.status === 'final')
  const recent = finals.filter((i) => i.date >= d(3))
  db.deliveries = []
  recent.forEach((inv, k) => {
    inv.stockOnDelivery = true
    // the oldest of them went out in full, the next in part, the rest still wait
    if (k === 0) db.deliveries!.push({ id: 'DL-1', ts: tick(), date: inv.date, invoiceId: inv.id, dealerId: inv.dealerId, lines: inv.lines.map((l) => ({ productId: l.productId, qty: l.qty })), via: 'own', receivedBy: 'Shop manager', note: '' })
    if (k === 1) db.deliveries!.push({ id: 'DL-2', ts: tick(), date: addDays(inv.date, 1) > today ? inv.date : addDays(inv.date, 1), invoiceId: inv.id, dealerId: inv.dealerId, lines: inv.lines.slice(0, 1).map((l) => ({ productId: l.productId, qty: Math.max(1, Math.floor(l.qty / 2)) })), via: 'own', receivedBy: '', note: 'Truck full, rest tomorrow' })
  })
  // returns against older, fully delivered bills
  const older = finals.filter((i) => i.date < d(5) && i.date >= d(60))
  const R = (k: number, ago: number, condition: 'restock' | 'damaged', reason: string, note: string, share: number) => {
    const inv = older[(k * 7) % Math.max(older.length, 1)]
    if (!inv) return null
    const l = inv.lines[0]
    const qty = Math.max(1, Math.round(l.qty * share))
    return { id: `RT-${k + 1}`, ts: tick(), date: d(ago), invoiceId: inv.id, dealerId: inv.dealerId, lines: [{ productId: l.productId, qty, price: l.price }], condition, credit: qty * l.price, reason, note }
  }
  db.returns = [
    R(0, 4, 'damaged', 'Damaged in transit', 'Bottom cartons crushed', 0.05),
    R(1, 11, 'restock', 'Dealer could not sell', 'Slow in that market, took back unopened', 0.15),
    R(2, 19, 'damaged', 'Expired or near expiry', 'Batch near expiry', 0.08),
    R(3, 33, 'restock', 'Wrong item sent', 'Sent 5 L jars instead of 1 L pouches', 0.1),
  ].filter((x): x is NonNullable<typeof x> => !!x)
  for (const r of db.returns) if (r.condition === 'restock') for (const l of r.lines) { const p = db.products.find((x) => x.id === l.productId); if (p) p.stock += l.qty }
  // the warehouse holds what the waiting bills need, with room to sell more
  for (const p of db.products.filter((x) => x.kind === 'finished')) {
    const held = recent.reduce((n, inv) => n + inv.lines.filter((l) => l.productId === p.id).reduce((m, l) => m + l.qty, 0), 0) - db.deliveries.filter((x) => recent.some((i) => i.id === x.invoiceId)).reduce((n, x) => n + x.lines.filter((l) => l.productId === p.id).reduce((m, l) => m + l.qty, 0), 0)
    p.stock = Math.max(p.stock, held + 3 * (p.lowAt || 10))
  }

  const line = (id: string, qty: number) => {
    const p = db.products.find((x) => x.id === id) as Product
    return { productId: id, qty, price: p.price, name: p.name, unit: p.unit }
  }
  db.quotes = [
    { id: 'QT-103', ts: tick(), date: d(0), dealerId: 'd3', soldBy: 'e5', terms: 'credit', lines: [line('coil', 40), line('jar', 60)], discount: 2000, validUntil: d(-7), note: 'Delivery to Hathazari included.', status: 'draft' },
    { id: 'QT-102', ts: tick(), date: d(2), dealerId: 'd1', soldBy: 'e4', terms: 'credit', lines: [line('pouch', 300), line('jar', 40)], discount: 0, validUntil: d(-5), note: '', status: 'sent', sentOn: d(2) },
    { id: 'QT-101', ts: tick(), date: d(5), dealerId: 'd2', soldBy: 'e4', terms: 'credit', lines: [line('coil', 25)], discount: 1000, validUntil: d(-2), note: 'Winter season price.', status: 'approved', sentOn: d(5), answeredOn: d(4), answer: 'Confirmed on phone' },
  ]

  // the sample bills, deliveries and returns, as any company can load them
  addSampleDelivery(db, today, tick)

  db.company.messaging = {
    whatsapp: 'link', sms: 'gateway', testMode: true, reminderDays: 3, templates: {},
    auto: { invoice: ['whatsapp'], payment: ['whatsapp', 'sms'], reminder: ['sms'], estimate: [], delivery: [], occasional: [] },
    lastReminderRun: today,
  }
  const dealer = (id: string) => db.dealers.find((x) => x.id === id)
  const M = (ago: number, kind: MessageKind, channel: 'whatsapp' | 'sms', dealerId: string, text: string, status: 'sent' | 'opened' | 'failed' = 'sent', ref = '', error?: string) =>
    ({ id: 'msg' + tick(), ts: tick(), date: d(ago), kind, channel, to: dealer(dealerId)?.phone || '01700-000000', dealerId, text, status, ref, error, test: true })
  const co = db.company.name || 'Star Bangla Demo'
  db.messages = [
    M(0, 'invoice', 'whatsapp', 'd1', `Dear Rahman Traders, bill INV-2311 from ${co}: 5 cartons, 20 jars. Total Tk 28,500, paid Tk 10,000, due Tk 18,500.`, 'opened', 'INV-2311'),
    M(1, 'reminder', 'sms', 'd3', `Dear Notun Bazar Enterprise, a friendly reminder from ${co}: Tk 1,47,000 is due. Please pay at your earliest convenience.`, 'sent', 'INV-2296'),
    M(1, 'reminder', 'sms', 'd2', `Dear Bismillah Store, a friendly reminder from ${co}: Tk 55,000 is due.`, 'failed', 'INV-2301', 'No phone number'),
    M(2, 'estimate', 'whatsapp', 'd1', `Dear Rahman Traders, estimate QT-102 from ${co}: 300 pouches, 40 jars. Valid for a week.`, 'opened', 'QT-102'),
    M(4, 'payment', 'sms', 'd2', `Dear Bismillah Store, we received Tk 65,000. Thank you. Your due with ${co} is now Tk 55,000.`, 'sent'),
    M(9, 'occasional', 'sms', 'd4', `Dear Al-Amin Distribution, new winter stock of mosquito coil is in. Ask your sales officer for the price list. - ${co}`, 'sent'),
    M(9, 'occasional', 'sms', 'd5', `Dear Madina General Store, new winter stock of mosquito coil is in. - ${co}`, 'sent'),
  ]
}

/**
 * Machines, a van and office things bought over the past two years, depreciated every month up to
 * last month (this month is left for the person to run), and three investors with one profit
 * distribution. Built with the real actions so the numbers follow the same rules as the screens.
 */
function addAssetsAndInvestors(db: Db, today: ISODate) {
  const month = today.slice(0, 7)
  // each step runs on a fresh top-level copy, like the app does, so cached figures never go stale
  const step = (fn: (x: Db) => void) => {
    const x = { ...db }
    fn(x)
    Object.assign(db, x)
  }
  const ago = (months: number, day = 10) => `${addMonths(month, -months)}-${String(day).padStart(2, '0')}`
  const asset = (name: string, category: string, months: number, cost: number, salvage: number, lifeYears: number, paidFrom: string, vendor: string, location: string, rate = 0) =>
    step((x) => actions.saveAsset(x, {
      name, category, location, vendor, date: ago(months), cost, salvage, method: rate ? 'declining' : 'straight', lifeMonths: rate ? 0 : lifeYears * 12, rate, paidFrom, note: '',
    }))
  asset('Pouch sealing machine', 'Machinery', 22, 480000, 30000, 8, 'Bank transfer', 'Nawabpur machinery market', 'Workshop')
  asset('Coil packing machine', 'Machinery', 14, 320000, 20000, 6, 'Bank transfer', 'Dholaikhal engineering', 'Workshop')
  asset('Delivery van (Dhaka Metro-Ta 11-2345)', 'Vehicle', 18, 1450000, 250000, 0, 'Bank transfer', 'Tejgaon auto dealer', 'Warehouse', 20)
  asset('Office computers (3)', 'Computer and IT', 10, 165000, 15000, 3, 'Cash', 'Multiplan Center', 'Head office')
  asset('Warehouse racks', 'Furniture', 16, 210000, 10000, 10, 'Cash', 'Local workshop', 'Warehouse')
  asset('Generator 20 kVA', 'Machinery', 6, 380000, 40000, 7, 'Bank transfer', 'Energypac', 'Warehouse')
  // book every past month, oldest first
  const first = (db.assets || []).reduce((m, a) => (a.date.slice(0, 7) < m ? a.date.slice(0, 7) : m), month)
  for (let m = first; m < month; m = addMonths(m, 1)) {
    step((x) => { if (depreciationDue(x, m).length) actions.runDepreciation(x, { month: m, date: `${m}-28` }) })
  }

  const investor = (name: string, phone: string, months: number, capital: number, method: string) => {
    step((x) => actions.saveInvestor(x, { investor: { name, phone, address: 'Dhaka', note: '', joined: ago(months, 1) }, capital, method, date: ago(months, 1) }))
    return (db.investors || [])[(db.investors || []).length - 1].id
  }
  const a = investor('Md. Kamal Hossain', '01711-234567', 24, 2500000, 'Bank transfer')
  const b = investor('Nasrin Akter', '01819-445566', 24, 1500000, 'Bank transfer')
  const c = investor('Abdur Rahim', '01552-778899', 12, 1000000, 'Cash')
  step((x) => actions.investorMoney(x, { investorId: b, kind: 'invest', amount: 500000, method: 'Bank transfer', note: 'Added for winter stock', date: ago(8, 5) }))
  const pool = profitPool({ ...db }).pool
  if (pool > 100000) {
    const amount = Math.floor((pool * 0.4) / 1000) * 1000
    step((x) => actions.distributeProfit(x, { amount, period: `${fmonth(addMonths(month, -12))} to ${fmonth(addMonths(month, -3))}`, note: 'Partners meeting', date: ago(2, 5) }))
    const share = (id: string) => (db.investorTxns || []).filter((t) => t.investorId === id && t.kind === 'share').reduce((s, t) => s + t.amount, 0)
    step((x) => actions.investorMoney(x, { investorId: a, kind: 'payout', amount: share(a), method: 'Bank transfer', note: 'Profit paid', date: ago(2, 8) }))
    step((x) => actions.investorMoney(x, { investorId: c, kind: 'reinvest', amount: share(c), method: '', note: 'Kept in the business', date: ago(2, 8) }))
  }
}

/**
 * Cash taken out of the bank at the start of each month to cover what the month pays in cash, and
 * bKash takings moved to the bank, as a company really does, so each account's balance stays sensible.
 */
function addAccountTransfers(db: Db, today: ISODate) {
  const net = new Map<string, Record<string, number>>()
  for (const e of cashEntries({ ...db })) {
    if (e.date >= today) continue
    const m = e.date.slice(0, 7)
    const row = net.get(m) || {}
    const a = accountOf(e.method)
    row[a] = (row[a] || 0) + e.in - e.out
    net.set(m, row)
  }
  db.transfers = []
  for (const [m, row] of [...net.entries()].sort()) {
    const day = (n: number) => `${m}-${String(n).padStart(2, '0')}`
    if ((row.Cash || 0) < 0) db.transfers.push({ id: 'tr-' + m, ts: ++db.seq.ts, date: day(1), from: 'Bank transfer', to: 'Cash', amount: Math.ceil(-(row.Cash || 0) / 1000) * 1000, note: 'Cash for the month' })
    if ((row.Cash || 0) > 0) db.transfers.push({ id: 'tr-' + m, ts: ++db.seq.ts, date: day(28), from: 'Cash', to: 'Bank transfer', amount: Math.floor((row.Cash || 0) / 1000) * 1000, note: 'Cash deposited in the bank' })
    if ((row.bKash || 0) > 20000) db.transfers.push({ id: 'trb-' + m, ts: ++db.seq.ts, date: day(28), from: 'bKash', to: 'Bank transfer', amount: Math.floor(((row.bKash || 0) - 10000) / 1000) * 1000, note: 'bKash cash-out to bank' })
    if ((row.bKash || 0) < 0) db.transfers.push({ id: 'trb-' + m, ts: ++db.seq.ts, date: day(1), from: 'Bank transfer', to: 'bKash', amount: Math.ceil(-(row.bKash || 0) / 1000) * 1000, note: 'Topped up bKash' })
  }
}

/**
 * Bangladesh tax settings and rates, a few update notes, the company's own expense heads, and regular
 * expenses that show every case: one with a month due, one paid in parts, one paid ahead, one paid weekly.
 */
function addAccountsAndExpenses(db: Db, today: ISODate) {
  const month = today.slice(0, 7)
  const step = (fn: (x: Db) => void) => {
    const x = { ...db }
    fn(x)
    Object.assign(db, x)
  }
  const ago = (months: number, day = 1) => `${addMonths(month, -months)}-${String(day).padStart(2, '0')}`
  step((x) => actions.setCountry(x, { country: 'BD', replaceRates: true, note: 'Set up for Bangladesh', by: 'Demo Owner' }))
  const rate = (name: string) => (db.taxRates || []).find((r) => r.name === name)!
  step((x) => actions.saveTaxSettings(x, { taxNo: '000123456-0101', salesDefault: [rate('VAT 5% (trading)').id], pricesIncludeTax: true }))
  // the last two months of bills carry 5% trading VAT inside the price; some supplier bills carry 15% VAT
  const trading = rate('VAT 5% (trading)')
  for (const inv of db.invoices) {
    if (inv.status === 'final' && !inv.sample && inv.date >= ago(2)) inv.taxes = [{ rateId: trading.id, name: trading.name, kind: 'vat', rate: 5, inclusive: true }]
  }
  for (const p of db.purchases) if (p.date >= ago(3)) p.tax = Math.round(p.qty * p.rate * 0.15)
  step((x) => actions.saveTaxRate(x, { rate: { ...rate('VAT 7.5%'), rate: 10 }, note: 'Budget 2026-27: reduced rate raised for listed goods', by: 'Demo Accountant', effective: ago(4) }))
  step((x) => actions.addChangeNote(x, { area: 'costing', subject: 'Freight from Chattogram port', from: 'Tk 18,000 / truck', to: 'Tk 21,500 / truck', note: 'Diesel price rise; landed cost of imports goes up from this month', by: 'Demo Owner', effective: ago(1, 5) }))
  step((x) => actions.payTax(x, { kind: 'vat', period: addMonths(month, -1), amount: 18500, method: 'Bank transfer', ref: 'A-CH 26-00412', note: 'Mushak 9.1 return', date: ago(0, 12) > today ? today : ago(0, 12) }))

  // barcodes on every item, and carton sizes on finished goods, ready for labels and scanning
  for (const p of db.products) {
    p.barcode = newBarcode(db)
    if (p.kind === 'finished' && !p.unit.includes('carton')) p.perCarton = p.name.includes('1 L') ? 12 : 6
  }
  step((x) => actions.saveAccountHead(x, { name: 'Rent', code: '6500', group: 'expense', note: 'Warehouse and office rent' }))
  step((x) => actions.saveAccountHead(x, { name: 'Utilities', code: '6510', group: 'expense', note: 'Electricity, water, gas, internet' }))
  const open = (name: string, head: string, frequency: 'monthly' | 'variable' | 'daily', amount: number, start: string, party: string) => {
    step((x) => actions.saveExpenseAccount(x, { name, head, party, phone: '', frequency, amount, start, note: '', active: true }))
    return (db.expenseAccounts || [])[(db.expenseAccounts || []).length - 1].id
  }
  const entry = (accountId: string, kind: 'bill' | 'payment', amount: number, date: string, extra: { period?: string; method?: string; note?: string } = {}) =>
    step((x) => actions.expenseEntry(x, { accountId, kind, amount, date: date > today ? today : date, method: extra.method || (kind === 'payment' ? 'Bank transfer' : ''), note: extra.note || '', period: extra.period }))

  // rent: paid every month on the 5th except this month, so this month shows as due
  const rent = open('Warehouse rent', 'Rent', 'monthly', 45000, ago(8), 'Haji Abdul Karim (landlord)')
  for (let m = 8; m >= 1; m--) entry(rent, 'payment', 45000, ago(m, 5), { note: `Rent for ${fmonth(addMonths(month, -m))}` })
  // electricity: a different bill each month, paid in two parts
  const power = open('DESCO electricity', 'Utilities', 'variable', 0, ago(3), 'DESCO')
  ;[[3, 8200], [2, 9100], [1, 7600]].forEach(([m, amt]) => {
    entry(power, 'bill', amt, ago(m, 28), { period: addMonths(month, -m), note: `Bill for ${fmonth(addMonths(month, -m))}` })
    entry(power, 'payment', Math.round(amt / 2), ago(m - 1, 8), { method: 'bKash', note: 'Part payment' })
  })
  entry(power, 'payment', 3550, ago(1, 2), { method: 'bKash' })
  // internet: six months paid in advance
  const net = open('Office internet', 'Utilities', 'monthly', 2000, ago(2), 'Link3')
  entry(net, 'payment', 12000, ago(2, 1), { method: 'Bank transfer', note: 'Six months in advance' })
  // night guard: daily wage, paid every week
  const guard = open('Night guard', 'Employee', 'daily', 500, addDays(today, -27), 'Md. Rafiq')
  for (let w = 3; w >= 0; w--) entry(guard, 'payment', 3500, addDays(today, -w * 7 - 1), { method: 'Cash', note: 'Weekly wage' })
}
