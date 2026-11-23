import { applyBusinessTypes, TRANSPORT_HEAD, WAREHOUSE_PLACE } from './catalog'
import { addStepNotes } from './seedNotes'
import { defaultTrade } from './tradeCatalog'
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
  PartyDetails,
  TradeInfo,
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
  // each bill was counted in by the warehouse
  const checkIn: Record<string, string> = { 'PB-203': '24 drums, seals intact', 'PB-209': 'Cartons counted, 6 jars cracked — supplier replaced them', 'PB-218': 'Tanker weighed at the gate', 'PB-221': '20 drums' }
  for (const p of db.purchases) p.recv = { date: p.date, by: 'Demo Warehouse', note: checkIn[p.id] }
  // entered by the office, waiting for the warehouse to count them in
  db.purchases.push(
    { ...PB('PB-222', 's2', 1, 'crude', 800, 124, 'credit'), pending: true, expected: d(-1), siteId: 'wh2', by: 'Demo Accountant' },
    { ...PB('PB-223', 's3', 0, 'ejar', 300, 45, 'credit'), pending: true, expected: d(0), by: 'Demo Accountant' },
  )
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
      id: 'EXP-001', direction: 'export', ts: t(), supplier: 'Kathmandu Traders Pvt. Ltd.', country: 'Nepal', productId: 'pouch', productName: 'Soyabean oil 1 L pouch', qty: 200, unit: 'pouches',
      lcNo: 'SC-2026-014', bank: '', usd: 420, rate: 122, costs: [], steps: { contract: { date: d(2) }, ready: {}, customs: {}, shipped: { expected: d(-9) }, paid: {} },
    },
    {
      id: 'IMP-015', direction: 'import', ts: t(), supplier: 'Ningbo Huaxin Packaging Co.', country: 'China', productId: '', productName: 'Aerosol cans', qty: 10000, unit: 'pcs', lcNo: 'LC-2026-0471', bank: 'Islami Bank', usd: 6500, rate: 122,
      costs: [], steps: { lc: { date: d(4) }, shipped: { expected: d(-8) }, port: { expected: d(-30) }, customs: {}, warehouse: {} },
    },
    {
      id: 'IMP-014', direction: 'import', ts: t(), supplier: 'Felda Vegetable Oil Sdn Bhd', country: 'Malaysia', productId: 'crude', productName: 'Crude soyabean oil', qty: 20000, unit: 'litres', lcNo: 'LC-2026-0457', bank: 'Dutch-Bangla Bank', usd: 18000, rate: 122,
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
      id: 'IMP-013', direction: 'import', ts: t(), supplier: 'Kolkata Agro Chem Pvt. Ltd.', country: 'India', productId: 'powder', productName: 'Coil powder mix', qty: 5000, unit: 'kg', lcNo: 'LC-2026-0432', bank: 'Sonali Bank', usd: 4200, rate: 122,
      costs: [cost(50, 'Sea freight', 38000), cost(38, 'Customs duty and VAT', 72600), cost(38, 'C&F agent', 12000), cost(37, 'Port charge', 6000), cost(36, 'Transport to warehouse', 7000)],
      steps: { lc: { date: d(62) }, shipped: { date: d(52) }, port: { date: d(40) }, customs: { date: d(37) }, warehouse: { expected: d(-1) } },
    },
  ]

  // import and export terms, transport and LC details for the demo shipments
  const TR = (dir: 'import' | 'export', x: Partial<TradeInfo>): TradeInfo => ({ ...defaultTrade(dir), ...x })
  const ev = (ago: number, place: string, text: string) => ({ id: 'te' + t(), date: d(ago), place, text })
  const ship = (id: string) => db.imports.find((x) => x.id === id)!
  ship('EXP-001').trade = TR('export', {
    mode: 'road', incoterm: 'FCA', payment: 'contract', loadPort: 'Banglabandha land port', dischargePort: 'Kakarbhitta', etd: d(-9), eta: d(-11),
    carrier: 'Nepal Bangla Transport', vessel: 'Dhaka Metro-TA 11-4402', docNo: '', forwarder: 'Himalaya Logistics', cnfAgent: 'Panchagarh C&F House',
    piNo: 'PI-NP-014', invoiceNo: 'CI-2026-031', expNo: 'EXP-0193-2026', incentivePct: 4, sourceTaxPct: 1, packages: 200, grossKg: 230,
  })
  ship('IMP-015').trade = TR('import', {
    mode: 'sea', incoterm: 'CFR', payment: 'lc-sight', loadPort: 'Ningbo', dischargePort: 'Chattogram port', etd: d(-8), eta: d(-30),
    carrier: 'COSCO Shipping', containers: [{ no: '', size: '20', seal: '' }], forwarder: 'Ocean Link Logistics', cnfAgent: 'Rahman C&F Agency',
    piNo: 'HX-PI-2026-118', invoiceNo: '', packages: 400, grossKg: 1800, cbm: 22,
    lc: { amount: 6500, marginPct: 20, issuedOn: d(4), lastShipment: d(-10), expiry: d(-12), issuingBank: 'Islami Bank, Agrabad branch', advisingBank: 'Bank of China, Ningbo' },
    events: [ev(4, 'Dhaka', 'LC opened and sent by SWIFT'), ev(1, 'Ningbo', 'Supplier confirmed goods ready for stuffing')],
  })
  ship('IMP-014').trade = TR('import', {
    mode: 'sea', incoterm: 'FOB', payment: 'lc-usance', usanceDays: 90, loadPort: 'Port Klang', dischargePort: 'Chattogram port', etd: d(24), eta: d(6),
    carrier: 'Maersk Line', vessel: 'Maersk Kalmar', voyage: '247W', docNo: 'MAEU 238814502',
    containers: [{ no: 'MSKU 482915-3', size: '20', seal: 'ML-77120' }, { no: 'MSKU 482916-0', size: '20', seal: 'ML-77121' }],
    freight: 900, forwarder: 'Seacon Freight', cnfAgent: 'Rahman C&F Agency', piNo: 'FELDA-PI-889', invoiceNo: 'FVO-INV-55102', grossKg: 18200, cbm: 40, packages: 2,
    lc: { amount: 18000, marginPct: 10, issuedOn: d(33), lastShipment: d(20), expiry: d(-25), issuingBank: 'Dutch-Bangla Bank, Khatunganj', advisingBank: 'Maybank, Kuala Lumpur' },
    events: [ev(33, 'Dhaka', 'Usance LC opened, 90 days from B/L'), ev(24, 'Port Klang', 'Loaded on Maersk Kalmar 247W, B/L issued'), ev(15, 'Colombo', 'Transhipped to feeder vessel'), ev(6, 'Chattogram outer anchorage', 'Arrived, waiting for berth'), ev(5, 'Chattogram port', 'Berthed, containers landed at CCT')],
  })
  ship('IMP-013').trade = TR('import', {
    mode: 'sea', incoterm: 'CFR', payment: 'cad', loadPort: 'Kolkata', dischargePort: 'Chattogram port', etd: d(52), eta: d(41),
    carrier: 'Sinokor', vessel: 'Sinokor Bangkok', voyage: '031E', docNo: 'SNKO 0198273', containers: [{ no: 'SNKU 120433-8', size: '20', seal: 'SK-4410' }],
    cnfAgent: 'Rahman C&F Agency', piNo: 'KAC-PI-77', invoiceNo: 'KAC-INV-2026-140', grossKg: 5100, packages: 200,
    events: [ev(52, 'Kolkata', 'Sailed'), ev(40, 'Chattogram port', 'Arrived and berthed'), ev(37, 'Chattogram port', 'Released by customs')],
  })
  ship('IMP-014').costs = ship('IMP-014').costs.map((c) => (c.type === 'Port charge' ? { ...c, type: 'Port charges (CPA)' } : c))
  ship('IMP-013').costs = ship('IMP-013').costs.map((c) => (c.type === 'Port charge' ? { ...c, type: 'Port charges (CPA)' } : c))
  ship('IMP-013').customs = { hsCode: '3808.91.00', port: 'Chattogram port', boeNo: 'C-171044', boeDate: d(39), stages: { docs: d(40), boe: d(39), assess: d(38), duty: d(38), exam: d(38), release: d(37) }, docs: {}, rates: { cd: 10, rd: 3, sd: 0, vat: 15, ait: 5, at: 5 } }
  db.imports.push(
    {
      id: 'IMP-012', direction: 'import', ts: t(), supplier: 'Shenzhen Bright Lighting Co.', country: 'China', productId: '', productName: 'LED bulbs 12W', qty: 6000, unit: 'pcs', lcNo: '', bank: 'BRAC Bank', usd: 2400, rate: 121,
      customs: { hsCode: '8539.52.00', port: 'Hazrat Shahjalal Int’l Airport (Dhaka) cargo', cnf: 'Skyline C&F', boeNo: 'C-208811', boeDate: d(70), stages: { docs: d(72), boe: d(70), assess: d(69), exam: d(69), release: d(68) }, docs: {}, rates: { cd: 25, rd: 3, sd: 20, vat: 15, ait: 5, at: 5 } },
      costs: [{ ...cost(75, 'SWIFT and bank charges', 2200), group: 'bank' }, { ...cost(69, 'Airport cargo handling (CAAB)', 9400), group: 'port' }, { ...cost(68, 'C&F agent', 8000), group: 'clearance' }, { ...cost(68, 'Transport to warehouse', 3500), group: 'inland' }],
      steps: { lc: { date: d(78) }, shipped: { date: d(74) }, port: { date: d(72) }, customs: { date: d(68) }, warehouse: { date: d(67) } },
      trade: TR('import', {
        mode: 'air', incoterm: 'CPT', payment: 'tt-advance', loadPort: 'Guangzhou Baiyun Airport', dischargePort: 'Hazrat Shahjalal Int’l Airport (Dhaka) cargo', etd: d(74), eta: d(72),
        carrier: 'China Southern Cargo', vessel: 'CZ 3065', docNo: '784-22918470', cnfAgent: 'Skyline C&F', grossKg: 410, packages: 30, piNo: 'SBL-PI-2026-09', invoiceNo: 'SBL-CI-0912',
        events: [ev(78, 'Dhaka', 'TT sent in advance'), ev(74, 'Guangzhou', 'Flown on CZ 3065'), ev(72, 'Dhaka airport', 'Landed, cargo at the airport shed'), ev(68, 'Dhaka airport', 'Released by customs')],
      }),
    },
    {
      id: 'IMP-011', direction: 'import', ts: t(), supplier: 'Bharat Agro Plastics', country: 'India', productId: '', productName: 'Coil stands (metal)', qty: 40000, unit: 'pcs', lcNo: 'LC-2026-0388', bank: 'Sonali Bank', usd: 3100, rate: 121,
      customs: { hsCode: '7326.20.00', port: 'Benapole land port', cnf: 'Benapole C&F Corp', boeNo: 'B-55120', boeDate: d(96), stages: { docs: d(97), boe: d(96), assess: d(95), exam: d(95), release: d(94) }, docs: {}, rates: { cd: 25, rd: 3, sd: 0, vat: 15, ait: 5, at: 5 } },
      costs: [{ ...cost(110, 'LC opening commission', 1900), group: 'bank' }, { ...cost(97, 'Road freight', 14000), group: 'freight' }, { ...cost(95, 'Land port charges', 6200), group: 'port' }, { ...cost(94, 'C&F agent', 7000), group: 'clearance' }, { ...cost(93, 'Transport to warehouse', 9000), group: 'inland' }],
      steps: { lc: { date: d(110) }, shipped: { date: d(99) }, port: { date: d(97) }, customs: { date: d(94) }, warehouse: { date: d(92) } },
      trade: TR('import', {
        mode: 'road', incoterm: 'FCA', payment: 'lc-sight', loadPort: 'Petrapole land port', dischargePort: 'Benapole land port', etd: d(99), eta: d(97),
        carrier: 'Sarkar Roadlines', vessel: 'WB 23 C 4471', docNo: 'TR-77120', cnfAgent: 'Benapole C&F Corp', grossKg: 7600, packages: 160,
        lc: { amount: 3100, marginPct: 15, issuedOn: d(110), lastShipment: d(95), expiry: d(85), issuingBank: 'Sonali Bank, Motijheel', advisingBank: 'State Bank of India, Kolkata', retiredOn: d(90) },
        events: [ev(99, 'Petrapole', 'Truck crossed into Bangladesh'), ev(97, 'Benapole', 'At land port yard'), ev(94, 'Benapole', 'Released by customs')],
      }),
    },
    {
      id: 'EXP-002', direction: 'export', ts: t(), supplier: 'EuroHome GmbH', country: 'Germany', productId: 'coil', productName: 'Mosquito coil (10-pc box)', qty: 120, unit: 'cartons', lcNo: 'EXLC-DE-2026-07', bank: 'Eastern Bank', usd: 4200, rate: 120,
      costs: [{ ...cost(46, 'Freight forwarder', 9000), group: 'clearance' }, { ...cost(46, 'Transport to port', 12000), group: 'inland' }, { ...cost(45, 'Certificate of origin / EPB', 1500), group: 'clearance' }, { ...cost(44, 'C&F agent', 6000), group: 'clearance' }],
      steps: { contract: { date: d(60) }, ready: { date: d(48) }, customs: { date: d(44) }, shipped: { date: d(42) }, paid: {} },
      customs: { hsCode: '3808.91.00', port: 'Chattogram port', boeNo: 'E-90231', boeDate: d(45), stages: { docs: d(47), boe: d(45), assess: d(45), exam: d(44), release: d(44) }, docs: {}, rates: {} },
      unitCost: 1800,
      trade: TR('export', {
        mode: 'sea', incoterm: 'FOB', payment: 'lc-sight', currency: 'EUR', loadPort: 'Chattogram port', dischargePort: 'Hamburg', etd: d(42), eta: d(8),
        carrier: 'Hapag-Lloyd', vessel: 'Hanover Express', voyage: '112W', docNo: 'HLCU CGP2611720', containers: [{ no: 'HLXU 873210-5', size: '20', seal: 'HL-50918' }],
        forwarder: 'Seacon Freight', cnfAgent: 'Rahman C&F Agency', piNo: 'SB-PI-EU-07', invoiceNo: 'SB-EXP-2026-007', expNo: 'EXP-0188-2026', grossKg: 1450, cbm: 18, packages: 120,
        lc: { amount: 4200, issuedOn: d(62), lastShipment: d(40), expiry: d(25), issuingBank: 'Commerzbank, Hamburg', advisingBank: 'Eastern Bank, Gulshan' },
        incentivePct: 10, sourceTaxPct: 1, realisedFc: 2500, realisedRate: 121.5, realisedOn: d(12),
        events: [ev(60, 'Dhaka', 'Export LC received from Commerzbank'), ev(44, 'Chattogram port', 'Export customs cleared'), ev(42, 'Chattogram port', 'Sailed on Hanover Express via Colombo'), ev(12, 'Dhaka', 'EUR 2,500 received; rest due on document acceptance')],
      }),
    },
  )
  // the air shipment's duty, as customs assessed it: CD, RD and SD stay in cost; VAT, AT and AIT are claimed back
  actions.postDuties(db, { importId: 'IMP-012', date: d(69), method: 'Bank transfer' })
  actions.postDuties(db, { importId: 'IMP-011', date: d(95), method: 'Bank transfer' })

  const E = (id: string, name: string, role: string, payType: Employee['payType'], salary: number, rate: number, ago: number): Employee =>
    ({ id, name, phone: '', role, payType, salary, rate, commissionOn: 'sales', joined: d(ago) })
  db.employees = [
    E('e1', 'Shirin Sultana', 'Accountant', 'salary', 25000, 0, 700),
    E('e2', 'Kamal Hossain', 'Warehouse keeper', 'salary', 18000, 0, 520),
    E('e3', 'Babul Mia', 'Driver', 'salary', 15000, 0, 300),
    E('e4', 'Jamal Uddin', 'Sales officer', 'sales', 0, 2, 410),
    E('e5', 'Rina Akter', 'Sales officer', 'sales', 0, 2, 200),
    // workers: paid by the day, or by contract
    { ...E('w1', 'Abul Kalam', 'Loader', 'daily', 0, 0, 160), kind: 'worker', dailyRate: 650, department: 'Warehouse' },
    { ...E('w2', 'Sumon Mia', 'Packer', 'daily', 0, 0, 90), kind: 'worker', dailyRate: 600, department: 'Packing' },
    { ...E('w3', 'Moni Begum', 'Machine helper', 'daily', 0, 0, 45), kind: 'worker', dailyRate: 550, department: 'Workshop' },
    { ...E('w4', 'Rashed Electric Works', 'Electrician (contract)', 'contract', 0, 0, 25), kind: 'worker', department: 'Maintenance',
      contract: { amount: 48000, start: d(25), end: d(-35), work: 'Godown wiring and lighting' } },
  ]
  Object.assign(db.employees[0], { department: 'Accounts', nid: '1993261845207', emergency: 'Rafiq Sultan, 01711-883301', address: 'House 12, Road 4, Uttara, Dhaka' })
  Object.assign(db.employees[1], { department: 'Warehouse', address: 'Tongi, Gazipur' })
  Object.assign(db.employees[3], { department: 'Sales', salesTarget: 900000, address: 'Mirpur 10, Dhaka' })
  Object.assign(db.employees[4], { department: 'Sales', salesTarget: 600000, address: 'Mohammadpur, Dhaka', extra: [{ label: 'Blood group', value: 'B+' }, { label: 'Motorbike', value: 'Dhaka Metro-HA 31-2297' }] })
  let jh = 0
  for (const e of db.employees) {
    const pay = e.payType === 'sales' ? `${e.rate}% commission` : e.payType === 'daily' ? `${e.dailyRate} a day` : e.payType === 'contract' ? `contract ${e.contract?.amount}` : `${e.salary} a month`
    e.status = 'active'
    e.history = [{ id: 'jh' + ++jh, date: e.joined, kind: 'joined', text: `Joined as ${e.role}${e.department ? `, ${e.department}` : ''} · ${pay}` }]
  }
  db.employees[0].history!.push({ id: 'jh' + ++jh, date: d(340), kind: 'pay', text: 'Pay changed: 22,000 a month → 25,000 a month' }, { id: 'jh' + ++jh, date: d(120), kind: 'note', text: 'Finished VAT return training (NBR online)' })
  db.employees[3].history!.push({ id: 'jh' + ++jh, date: d(200), kind: 'role', text: 'Job changed: Junior sales officer → Sales officer' }, { id: 'jh' + (jh + 1), date: d(60), kind: 'note', text: 'Best sales of the quarter, Dhaka north' })
  // attendance for the workers and the warehouse keeper, the last 40 days (Fridays off)
  db.attendance = []
  let wd = 0
  const jobs: Record<string, [string, number][]> = {
    w1: [['Unloaded factory truck', 0], ['Loaded dealer van', 0], ['Stacked cartons in godown', 0]],
    w2: [['Packed coil boxes', 180], ['Packed oil jars', 140], ['Labelled cartons', 220]],
    w3: [['Ran filling machine', 0], ['Cleaned machine line', 0]],
    e2: [['Received goods, checked challans', 0], ['Stock count', 0]],
  }
  for (let ago = 40; ago >= 0; ago--) {
    const day = d(ago)
    if (new Date(day + 'T00:00:00Z').getUTCDay() === 5) continue
    for (const id of ['w1', 'w2', 'w3', 'e2']) {
      const e = db.employees.find((x) => x.id === id)!
      if (day < e.joined) continue
      const roll = (ago * 7 + id.charCodeAt(1) * 13) % 23
      const status = roll === 0 ? 'absent' : roll === 1 ? 'half' : roll === 2 && id === 'w3' ? 'leave' : 'present'
      const [work, out] = jobs[id][ago % jobs[id].length]
      db.attendance.push({ id: 'wd' + ++wd, date: day, employeeId: id, status, hours: status === 'present' ? 8 : status === 'half' ? 4 : undefined, work: status === 'present' || status === 'half' ? work : '', output: out && status !== 'absent' && status !== 'leave' ? Math.round(out * (status === 'half' ? 0.5 : 1)) : undefined })
    }
  }
  // leave: one waiting for the office, one approved, one declined
  db.leaveQuota = { casual: 10, sick: 14, annual: 20 }
  db.leaveRequests = [
    { id: 'LV-001', employeeId: 'e5', kind: 'casual', from: d(-3), to: d(-4) < d(-3) ? d(-3) : d(-4), reason: 'Cousin’s wedding in Cumilla', status: 'pending', askedAt: d(1) + 'T09:12:00.000Z', askedBy: 'Rina Akter' },
    { id: 'LV-002', employeeId: 'w2', kind: 'sick', from: d(20), to: d(19), reason: 'Fever', status: 'approved', askedAt: d(21) + 'T07:40:00.000Z', askedBy: 'Office', decidedBy: 'Demo Owner', decidedAt: d(21) + 'T10:00:00.000Z', answer: 'Get well soon' },
    { id: 'LV-003', employeeId: 'e4', kind: 'annual', from: d(-10), to: d(-14), reason: 'Family trip to Cox’s Bazar', status: 'declined', askedAt: d(3) + 'T11:00:00.000Z', askedBy: 'Demo Sales', decidedBy: 'Demo Owner', decidedAt: d(2) + 'T15:30:00.000Z', answer: 'Month-end collections that week — please pick the week after' },
  ]
  for (const day of [d(20), d(19)]) {
    db.attendance = (db.attendance || []).filter((x) => !(x.employeeId === 'w2' && x.date === day))
    db.attendance.push({ id: 'wd-lv2-' + day, date: day, employeeId: 'w2', status: 'leave', work: '', note: 'Sick leave · LV-002', leaveId: 'LV-002' })
  }
  // workplaces, where everyone is posted, and two transfers (one done, one coming)
  db.workplaces = [
    { id: 'wp1', name: 'Head office', kind: 'office', region: 'Dhaka', area: 'Motijheel', address: 'Suite 7B, Rahman Chamber, 12 Motijheel C/A, Dhaka 1000', headName: 'Demo Owner', phone: '02-9551234', hours: '9:30am–6pm, Friday off', note: '' },
    { id: 'wp2', name: 'Tongi main godown', kind: 'warehouse', region: 'Dhaka', area: 'Tongi', address: 'Holding 41, Bscic Road, Tongi, Gazipur', headId: 'e2', phone: '01714-220981', hours: '8am–8pm, two shifts', note: 'Trucks unload at gate 2', siteId: 'wh1' },
    { id: 'wp3', name: 'Chattogram depot', kind: 'warehouse', region: 'Chattogram', area: 'Pahartali', address: 'Shed 5, Sagorika Road, Pahartali, Chattogram', headName: 'Nurul Amin', phone: '01818-330417', hours: '8am–7pm', note: 'Mess room for staff from Dhaka', siteId: 'wh2' },
    { id: 'wp4', name: 'Dhaka North sales region', kind: 'region', region: 'Dhaka', area: 'Uttara, Mirpur, Tongi, Gazipur', address: 'Sales desk at head office', headId: 'e4', phone: '', hours: 'Market days Sat–Thu', note: '' },
    { id: 'wp5', name: 'Dhaka South sales region', kind: 'region', region: 'Dhaka', area: 'Jatrabari, Keraniganj, Narayanganj', address: 'Sales desk at head office', headName: '', phone: '', hours: 'Market days Sat–Thu', note: '' },
  ]
  Object.assign(db.workplaces[0], { lat: 23.7330, lng: 90.4172, radius: 150, startTime: '09:30', graceMin: 10 })
  Object.assign(db.workplaces[1], { lat: 23.8913, lng: 90.4023, radius: 250, startTime: '08:00', graceMin: 15 })
  Object.assign(db.workplaces[2], { lat: 22.3587, lng: 91.7832, radius: 250, startTime: '08:00', graceMin: 15 })
  Object.assign(db.workplaces[3], { startTime: '09:30', graceMin: 15 })
  Object.assign(db.workplaces[4], { startTime: '09:30', graceMin: 15 })
  const posts: Record<string, string> = { e1: 'wp1', e2: 'wp2', e3: 'wp2', e4: 'wp5', e5: 'wp4', w1: 'wp2', w2: 'wp2', w3: 'wp2', w4: 'wp3' }
  for (const e of db.employees) if (posts[e.id]) e.placeId = posts[e.id]
  db.staffTransfers = [
    { id: 'ST-001', employeeId: 'e4', from: 'wp5', to: 'wp4', date: d(200), orderNo: 'HR/2026/031', reason: 'Promoted to lead Dhaka North', newRole: 'Sales officer', note: '', by: 'Demo Owner', at: d(206) + 'T10:00:00.000Z' },
    { id: 'ST-003', employeeId: 'e5', from: 'wp4', to: 'wp5', date: d(-14), orderNo: 'HR/2026/117', reason: 'Dhaka South needs a second sales officer', allowance: 2000, note: 'Hand over Dhaka North dealers to Jamal before you go', by: 'Demo Owner', at: d(0) + 'T09:00:00.000Z' },
    { id: 'ST-002', employeeId: 'w1', from: 'wp2', to: 'wp3', date: d(-10), orderNo: 'HR/2026/114', reason: 'Chattogram depot needs a loader for import season', allowance: 3000, note: 'Report to Nurul Amin at 9am; mess room provided', by: 'Demo Owner', at: d(1) + 'T11:30:00.000Z' },
  ]
  db.employees.find((e) => e.id === 'e4')!.history!.push({ id: 'jh-st1', date: d(200), kind: 'transfer', text: 'Transferred from Dhaka South sales region to Dhaka North sales region (order HR/2026/031)' })
  db.employees.find((e) => e.id === 'e5')!.history!.push({ id: 'jh-st3', date: d(-14), kind: 'transfer', text: 'Transferred from Dhaka North sales region to Dhaka South sales region (order HR/2026/117)' })
  db.employees.find((e) => e.id === 'w1')!.history!.push({ id: 'jh-st2', date: d(-10), kind: 'transfer', text: 'Transferred from Tongi main godown to Chattogram depot (order HR/2026/114)' })
  // the godown staff check in from their phones: times, and the odd late or off-site day
  let k = 0
  for (const a of db.attendance || []) {
    if (a.leaveId || (a.status !== 'present' && a.status !== 'half')) continue
    k++
    const lateDay = k % 9 === 0
    const inMin = 7 * 60 + 40 + (k * 7) % 25 + (lateDay ? 35 : 0)
    const outMin = a.status === 'half' ? inMin + 240 : 17 * 60 + (k * 11) % 50
    const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    Object.assign(a, { inAt: hm(inMin), outAt: hm(outMin), source: 'self', lat: 23.8913, lng: 90.4023, distance: k % 13 === 0 ? 1850 : 20 + (k * 17) % 120, hours: Math.round(((outMin - inMin) / 60) * 4) / 4 })
    // today they are still at work: checked in, not out yet
    if (a.date === T) { delete a.outAt; delete a.hours }
  }
  // who reports to whom, and a few written reports in different states
  for (const [id, mgr] of [['e5', 'e4'], ['w1', 'e2'], ['w2', 'e2'], ['w3', 'e2'], ['e3', 'e2'], ['e2', 'e1']]) db.employees.find((e) => e.id === id)!.managerId = mgr
  const at = (ago: number, hm: string) => `${d(ago)}T${hm}:00.000Z`
  db.workReports = [
    { id: 'WR-001', employeeId: 'e4', kind: 'weekly', from: d(13), to: d(7), title: 'Dhaka North: sales and collections, last week', status: 'approved', submittedAt: at(7, '11:20'), version: 1, attachments: [],
      body: 'Visited 14 dealers in Uttara, Mirpur and Tongi.\nSales: Tk 3,10,400 against a weekly target of Tk 2,80,000.\nCollected Tk 2,65,000; Notun Bazar still owes Tk 1,41,927 — promised half by Thursday.\nTwo new dealers interested in the 5 L jar (Mirpur 11 and Abdullahpur).\nNext week: follow up Notun Bazar, take samples to the two new shops.',
      replies: [{ id: 'rr1', at: at(6, '09:05'), by: 'Demo Owner', text: 'Good week. Push Notun Bazar for the full amount before giving new stock.', status: 'approved' }], reviewedBy: 'Demo Owner', reviewedAt: at(6, '09:05') },
    { id: 'WR-002', employeeId: 'e5', kind: 'weekly', from: d(6), to: d(0), title: 'Handover notes before moving to Dhaka South', status: 'submitted', submittedAt: at(0, '08:40'), version: 1, attachments: [],
      body: 'Dealers handed over to Jamal: Al-Amin Distribution (owes Tk 50,000, due next week) and Notun Bazar (see Jamal’s note).\nSales this week: Tk 1,84,000. Collected Tk 1,20,000.\nOpen issue: Al-Amin asked for 30 days credit instead of 15 — needs a decision.', replies: [] },
    { id: 'WR-003', employeeId: 'w1', kind: 'incident', from: d(3), to: d(3), title: '12 cartons damaged at unloading', status: 'changes', submittedAt: at(3, '15:10'), version: 1, attachments: [],
      body: 'While unloading the Shapla truck, a stack fell and 12 cartons of mosquito coil were crushed.',
      replies: [{ id: 'rr2', at: at(2, '10:30'), by: 'Kamal Hossain', byEmployee: 'e2', text: 'Please add the challan number, who was unloading with you, and a photo of the cartons.', status: 'changes' }], reviewedBy: 'Kamal Hossain', reviewedAt: at(2, '10:30') },
    { id: 'WR-004', employeeId: 'e2', kind: 'daily', from: d(1), to: d(1), title: 'Stock count and receiving', status: 'reviewed', submittedAt: at(1, '18:05'), version: 1, attachments: [],
      body: 'Received FO-1041 part delivery (120 jars). Counted coil cartons: system 15, shelf 15. Crude oil tank reading matches the books.',
      replies: [{ id: 'rr3', at: at(0, '09:00'), by: 'Shirin Sultana', byEmployee: 'e1', text: 'Seen, thanks.', status: 'reviewed' }], reviewedBy: 'Shirin Sultana', reviewedAt: at(0, '09:00') },
  ]
  // the electrician got an advance on the contract
  db.payroll.push({ id: 'pr-w4', ts: t(), date: d(12), month: d(12).slice(0, 7), method: 'Cash', lines: [{ employeeId: 'w4', kind: 'contract', amount: 20000 }] })

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
  // where each supplier and factory is, and the papers we keep for them
  const places: Record<string, PartyDetails & { address: string }> = {
    s1: { address: 'Shop 14, Moulvibazar Chemical Market', area: 'Chawkbazar', city: 'Dhaka', district: 'Dhaka', postCode: '1211', country: 'Bangladesh', email: 'easternchem@gmail.com', tradeLicense: 'DSCC-0241187', taxNo: 'BIN 000412398-0101', bank: 'Islami Bank, Moulvibazar branch, A/C 2050 1340 1002 3317' },
    s2: { address: 'Khatunganj Road, 2nd floor, Rahman Market', area: 'Kotwali', city: 'Chattogram', district: 'Chattogram', postCode: '4000', country: 'Bangladesh', altPhone: '031-618422', taxNo: 'BIN 000538712-0203', bank: 'Dutch-Bangla Bank, Khatunganj, A/C 117 110 22891' },
    s3: { address: 'Plot 22, BSCIC Industrial Estate', area: 'Tongi', city: 'Gazipur', district: 'Gazipur', postCode: '1710', country: 'Bangladesh', website: 'www.polyfab.com.bd', bank: 'bKash merchant 01911-760143' },
    f1: { address: 'Holding 7, Dhaka–Chattogram Highway', area: 'Kanchpur', city: 'Narayanganj', district: 'Narayanganj', postCode: '1430', country: 'Bangladesh', email: 'shapla.chem@yahoo.com', tradeLicense: 'NCC-77810', taxNo: 'BIN 001122934-0402', note: 'Minimum run 500 boxes, 10–12 days lead time.' },
    f2: { address: 'Sagorika Road, BSCIC area', area: 'Pahartali', city: 'Chattogram', district: 'Chattogram', postCode: '4219', country: 'Bangladesh', altPhone: '031-751906', taxNo: 'BIN 000874120-0201', bank: 'Sonali Bank, Pahartali, A/C 3318 0100 4471' },
    f3: { address: 'Road 3, Patenga Industrial Zone', area: 'Patenga', city: 'Chattogram', district: 'Chattogram', postCode: '4204', country: 'Bangladesh', email: 'orders@patengapack.com' },
  }
  for (const x of [...db.suppliers, ...db.factories]) if (places[x.id] && !x.address) Object.assign(x, places[x.id])
  db.warehouses = [
    { id: 'wh1', code: 'TNG-01', name: 'Main godown', address: 'Holding 41, Bscic Road', area: 'Tongi', city: 'Gazipur', manager: 'Abdul Karim', phone: '01714-220981', capacity: '9,000 cartons', note: 'Trucks unload 8am–8pm', main: true },
    { id: 'wh2', code: 'CTG-01', name: 'Chattogram depot', address: 'Shed 5, Sagorika Road', area: 'Pahartali', city: 'Chattogram', manager: 'Nurul Amin', phone: '01818-330417', capacity: '3,500 cartons', note: 'Imports from the port come here first' },
    { id: 'wh3', code: 'NGJ-01', name: 'Kanchpur store', address: 'Holding 12, Dhaka–Chattogram Highway', area: 'Kanchpur', city: 'Narayanganj', manager: 'Selim Reza', phone: '01716-552190', capacity: '1,200 cartons', note: 'Next to Shapla Chemicals; their goods are received here' },
  ]
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
  db.seq = { id: 1000, ts, fo: 1043, inv: 2312, imp: 16, exp: 3, pb: 224, est: 104, qt: 104 }
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
  // the Chattogram supplier delivers to the Chattogram depot, and part of it was trucked to the main godown
  const ctg = db.purchases.filter((x) => x.supplierId === 's2').sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const x of ctg) x.siteId = 'wh2'
  const lastCtg = ctg.filter((x) => !x.pending).pop()
  if (lastCtg && lastCtg.date < T) {
    db.stockTransfers = [{ id: 'TR-001', ts: t(), date: lastCtg.date < d(2) ? addDays(lastCtg.date, 1) : T, from: 'wh2', to: 'wh1', lines: [{ productId: lastCtg.productId, qty: Math.round(lastCtg.qty * 0.4) }], note: 'Covered van, Babul', by: 'Demo Owner' }]
  }
  // the Kanchpur factory delivers next door, to the Kanchpur store
  for (const o of db.factoryOrders.filter((x) => x.factoryId === 'f1')) for (const r of o.receipts) r.siteId = 'wh3'
  const ngj = db.factoryOrders.filter((x) => x.factoryId === 'f1').flatMap((o) => o.receipts.map((r) => ({ o, r }))).sort((a, b) => (a.r.date < b.r.date ? 1 : -1))[0]
  if (ngj && ngj.r.date < T) {
    (db.stockTransfers ??= []).push({ id: 'TR-002', ts: t(), date: addDays(ngj.r.date, 1) > T ? T : addDays(ngj.r.date, 1), from: 'wh3', to: 'wh1', lines: [{ productId: ngj.o.productId, qty: Math.round(ngj.r.qty * 0.5) }], note: 'Pickup Dhaka Metro-NA 14-2290, Babul', by: 'Kamal Hossain' })
  }
  addStepNotes(db, 'Demo Owner', 'Kamal Hossain')
  for (const p of db.products) {
    if (p.sources?.includes('factory')) p.factoryIds = [...new Set(db.factoryOrders.filter((o) => o.productId === p.id).map((o) => o.factoryId))]
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
