/**
 * Reference lists for import and export: transport modes, Incoterms, payment terms, ports,
 * cost heads and typical duty rates by HS code. Rates are a starting point; the customs tariff of
 * the year decides, and every shipment can override them.
 */
import type { CostGroup, CustomsProcedure, Db, Direction, DutyKey, Incoterm, TradeInfo, TradePayment, TransportMode } from './types'

export const MODES: Record<TransportMode, { label: string; icon: 'ship' | 'send' | 'truck' | 'route' | 'parcel'; doc: string; carrier: string; vessel: string }> = {
  sea: { label: 'By sea', icon: 'ship', doc: 'Bill of lading (B/L)', carrier: 'Shipping line', vessel: 'Vessel' },
  air: { label: 'By air', icon: 'send', doc: 'Air waybill (AWB)', carrier: 'Airline', vessel: 'Flight' },
  road: { label: 'By road', icon: 'truck', doc: 'Truck receipt / challan', carrier: 'Transporter', vessel: 'Truck no.' },
  rail: { label: 'By rail', icon: 'route', doc: 'Railway receipt', carrier: 'Railway', vessel: 'Wagon / rake' },
  courier: { label: 'Courier', icon: 'parcel', doc: 'Courier tracking no.', carrier: 'Courier', vessel: 'Service' },
}

/** Who pays main freight and insurance under each Incoterm (from the buyer's side). */
export const INCOTERMS: Record<Incoterm, { label: string; freight: 'buyer' | 'seller'; insurance: 'buyer' | 'seller'; risk: string; seaOnly?: boolean }> = {
  EXW: { label: 'Ex Works', freight: 'buyer', insurance: 'buyer', risk: 'Buyer takes the goods at the seller’s door and pays everything after.' },
  FCA: { label: 'Free Carrier', freight: 'buyer', insurance: 'buyer', risk: 'Seller hands over to the buyer’s carrier, export-cleared.' },
  FAS: { label: 'Free Alongside Ship', freight: 'buyer', insurance: 'buyer', risk: 'Seller delivers alongside the vessel at the port of loading.', seaOnly: true },
  FOB: { label: 'Free On Board', freight: 'buyer', insurance: 'buyer', risk: 'Seller loads the goods on the vessel; buyer pays sea freight and insurance.', seaOnly: true },
  CFR: { label: 'Cost and Freight', freight: 'seller', insurance: 'buyer', risk: 'Seller pays freight to the destination port; buyer insures.', seaOnly: true },
  CIF: { label: 'Cost, Insurance and Freight', freight: 'seller', insurance: 'seller', risk: 'Seller pays freight and insurance to the destination port.', seaOnly: true },
  CPT: { label: 'Carriage Paid To', freight: 'seller', insurance: 'buyer', risk: 'Seller pays carriage to the named place; buyer insures.' },
  CIP: { label: 'Carriage and Insurance Paid To', freight: 'seller', insurance: 'seller', risk: 'Seller pays carriage and insurance to the named place.' },
  DAP: { label: 'Delivered At Place', freight: 'seller', insurance: 'seller', risk: 'Seller delivers to the named place; buyer clears import and pays duty.' },
  DPU: { label: 'Delivered at Place Unloaded', freight: 'seller', insurance: 'seller', risk: 'Seller delivers and unloads at the named place.' },
  DDP: { label: 'Delivered Duty Paid', freight: 'seller', insurance: 'seller', risk: 'Seller delivers with import duty and VAT paid.' },
}

