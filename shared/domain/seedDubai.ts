/**
 * A Dubai general trading company for the demo: UAE customs (5% duty, 5% VAT), a JAFZA free zone
 * warehouse, re-exports to East Africa and Oman, and an air import for the local market.
 * Dated relative to today, like the main demo.
 */
import { actions } from './actions'
import { addDays, todayISO } from './format'
import { emptyDb } from './seed'
import { addStepNotes } from './seedNotes'
import { defaultTrade } from './tradeCatalog'
import type { Db, Product, Shipment, ShipmentCost, TradeInfo } from './types'

export function demoDubaiDb(): Db {
  const T = todayISO()
  const d = (n: number) => addDays(T, -n)
  let ts = 0
  const t = () => ++ts
  const db = emptyDb()
  db.company = { ...db.company, name: 'Al Noor General Trading LLC', tagline: 'Electronics, auto parts and foodstuff — Deira, Dubai', phone: '+971 4 223 9810', address: 'Office 1204, Al Ghurair Centre, Deira, Dubai, UAE' }
  actions.setCountry(db, { country: 'AE', replaceRates: true, note: 'Demo company in Dubai', by: 'Demo' })
  actions.saveTaxSettings(db, { taxNo: '100398521700003', salesDefault: db.company.tax?.salesDefault || [], pricesIncludeTax: false })
  db.openingCash = 850000
  db.categories = [{ id: 'c1', name: 'Electronics', parentId: null }, { id: 'c2', name: 'Auto parts', parentId: null }, { id: 'c3', name: 'Foodstuff', parentId: null }]
  const P = (id: string, name: string, code: string, categoryId: string, unit: string, cost: number, price: number, stock: number): Product =>
    ({ id, name, code, categoryId, kind: 'finished', unit, pack: '', cost, price, stock, lowAt: 0, sources: ['import'] })
  db.products = [
    P('phone', 'Smartphone 128 GB', 'SP-128', 'c1', 'pcs', 0, 1150, 0),
    P('laptop', 'Laptop 14 inch', 'LT-14', 'c1', 'pcs', 0, 2600, 0),
    P('brake', 'Brake pad set', 'BP-SET', 'c2', 'sets', 0, 95, 0),
    P('rice', 'Basmati rice 25 kg', 'BR-25', 'c3', 'bags', 0, 138, 0),
  ]
  db.warehouses = [
    { id: 'wh1', code: 'JAFZA-14', name: 'JAFZA warehouse LOB-14', address: 'Plot S30210, Jebel Ali Free Zone South', area: 'Jebel Ali', city: 'Dubai', manager: 'Rakesh Menon', phone: '+971 50 418 2290', capacity: '1,800 pallets', note: 'Free zone: goods here are duty-suspended', main: true },
    { id: 'wh2', code: 'ALQ-07', name: 'Al Quoz showroom store', address: 'Warehouse 7, Al Quoz Industrial 3', area: 'Al Quoz', city: 'Dubai', manager: 'Imran Qureshi', phone: '+971 55 301 7745', capacity: '300 pallets', note: 'Duty-paid stock for the local market' },
  ]

  // a local supplier: one bill counted in, one waiting for the warehouse
  db.suppliers = [{ id: 's1', name: 'Gulf Auto Spares Trading LLC', contact: 'Faisal Rahman', phone: '+971 4 266 1930', address: 'Shop 14, Al Awir Auto Market', city: 'Dubai', country: 'UAE', goods: 'Brake pads, filters', terms: 'credit', days: 30, opening: 0 }]
  db.purchases = [
    { id: 'pur1', billNo: 'GAS-5521', ts: t(), supplierId: 's1', date: d(20), productId: 'brake', qty: 200, rate: 52, terms: 'credit', siteId: 'wh2', recv: { date: d(19), by: 'Imran Qureshi', note: '10 cartons of 20 sets' } },
    { id: 'pur2', billNo: 'GAS-5604', ts: t(), supplierId: 's1', date: d(1), productId: 'brake', qty: 150, rate: 52, terms: 'credit', pending: true, expected: d(-1), siteId: 'wh2', by: 'Dubai Owner' },
  ]

  const R = 3.6725 // AED per USD (pegged)
  const cost = (ago: number, type: string, amount: number, group: ShipmentCost['group']): ShipmentCost => ({ id: 'ic' + t(), ts, date: d(ago), type, amount, method: 'Bank transfer', group })
  const ev = (ago: number, place: string, text: string) => ({ id: 'te' + t(), date: d(ago), place, text })
  const TR = (dir: 'import' | 'export', x: Partial<TradeInfo>): TradeInfo => ({ ...defaultTrade(dir), claimTax: true, sourceTaxPct: undefined, ...x })
  const S = (x: Omit<Shipment, 'ts'>): Shipment => ({ ...x, ts: t() })

  db.imports = [
    S({
      id: 'IMP-001', direction: 'import', supplier: 'Shenzhen Hexin Mobile Co.', country: 'China', productId: 'phone', productName: 'Smartphone 128 GB', qty: 2000, unit: 'pcs',
      lcNo: 'TT-2026-0912', bank: 'Emirates NBD', usd: 260000, rate: R,
      customs: { hsCode: '8517.13.00', port: 'Jebel Ali port (Dubai)', cnf: 'Gulf Gate Clearing', boeNo: '201-08841272-26', boeDate: d(40), stages: { docs: d(42), boe: d(40), assess: d(40), release: d(39) }, docs: {}, rates: { cd: 5, vat: 5 } },
      costs: [cost(47, 'SWIFT and bank charges', 420, 'bank'), cost(40, 'Free zone handling / DP World charges', 3850, 'port'), cost(40, 'Mirsal / customs declaration fee', 120, 'clearance'), cost(39, 'Free zone exit / entry certificate', 250, 'clearance'), cost(39, 'Transport to warehouse', 900, 'inland')],
      steps: { lc: { date: d(62) }, shipped: { date: d(56) }, port: { date: d(41) }, customs: { date: d(39) }, warehouse: { date: d(38) } },
      siteId: 'wh1',
      trade: TR('import', {
        mode: 'sea', incoterm: 'CIF', payment: 'tt-after', loadPort: 'Shenzhen (Yantian)', dischargePort: 'Jebel Ali port (Dubai)', etd: d(56), eta: d(41),
        carrier: 'COSCO Shipping', vessel: 'COSCO Pride', voyage: '082W', docNo: 'COSU 6377120090', containers: [{ no: 'CSNU 718203-1', size: '40HC', seal: 'CS-901122' }],
        cnfAgent: 'Gulf Gate Clearing', procedure: 'freezone', freeZone: 'JAFZA (Jebel Ali Free Zone)', piNo: 'HX-PI-26-118', invoiceNo: 'HX-CI-26-0907', grossKg: 1540, cbm: 61, packages: 200,
        events: [ev(56, 'Yantian', 'Loaded on COSCO Pride 082W'), ev(41, 'Jebel Ali', 'Discharged at Terminal 3'), ev(39, 'Jebel Ali', 'Moved into JAFZA under free zone entry — duty suspended')],
      }),
    }),
    S({
      id: 'IMP-002', direction: 'import', supplier: 'Asia Pacific Computer Ltd', country: 'Hong Kong', productId: 'laptop', productName: 'Laptop 14 inch', qty: 300, unit: 'pcs',
      lcNo: '', bank: 'Mashreq Bank', usd: 165000, rate: R,
      customs: { hsCode: '8471.30.00', port: 'Dubai Int’l Airport (DXB) cargo', cnf: 'Skyway Clearing', boeNo: '101-22917730-26', boeDate: d(19), stages: { docs: d(20), boe: d(19), assess: d(19), exam: d(19), release: d(18) }, docs: {}, rates: { cd: 5, vat: 5 } },
      costs: [cost(24, 'SWIFT and bank charges', 380, 'bank'), cost(21, 'Air freight', 14600, 'freight'), cost(20, 'Insurance', 1820, 'freight'), cost(19, 'Airport cargo handling (CAAB)', 2100, 'port'), cost(18, 'C&F agent', 1500, 'clearance'), cost(18, 'Transport to warehouse', 650, 'inland')],
      steps: { lc: { date: d(24) }, shipped: { date: d(21) }, port: { date: d(20) }, customs: { date: d(18) }, warehouse: { date: d(17) } },
      siteId: 'wh2',
      trade: TR('import', {
        mode: 'air', incoterm: 'FCA', payment: 'tt-advance', loadPort: 'Hong Kong Airport', dischargePort: 'Dubai Int’l Airport (DXB) cargo', etd: d(21), eta: d(20),
        carrier: 'Emirates SkyCargo', vessel: 'EK 9381', docNo: '176-55210943', cnfAgent: 'Skyway Clearing', procedure: 'home', grossKg: 1260, packages: 60, piNo: 'APC-PI-4410', invoiceNo: 'APC-INV-4410',
        events: [ev(24, 'Dubai', 'TT sent in advance'), ev(21, 'Hong Kong', 'Flown on EK 9381'), ev(18, 'DXB', 'Duty and VAT paid, released')],
      }),
    }),
    S({
      id: 'IMP-003', direction: 'import', supplier: 'Punjab Grains Exports Pvt Ltd', country: 'India', productId: 'rice', productName: 'Basmati rice 25 kg', qty: 4000, unit: 'bags',
      lcNo: 'LC-ENBD-26-3381', bank: 'Emirates NBD', usd: 92000, rate: R,
      customs: { hsCode: '1006.30.00', port: 'Jebel Ali port (Dubai)', cnf: 'Gulf Gate Clearing', stages: {}, docs: {}, rates: { cd: 0, vat: 5 } },
      costs: [cost(20, 'LC opening commission', 1690, 'bank')],
      steps: { lc: { date: d(20) }, shipped: { date: d(9) }, port: { expected: d(-2) }, customs: {}, warehouse: {} },
      trade: TR('import', {
        mode: 'sea', incoterm: 'CFR', payment: 'lc-usance', usanceDays: 60, loadPort: 'Mundra', dischargePort: 'Jebel Ali port (Dubai)', etd: d(9), eta: d(-2),
        carrier: 'MSC', vessel: 'MSC Aditi', voyage: 'IS614A', docNo: 'MEDU IN091272', containers: [{ no: 'MSCU 551023-9', size: '20', seal: 'M-77810' }, { no: 'MSCU 551024-4', size: '20', seal: 'M-77811' }, { no: 'MSCU 551025-0', size: '20', seal: 'M-77812' }, { no: 'MSCU 551026-5', size: '20', seal: 'M-77813' }],
        cnfAgent: 'Gulf Gate Clearing', procedure: 'home', grossKg: 101000, packages: 4000,
        lc: { amount: 92000, issuedOn: d(20), lastShipment: d(5), expiry: d(-10), issuingBank: 'Emirates NBD, Deira', advisingBank: 'State Bank of India, Ahmedabad' },
        events: [ev(20, 'Dubai', '60-day usance LC opened'), ev(9, 'Mundra', 'Sailed on MSC Aditi IS614A')],
      }),
    }),
    S({
      id: 'IMP-004', direction: 'import', supplier: 'Nagoya Auto Parts Co.', country: 'Japan', productId: 'brake', productName: 'Brake pad set', qty: 3000, unit: 'sets',
      lcNo: '', bank: 'Emirates NBD', usd: 54000, rate: R,
      customs: { hsCode: '8708.30.00', port: 'Jebel Ali port (Dubai)', cnf: 'Gulf Gate Clearing', boeNo: '201-08903318-26', boeDate: d(30), stages: { docs: d(31), boe: d(30), assess: d(30), release: d(29) }, docs: {}, rates: { cd: 5, vat: 5 } },
      costs: [cost(30, 'Port charges (CPA)', 1450, 'port'), cost(29, 'C&F agent', 900, 'clearance')],
      steps: { lc: { date: d(52) }, shipped: { date: d(45) }, port: { date: d(31) }, customs: { date: d(29) }, warehouse: { date: d(28) } },
      siteId: 'wh2',
      trade: TR('import', {
        mode: 'sea', incoterm: 'CIF', payment: 'tt-after', loadPort: 'Busan', dischargePort: 'Jebel Ali port (Dubai)', etd: d(45), eta: d(31),
        carrier: 'ONE (Ocean Network Express)', vessel: 'ONE Harmony', voyage: '051W', docNo: 'ONEY NGOB41028800', containers: [{ no: 'ONEU 239901-7', size: '20', seal: 'ON-33017' }],
        cnfAgent: 'Gulf Gate Clearing', procedure: 'reexport', grossKg: 9200, packages: 300,
        events: [ev(45, 'Busan', 'Sailed'), ev(31, 'Jebel Ali', 'Arrived'), ev(29, 'Jebel Ali', 'Entered for re-export; duty paid as a deposit')],
      }),
    }),
    S({
      id: 'EXP-001', direction: 'export', supplier: 'Nairobi Mobile Distributors Ltd', country: 'Kenya', productId: '', productName: 'Smartphone 128 GB (re-export)', qty: 1200, unit: 'pcs',
      lcNo: 'KCB-LC-26-0071', bank: 'Emirates NBD', usd: 186000, rate: R,
      customs: { hsCode: '8517.13.00', port: 'Jebel Ali port (Dubai)', boeNo: '303-11048822-26', boeDate: d(16), stages: { docs: d(17), boe: d(16), release: d(15) }, docs: {}, rates: {} },
      costs: [cost(16, 'Free zone exit / entry certificate', 250, 'clearance'), cost(16, 'Dubai Chamber certificate of origin', 180, 'clearance'), cost(15, 'Sea freight', 2900, 'freight'), cost(15, 'Freight forwarder', 600, 'clearance')],
      steps: { contract: { date: d(25) }, ready: { date: d(17) }, customs: { date: d(15) }, shipped: { date: d(14) }, paid: {} },
      trade: TR('export', {
        mode: 'sea', incoterm: 'CFR', payment: 'lc-sight', loadPort: 'Jebel Ali port (Dubai)', dischargePort: 'Mombasa', etd: d(14), eta: d(-4),
        carrier: 'Maersk Line', vessel: 'Maersk Gironde', voyage: '613S', docNo: 'MAEU 241887610', containers: [{ no: 'MRKU 902241-6', size: '40', seal: 'ML-50512' }],
        forwarder: 'Al Futtaim Logistics', procedure: 'reexport', freeZone: 'JAFZA (Jebel Ali Free Zone)', sourceImportId: 'IMP-001', piNo: 'ANT-PI-26-040', invoiceNo: 'ANT-EXP-26-0071',
        lc: { amount: 186000, issuedOn: d(25), lastShipment: d(10), expiry: d(-20), issuingBank: 'KCB Bank, Nairobi', advisingBank: 'Emirates NBD, Deira' },
        realisedFc: 93000, realisedRate: R, realisedOn: d(5), grossKg: 920, cbm: 38, packages: 120,
        events: [ev(25, 'Dubai', 'Export LC received from KCB Bank'), ev(15, 'JAFZA', 'Free zone exit certificate issued'), ev(14, 'Jebel Ali', 'Sailed on Maersk Gironde'), ev(5, 'Dubai', 'First 50% received against documents')],
      }),
    }),
    S({
      id: 'EXP-002', direction: 'export', supplier: 'Muscat Auto Spares LLC', country: 'Oman', productId: '', productName: 'Brake pad set (re-export)', qty: 1000, unit: 'sets',
      lcNo: 'SC-OM-26-019', bank: 'Emirates NBD', usd: 26500, rate: R,
      customs: { hsCode: '8708.30.00', port: 'Hatta border (to Oman)', stages: { docs: d(1) }, docs: {}, rates: {} },
      costs: [cost(1, 'Transport to port', 1400, 'inland')],
      steps: { contract: { date: d(6) }, ready: { date: d(1) }, customs: { expected: d(-1) }, shipped: { expected: d(-1) }, paid: {} },
      trade: TR('export', {
        mode: 'road', incoterm: 'DAP', payment: 'contract', loadPort: 'Hatta border (to Oman)', dischargePort: 'Muscat (by road)', etd: d(-1), eta: d(-2),
        carrier: 'Gulf Star Transport', vessel: 'Dubai T 48291', procedure: 'reexport', sourceImportId: 'IMP-004', packages: 100, grossKg: 3100,
        events: [ev(6, 'Dubai', 'Sales contract signed'), ev(1, 'Al Quoz', 'Goods packed and loaded')],
      }),
    }),
  ]
  db.seq = { ...db.seq, id: 2000, ts, imp: 5, exp: 3 }
  // goods in stock from the received imports
  const stockOf: Record<string, number> = { phone: 800, laptop: 300, brake: 3200 }
  for (const p of db.products) p.stock = stockOf[p.id] || 0
  // customs as assessed: laptops pay 5% + VAT; brake pads entered for re-export pay a refundable deposit
  actions.postDuties(db, { importId: 'IMP-002', date: d(19), method: 'Bank transfer' })
  actions.postDuties(db, { importId: 'IMP-004', date: d(30), method: 'Bank transfer' })
  // cost per unit from what each import landed at
  for (const s of db.imports.filter((x) => x.direction === 'import' && x.steps.warehouse?.date)) {
    const p = db.products.find((x) => x.id === s.productId)
    const extra = s.costs.filter((c) => !c.recoverable).reduce((a, c) => a + c.amount, 0)
    if (p) p.cost = Math.round(((s.usd * s.rate + extra) / s.qty) * 100) / 100
  }
  addStepNotes(db, 'Demo Owner', 'Rakesh Menon')
  return { ...db }
}
