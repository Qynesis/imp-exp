import { addDays, todayISO } from './format.js'
import { applyBusinessTypes, defaultRoles } from './presets.js'
import { cashForDay } from './selectors.js'

const STEPS = () => ({ lc: {}, shipped: {}, port: {}, customs: {}, warehouse: {} })

export function emptyDb() {
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

/** Demo books, dated relative to the day they are created so "today" always has activity. */
export function demoDb() {
  const T = todayISO()
  const d = (n) => addDays(T, -n)
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

  const P = (id, name, code, categoryId, kind, unit, pack, cost, price, stock, lowAt) => ({ id, name, code, categoryId, kind, unit, pack, cost, price, stock, lowAt })
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

  db.factories = [
    { id: 'f1', name: 'Shapla Chemical Works', contact: '', phone: '', address: '', makes: 'Mosquito coil' },
    { id: 'f2', name: 'Halda Oil Refinery', contact: '', phone: '', address: '', makes: 'Edible oil refining and filling' },
    { id: 'f3', name: 'Patenga Packaging', contact: '', phone: '', address: '', makes: 'Cartons and boxes' },
  ]

  const pay = (date, amount, method, note) => ({ id: 'fp' + t(), ts, date, amount, method, note })
  const rec = (date, challan, qty) => ({ id: 'fr' + t(), ts, date, challan, qty, damaged: 0, note: '' })
  const bill = (date, billNo, amount, receiptId) => ({ id: 'fb' + t(), ts, date, billNo, amount, receiptId })
  const settled = (id, factoryId, type, productId, qty, rate, ago, materials) => {
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
  const PB = (id, supplierId, ago, productId, qty, rate, terms) => ({ id, billNo: id, ts: t(), supplierId, date: d(ago), productId, qty, rate, terms })
  db.purchases = [
    PB('PB-203', 's1', 43, 'powder', 600, 300, 'credit'),
    PB('PB-209', 's3', 30, 'ejar', 400, 45, 'cash'),
    PB('PB-214', 's1', 27, 'powder', 300, 300, 'cash'),
    PB('PB-218', 's2', 15, 'crude', 1500, 122, 'credit'),
    PB('PB-221', 's1', 9, 'powder', 500, 300, 'credit'),
  ]
  const SP = (supplierId, purchaseId, ago, amount, method, note) => ({ id: 'sp' + t(), ts, supplierId, purchaseId, date: d(ago), amount, method, note })
  db.supplierPayments = [
    SP('s3', 'PB-209', 30, 18000, 'Cash', 'Paid on purchase'),
    SP('s1', 'PB-214', 27, 90000, 'Cash', 'Paid on purchase'),
    SP('s1', 'PB-203', 25, 180000, 'Bank transfer', 'Bill cleared'),
    SP('s2', 'PB-218', 15, 122000, 'Bank transfer', 'Paid on purchase'),
    SP('s1', 'PB-221', 9, 30000, 'Cash', 'Part payment'),
  ]

  const cost = (ago, type, amount) => ({ id: 'ic' + t(), ts, date: d(ago), type, amount, method: 'Bank transfer' })
  db.imports = [
    {
      id: 'IMP-015', direction: 'import', ts: t(), supplier: '', country: 'China', productId: '', productName: 'Aerosol cans', qty: 10000, unit: 'pcs', lcNo: 'LC-2026-0471', bank: '', usd: 6500, rate: 122,
      costs: [], steps: { ...STEPS(), lc: { date: d(4) }, shipped: { expected: d(-8) }, port: { expected: d(-30) } },
    },
    {
      id: 'IMP-014', direction: 'import', ts: t(),
      customs: {
        hsCode: '1507.10.00', port: 'Chattogram port', cnf: '', boeNo: 'C-184532', boeDate: d(4), container: 'MSKU 482915-3', av: 0,
        rates: { cd: 10, rd: 0, sd: 0, vat: 5, ait: 0, at: 0 }, freeUntil: d(1), demurragePerDay: 2400,
        stages: { docs: d(6), boe: d(5), assess: d(4), duty: d(4) },
        docs: { 'Commercial invoice': true, 'Packing list': true, 'Bill of lading or airway bill': true, 'LC copy': true, 'Insurance cover note': true },
      }, supplier: '', country: 'Malaysia', productId: 'crude', productName: 'Crude soyabean oil', qty: 20000, unit: 'litres', lcNo: 'LC-2026-0457', bank: '', usd: 18000, rate: 122,
      costs: [cost(24, 'Sea freight', 110000), cost(24, 'Insurance', 12000), cost(4, 'Customs duty and VAT', 330000), cost(4, 'C&F agent', 25000), cost(3, 'Port charge', 18000), cost(2, 'Transport to warehouse', 22000)],
      steps: { lc: { date: d(33) }, shipped: { date: d(24) }, port: { date: d(5) }, customs: { expected: d(-3) }, warehouse: { expected: d(-4) } },
    },
    {
      id: 'IMP-013', direction: 'import', ts: t(), supplier: '', country: 'India', productId: 'powder', productName: 'Coil powder mix', qty: 5000, unit: 'kg', lcNo: 'LC-2026-0432', bank: '', usd: 4200, rate: 122,
      costs: [cost(50, 'Sea freight', 38000), cost(38, 'Customs duty and VAT', 72600), cost(38, 'C&F agent', 12000), cost(37, 'Port charge', 6000), cost(36, 'Transport to warehouse', 7000)],
      steps: { lc: { date: d(62) }, shipped: { date: d(52) }, port: { date: d(40) }, customs: { date: d(37) }, warehouse: { expected: d(-1) } },
    },
  ]

  db.imports.unshift({
    id: 'EXP-001', direction: 'export', ts: t(), supplier: '', country: 'Nepal', productId: 'pouch', productName: 'Soyabean oil 1 L pouch', qty: 200, unit: 'pouches',
    lcNo: 'SC-2026-014', bank: '', usd: 420, rate: 122, costs: [], steps: { contract: { date: d(2) }, ready: {}, customs: {}, shipped: { expected: d(-9) }, paid: {} },
  })

  db.employees = [
    { id: 'e1', name: 'Shirin Sultana', phone: '', role: 'Accountant', payType: 'salary', salary: 25000, rate: 0, commissionOn: 'sales', joined: d(700) },
    { id: 'e2', name: 'Kamal Hossain', phone: '', role: 'Warehouse keeper', payType: 'salary', salary: 18000, rate: 0, commissionOn: 'sales', joined: d(520) },
    { id: 'e3', name: 'Babul Mia', phone: '', role: 'Driver', payType: 'salary', salary: 15000, rate: 0, commissionOn: 'sales', joined: d(300) },
    { id: 'e4', name: 'Jamal Uddin', phone: '', role: 'Sales officer', payType: 'sales', salary: 0, rate: 2, commissionOn: 'sales', joined: d(410) },
    { id: 'e5', name: 'Rina Akter', phone: '', role: 'Sales officer', payType: 'sales', salary: 0, rate: 2, commissionOn: 'sales', joined: d(200) },
  ]

  const D = (id, name, area, terms, limit, days, salesId) => ({ id, name, owner: '', phone: '', area, address: '', opening: 0, terms, limit, days, salesId })
  db.dealers = [
    D('d1', 'Rahman Traders', 'Agrabad', 'credit', 100000, 30, 'e4'),
    D('d2', 'Bismillah Store', 'Chawkbazar', 'credit', 150000, 15, 'e4'),
    D('d3', 'Notun Bazar Enterprise', 'Hathazari', 'credit', 150000, 30, 'e5'),
    D('d4', 'Al-Amin Distribution', 'Patiya', 'credit', 80000, 30, 'e5'),
    D('d5', 'Madina General Store', 'Halishahar', 'cod', 0, 0, ''),
  ]

  const line = (productId, qty) => {
    const p = db.products.find((x) => x.id === productId)
    return { productId, name: p.name, unit: p.unit, qty, price: p.price, cost: p.cost }
  }
  const INV = (no, dealerId, soldBy, ago, total, received, terms) => {
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

  const EX = (ago, head, details, amount) => ({ id: 'ex' + t(), ts, date: d(ago), head, details, amount, method: 'Cash' })
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

  db.seq = { id: 1000, ts, fo: 1043, inv: 2312, imp: 16, exp: 2, pb: 222 }
  applyBusinessTypes(db, ['food'])
  db.openingCash = 410000 - cashForDay(db, T).opening
  return db
}