export const PAYMENT_TERMS: Record<TradePayment, { label: string; lc: boolean; hint: string }> = {
  'lc-sight': { label: 'LC at sight', lc: true, hint: 'The bank pays as soon as the documents are in order.' },
  'lc-usance': { label: 'Usance (deferred) LC', lc: true, hint: 'The bank pays a set number of days after sight or B/L date.' },
  'tt-advance': { label: 'TT in advance', lc: false, hint: 'Telegraphic transfer before shipment.' },
  'tt-after': { label: 'TT after shipment', lc: false, hint: 'Telegraphic transfer against a copy of the shipping documents.' },
  cad: { label: 'Cash against documents (CAD / DP)', lc: false, hint: 'The bank releases the documents when the buyer pays.' },
  da: { label: 'Documents against acceptance (DA)', lc: false, hint: 'The buyer accepts a bill of exchange and pays on its due date.' },
  contract: { label: 'Sales contract (SC / CC)', lc: false, hint: 'Firm contract between buyer and seller, paid as the contract says.' },
  open: { label: 'Open account', lc: false, hint: 'Goods first, payment later on agreed credit days.' },
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'INR', 'JPY', 'AED', 'SGD', 'MYR', 'THB'] as const

export interface Port { name: string; kind: 'sea' | 'air' | 'land' | 'rail'; country: string }
export const PORTS: Port[] = [
  // Bangladesh
  { name: 'Chattogram port', kind: 'sea', country: 'Bangladesh' },
  { name: 'Mongla port', kind: 'sea', country: 'Bangladesh' },
  { name: 'Pangaon inland container terminal', kind: 'sea', country: 'Bangladesh' },
  { name: 'Kamalapur ICD, Dhaka', kind: 'rail', country: 'Bangladesh' },
  { name: 'Hazrat Shahjalal Int’l Airport (Dhaka) cargo', kind: 'air', country: 'Bangladesh' },
  { name: 'Shah Amanat Int’l Airport (Chattogram) cargo', kind: 'air', country: 'Bangladesh' },
  { name: 'Benapole land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Bhomra land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Burimari land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Sonamasjid land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Hili land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Banglabandha land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Akhaura land port', kind: 'land', country: 'Bangladesh' },
  { name: 'Tamabil land port', kind: 'land', country: 'Bangladesh' },
  // abroad
  { name: 'Shanghai', kind: 'sea', country: 'China' },
  { name: 'Ningbo', kind: 'sea', country: 'China' },
  { name: 'Shenzhen (Yantian)', kind: 'sea', country: 'China' },
  { name: 'Guangzhou (Nansha)', kind: 'sea', country: 'China' },
  { name: 'Port Klang', kind: 'sea', country: 'Malaysia' },
  { name: 'Singapore', kind: 'sea', country: 'Singapore' },
  { name: 'Nhava Sheva (JNPT)', kind: 'sea', country: 'India' },
  { name: 'Kolkata', kind: 'sea', country: 'India' },
  { name: 'Petrapole land port', kind: 'land', country: 'India' },
  { name: 'Phulbari (Siliguri)', kind: 'land', country: 'India' },
  { name: 'Kakarbhitta', kind: 'land', country: 'Nepal' },
  { name: 'Colombo', kind: 'sea', country: 'Sri Lanka' },
  { name: 'Busan', kind: 'sea', country: 'South Korea' },
  // United Arab Emirates
  { name: 'Jebel Ali port (Dubai)', kind: 'sea', country: 'United Arab Emirates' },
  { name: 'Port Rashid (Dubai)', kind: 'sea', country: 'United Arab Emirates' },
  { name: 'Khalifa port (Abu Dhabi)', kind: 'sea', country: 'United Arab Emirates' },
  { name: 'Khalid port (Sharjah)', kind: 'sea', country: 'United Arab Emirates' },
  { name: 'Fujairah port', kind: 'sea', country: 'United Arab Emirates' },
  { name: 'Dubai Int’l Airport (DXB) cargo', kind: 'air', country: 'United Arab Emirates' },
  { name: 'Al Maktoum Int’l Airport (DWC) cargo', kind: 'air', country: 'United Arab Emirates' },
  { name: 'Abu Dhabi Int’l Airport cargo', kind: 'air', country: 'United Arab Emirates' },
  { name: 'Hatta border (to Oman)', kind: 'land', country: 'United Arab Emirates' },
  { name: 'Ghuwaifat border (to Saudi Arabia)', kind: 'land', country: 'United Arab Emirates' },
  { name: 'Al Ain border (Mezyad)', kind: 'land', country: 'United Arab Emirates' },
  // trading partners of the Gulf
  { name: 'Mombasa', kind: 'sea', country: 'Kenya' },
  { name: 'Dar es Salaam', kind: 'sea', country: 'Tanzania' },
  { name: 'Bandar Abbas', kind: 'sea', country: 'Iran' },
  { name: 'Karachi', kind: 'sea', country: 'Pakistan' },
  { name: 'Mundra', kind: 'sea', country: 'India' },
  { name: 'Sohar', kind: 'sea', country: 'Oman' },
  { name: 'Muscat (by road)', kind: 'land', country: 'Oman' },
  { name: 'Dammam', kind: 'sea', country: 'Saudi Arabia' },
  { name: 'Riyadh (by road)', kind: 'land', country: 'Saudi Arabia' },
  { name: 'Umm Qasr', kind: 'sea', country: 'Iraq' },
  { name: 'Hamburg', kind: 'sea', country: 'Germany' },
  { name: 'Rotterdam', kind: 'sea', country: 'Netherlands' },
  { name: 'Los Angeles', kind: 'sea', country: 'USA' },
  { name: 'Guangzhou Baiyun Airport', kind: 'air', country: 'China' },
  { name: 'Hong Kong Airport', kind: 'air', country: 'Hong Kong' },
]
const KIND_FOR: Record<TransportMode, Port['kind'][]> = { sea: ['sea'], air: ['air'], road: ['land'], rail: ['rail', 'land'], courier: ['air'] }
/** Ports that suit a mode: home ports (the company's country) or ports abroad. */
export const portsFor = (mode: TransportMode, home: boolean, homeCountry = 'Bangladesh') => PORTS.filter((p) => KIND_FOR[mode].includes(p.kind) && (p.country === homeCountry) === home)

export const COST_GROUPS: Record<CostGroup, string> = { freight: 'Freight and insurance', bank: 'Bank and LC', port: 'Port and carrier', clearance: 'Customs clearance (C&F)', duty: 'Duty and taxes', inland: 'Inland transport', other: 'Other' }

/** Cost heads, which group they belong to, and the modes and direction they apply to. */
export const COST_HEADS: { name: string; group: CostGroup; modes?: TransportMode[]; dir?: Direction }[] = [
  { name: 'Sea freight', group: 'freight', modes: ['sea'] },
  { name: 'Air freight', group: 'freight', modes: ['air', 'courier'] },
  { name: 'Road freight', group: 'freight', modes: ['road'] },
  { name: 'Rail freight', group: 'freight', modes: ['rail'] },
  { name: 'Insurance', group: 'freight' },
  { name: 'LC opening commission', group: 'bank' },
  { name: 'LC amendment charge', group: 'bank' },
  { name: 'SWIFT and bank charges', group: 'bank' },
  { name: 'Acceptance / usance interest', group: 'bank' },
  { name: 'Export bill collection charge', group: 'bank', dir: 'export' },
  { name: 'Port charges (CPA)', group: 'port', modes: ['sea'] },
  { name: 'Shipping line local charges / DO', group: 'port', modes: ['sea'] },
  { name: 'Container detention', group: 'port', modes: ['sea'] },
  { name: 'Berth operator / handling', group: 'port', modes: ['sea'] },
  { name: 'Airport cargo handling (CAAB)', group: 'port', modes: ['air', 'courier'] },
  { name: 'Airline delivery order', group: 'port', modes: ['air'] },
  { name: 'Land port charges', group: 'port', modes: ['road'] },
  { name: 'Storage / demurrage', group: 'port' },
  { name: 'Scanning charge', group: 'port' },
  { name: 'C&F agent', group: 'clearance' },
  { name: 'Customs examination and labour', group: 'clearance' },
  { name: 'Documentation and stamps', group: 'clearance' },
  { name: 'Freight forwarder', group: 'clearance', dir: 'export' },
  { name: 'Certificate of origin / EPB', group: 'clearance', dir: 'export' },
  { name: 'Fumigation / phytosanitary', group: 'clearance' },
  { name: 'Pre-shipment inspection', group: 'clearance', dir: 'export' },
  { name: 'Transport to warehouse', group: 'inland', dir: 'import' },
  { name: 'Transport to port', group: 'inland', dir: 'export' },
  { name: 'Loading and unloading labour', group: 'inland' },
  { name: 'Customs duty and VAT', group: 'duty' },
  { name: 'Customs deposit (refundable)', group: 'duty' },
  { name: 'Free zone handling / DP World charges', group: 'port', modes: ['sea'] },
  { name: 'Free zone exit / entry certificate', group: 'clearance' },
  { name: 'Mirsal / customs declaration fee', group: 'clearance' },
  { name: 'Dubai Chamber certificate of origin', group: 'clearance', dir: 'export' },
  { name: 'Attestation (consulate / MOFA)', group: 'clearance' },
  { name: 'Other', group: 'other' },
]
export const groupOf = (type: string): CostGroup => {
  const h = COST_HEADS.find((x) => x.name === type)
  if (h) return h.group
  if (/duty|vat|tax|ait|\(cd\)|\(rd\)|\(sd\)/i.test(type)) return 'duty'
  if (/freight|insurance/i.test(type)) return 'freight'
  if (/bank|lc /i.test(type)) return 'bank'
  if (/port|demurrage|detention/i.test(type)) return 'port'
  if (/c&f|clear/i.test(type)) return 'clearance'
  if (/transport/i.test(type)) return 'inland'
  return 'other'
}
export const costHeadsFor = (mode: TransportMode, dir: Direction) => COST_HEADS.filter((h) => (!h.modes || h.modes.includes(mode)) && (!h.dir || h.dir === dir))

/** Typical Bangladesh rates (percent) by HS heading — a starting point to check against the tariff. */
export interface HsPreset { code: string; name: string; rates: Partial<Record<DutyKey, number>> }
const R = (cd: number, rd: number, sd: number, vat = 15, ait = 5, at = 5): Partial<Record<DutyKey, number>> => ({ cd, rd, sd, vat, ait, at })
export const HS_PRESETS: HsPreset[] = [
  { code: '1507.10.00', name: 'Crude soyabean oil', rates: R(0, 0, 0, 15, 2, 5) },
  { code: '1511.10.00', name: 'Crude palm oil', rates: R(0, 0, 0, 15, 2, 5) },
  { code: '3808.91.00', name: 'Insecticides, mosquito coil materials', rates: R(10, 3, 0) },
  { code: '3907.61.00', name: 'PET resin', rates: R(10, 3, 0) },
  { code: '7310.29.00', name: 'Aerosol cans, tin containers', rates: R(25, 3, 0) },
  { code: '8479.89.00', name: 'Industrial machinery', rates: R(1, 0, 0, 15, 5, 0) },
  { code: '8517.13.00', name: 'Smartphones', rates: R(25, 3, 0) },
  { code: '8539.52.00', name: 'LED lamps', rates: R(25, 3, 20) },
  { code: '5201.00.00', name: 'Raw cotton', rates: R(0, 0, 0, 0, 0, 0) },
  { code: '5208.52.00', name: 'Printed cotton fabric', rates: R(25, 3, 20) },
  { code: '2941.90.00', name: 'Medicine raw material (API)', rates: R(5, 0, 0) },
  { code: '9503.00.00', name: 'Toys', rates: R(25, 3, 45) },
  { code: '8703.23.00', name: 'Cars 1500–2000 cc', rates: R(25, 3, 200) },
]

/** Papers a shipment usually needs, by direction and mode, on top of the customs list. */
export function tradeDocs(dir: Direction, t: Pick<TradeInfo, 'mode' | 'payment'>, bd = true): string[] {
  const transport = MODES[t.mode].doc
  const lc = PAYMENT_TERMS[t.payment]?.lc
  if (dir === 'export') return ['Commercial invoice', 'Packing list', transport, ...(bd ? ['EXP form', 'Certificate of origin', 'Shipping bill (Bill of Export)'] : []), ...(lc ? ['Export LC copy', 'Bill of exchange'] : []), ...(bd && t.mode === 'road' ? ['Land port export permit'] : [])]
  return ['Proforma invoice', 'Commercial invoice', 'Packing list', transport, ...(lc ? ['LC copy', ...(bd ? ['LCA form'] : [])] : bd ? ['IMP form'] : []), 'Insurance cover note', 'Certificate of origin', ...(bd && t.mode === 'road' ? ['Land port entry'] : []), ...(t.mode === 'air' ? ['Airline delivery order'] : [])]
}

export const defaultTrade = (dir: Direction): TradeInfo => ({
  mode: 'sea', incoterm: dir === 'export' ? 'FOB' : 'CFR', payment: 'lc-sight', currency: 'USD', loadPort: dir === 'export' ? 'Chattogram port' : '', dischargePort: dir === 'export' ? '' : 'Chattogram port',
  carrier: '', vessel: '', voyage: '', docNo: '', containers: [], forwarder: '', cnfAgent: '', piNo: '', invoiceNo: '', claimTax: true, events: [],
  sourceTaxPct: dir === 'export' ? 1 : undefined,
})

/* ---------------------------------------------------------------- customs regimes by country */

export type RegimeCode = 'BD' | 'GCC' | 'GEN'
export interface Regime {
  code: RegimeCode
  label: string
  /** The country whose ports are "home". */
  country: string
  /** Duties this regime charges, in the order they are worked out. */
  duties: readonly (readonly [DutyKey, string])[]
  /** Landing charge on CIF (Bangladesh 1%). */
  landingPct: number
  /** Insurance customs assumes when not known, % of cost and freight (Bangladesh 1%). */
  insurancePct: number
  /** Taxes a registered importer claims back. */
  recoverable: DutyKey[]
  /** Export money must arrive within this many days (Bangladesh Bank: 120). */
  proceedsDays: number | null
  /** Export cash incentive and bank source tax apply. */
  exportIncentive: boolean
  /** Free zone, re-export and transit procedures are offered. */
  procedures: boolean
  /** Customs papers for a bill of entry or export declaration. */
  entryName: string
  exportName: string
}

export const REGIMES: Record<RegimeCode, Regime> = {
  BD: {
    code: 'BD', label: 'Bangladesh customs', country: 'Bangladesh',
    duties: [['cd', 'Customs duty (CD)'], ['rd', 'Regulatory duty (RD)'], ['sd', 'Supplementary duty (SD)'], ['vat', 'VAT'], ['ait', 'Advance income tax (AIT)'], ['at', 'Advance tax (AT)']],
    landingPct: 1, insurancePct: 1, recoverable: ['vat', 'at', 'ait'], proceedsDays: 120, exportIncentive: true, procedures: false, entryName: 'Bill of Entry', exportName: 'Bill of Export',
  },
  GCC: {
    code: 'GCC', label: 'UAE / GCC customs', country: 'United Arab Emirates',
    duties: [['cd', 'Customs duty'], ['excise', 'Excise tax'], ['vat', 'Import VAT']],
    landingPct: 0, insurancePct: 0, recoverable: ['vat'], proceedsDays: null, exportIncentive: false, procedures: true, entryName: 'Import declaration (Mirsal)', exportName: 'Export / exit declaration',
  },
  GEN: {
    code: 'GEN', label: 'Customs duty and VAT/GST', country: '',
    duties: [['cd', 'Customs duty'], ['excise', 'Excise'], ['vat', 'Import VAT / GST']],
    landingPct: 0, insurancePct: 0, recoverable: ['vat'], proceedsDays: null, exportIncentive: false, procedures: true, entryName: 'Import declaration', exportName: 'Export declaration',
  },
}
const COUNTRY_NAME: Record<string, string> = { BD: 'Bangladesh', AE: 'United Arab Emirates', SA: 'Saudi Arabia', CN: 'China', IN: 'India', US: 'USA', PK: 'Pakistan', GB: 'United Kingdom', MY: 'Malaysia' }
/** The customs method for the company's country (Bangladesh when not set). */
export function regimeOf(db: Pick<Db, 'company'>): Regime {
  const code = db.company?.tax?.country || 'BD'
  if (code === 'BD') return REGIMES.BD
  if (code === 'AE' || code === 'SA') return { ...REGIMES.GCC, country: COUNTRY_NAME[code] }
  return { ...REGIMES.GEN, country: COUNTRY_NAME[code] || '' }
}

export const PROCEDURES: Record<CustomsProcedure, { label: string; hint: string }> = {
  home: { label: 'For the local market', hint: 'Duty and VAT are paid at entry.' },
  freezone: { label: 'Into a free zone', hint: 'Duty and VAT are suspended while the goods stay in the free zone (JAFZA, DMCC, SAIF…).' },
  reexport: { label: 'For re-export', hint: 'Duty is held as a refundable deposit and returned when the goods leave the country.' },
  transit: { label: 'In transit', hint: 'Passing through under a transit document; no duty while sealed.' },
}
export const FREE_ZONES = ['JAFZA (Jebel Ali Free Zone)', 'DMCC (Dubai Multi Commodities Centre)', 'Dubai Airport Free Zone (DAFZA)', 'Dubai South (Logistics District)', 'SAIF Zone (Sharjah)', 'Hamriyah Free Zone', 'KIZAD (Abu Dhabi)', 'RAK Free Trade Zone']

const G = (cd: number, vat = 5, excise = 0): Partial<Record<DutyKey, number>> => ({ cd, vat, ...(excise ? { excise } : {}) })
/** Typical GCC rates (common external tariff 5%) — check the tariff and excise list of the year. */
export const GCC_HS_PRESETS: HsPreset[] = [
  { code: '8517.13.00', name: 'Smartphones', rates: G(5) },
  { code: '8471.30.00', name: 'Laptops', rates: G(5) },
  { code: '8703.23.00', name: 'Cars', rates: G(5) },
  { code: '8708.99.00', name: 'Auto spare parts', rates: G(5) },
  { code: '6109.10.00', name: 'Cotton garments', rates: G(5) },
  { code: '1006.30.00', name: 'Rice', rates: G(0) },
  { code: '0402.21.00', name: 'Milk powder', rates: G(0) },
  { code: '3004.90.00', name: 'Medicines', rates: G(0, 0) },
  { code: '7108.13.00', name: 'Gold (semi-manufactured)', rates: G(0, 0) },
  { code: '2202.10.00', name: 'Sweetened drinks', rates: G(5, 5, 50) },
  { code: '2202.99.00', name: 'Energy drinks', rates: G(5, 5, 100) },
  { code: '2402.20.00', name: 'Cigarettes', rates: G(100, 5, 100) },
  { code: '7208.51.00', name: 'Steel plates', rates: G(5) },
  { code: '3926.90.00', name: 'Plastic articles', rates: G(5) },
]
/** HS presets for the regime. */
export const presetsFor = (r: Regime): HsPreset[] => (r.code === 'BD' ? HS_PRESETS : GCC_HS_PRESETS)

/** Customs papers by regime, on top of the transport papers. */
export function regimeDocs(r: Regime, dir: Direction, t: Pick<TradeInfo, 'procedure'>): string[] {
  if (r.code !== 'GCC') return []
  if (dir === 'export') return ['Export / exit declaration', 'Dubai Chamber certificate of origin', ...(t.procedure === 'reexport' || t.procedure === 'freezone' ? ['Free zone exit certificate'] : [])]
  return ['Import declaration (Mirsal)', 'Delivery order from the shipping line', ...(t.procedure === 'freezone' ? ['Free zone entry certificate'] : []), ...(t.procedure === 'reexport' ? ['Customs deposit receipt'] : []), ...(t.procedure === 'transit' ? ['Transit document'] : [])]
}
