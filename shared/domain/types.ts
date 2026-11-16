/**
 * The books of one company. Everything the app stores lives in a single `Db` document so it can be
 * saved, synced and backed up as one unit. Shared by the browser and the server.
 */

/** Calendar date as `YYYY-MM-DD`. */
export type ISODate = string
/** Calendar month as `YYYY-MM`. */
export type MonthKey = string

export type Tone = 'good' | 'warn' | 'info' | 'neutral' | 'muted'

/* ---------- access ---------- */
export type PageId =
  | 'dashboard'
  | 'factory-orders'
  | 'raw-materials'
  | 'sales-analytics'
  | 'transport'
  | 'suppliers'
  | 'imports'
  | 'customs'
  | 'products'
  | 'sell'
  | 'dealers'
  | 'cashbook'
  | 'employees'
  | 'reports'
  | 'settings'
export type AccessLevel = 'none' | 'view' | 'edit'
export type Permissions = Partial<Record<PageId, AccessLevel>>

export interface Role {
  id: string
  name: string
  /** System roles (Owner) always have full access and cannot be edited or removed. */
  system?: boolean
  perms: Permissions
}

export interface User {
  id: string
  name: string
  email: string
  roleId: string
  employeeId: string
}

export interface Company {
  name: string
  tagline: string
  phone: string
  address: string
  invoicePrefix: string
  invoiceNote: string
  /** Image URL or data URL. Empty when the company has no logo. */
  logo: string
  /** Monthly sales target in Taka; missing or 0 means none set. */
  salesTarget?: number
}

/* ---------- custom fields ---------- */
export type CustomEntity = 'product' | 'supplier' | 'dealer' | 'shipment' | 'factoryOrder'
export type FieldType = 'text' | 'number' | 'date' | 'select'
export type BusinessTypeId = 'general' | 'food' | 'machinery' | 'electronics' | 'toys' | 'medical'

export interface FieldDef {
  id: string
  entity: CustomEntity
  label: string
  type: FieldType
  options: string[]
}
/** Values of custom fields, keyed by `FieldDef.id`. */
export type CustomValues = Record<string, string>

/* ---------- stock ---------- */
export interface Category {
  id: string
  name: string
  parentId: string | null
}

export type ProductKind = 'finished' | 'raw' | 'packaging'
/** Where a product comes from. A product can have more than one source. */
export type ProductSource = 'supplier' | 'import' | 'factory' | 'workshop'
/** One material in a recipe: how much of it goes into one unit of the finished product. */
export interface RecipeLine {
  productId: string
  qty: number
}
export interface Product {
  id: string
  name: string
  code: string
  categoryId: string
  kind: ProductKind
  unit: string
  pack: string
  cost: number
  price: number
  stock: number
  lowAt: number
  /** Missing in books saved before sources were added. */
  sources?: ProductSource[]
  /** Suppliers we usually buy this from. */
  supplierIds?: string[]
  /** Materials and packaging needed for one unit. */
  recipe?: RecipeLine[]
  /** Hidden from lists and pickers, kept for history. */
  archived?: boolean
  custom?: CustomValues
}

/** A manual stock correction: counted, damaged, lost, sample given out. `qty` is signed. */
export interface StockAdjustment extends Dated {
  id: string
  productId: string
  qty: number
  reason: string
  note: string
}
/** Finished goods made in our own workshop from materials in the warehouse. */
export interface Production extends Dated {
  id: string
  productId: string
  qty: number
  materials: MaterialGiven[]
  /** Labour and other making costs for the whole batch. */
  extraCost: number
  note: string
}

/** A record that happened on a date. `ts` orders records made on the same day. */
export interface Dated {
  date: ISODate
  ts: number
}

/* ---------- factory orders ---------- */
export interface Factory {
  id: string
  name: string
  contact: string
  phone: string
  address: string
  makes: string
}

export interface FactoryReceipt extends Dated {
  id: string
  challan: string
  qty: number
  damaged: number
  note: string
}
export interface FactoryBill extends Dated {
  id: string
  billNo: string
  amount: number
  receiptId: string
}
export interface FactoryPayment extends Dated {
  id: string
  amount: number
  method: string
  note: string
}
export interface MaterialGiven {
  productId: string
  given: number
}

/** Material left at a factory that we took back into the warehouse, or wrote off as wastage. */
export interface MaterialSettlement extends Dated {
  id: string
  productId: string
  qty: number
  kind: 'returned' | 'wasted'
  note: string
}

/** 1: we supply raw materials and pay a making charge. 2: the factory supplies everything. */
export type FactoryOrderType = 1 | 2
export interface FactoryOrder {
  id: string
  ts: number
  factoryId: string
  type: FactoryOrderType
  productId: string
  qty: number
  rate: number
  placed: ISODate
  expected: ISODate
  materials: MaterialGiven[]
  /** Missing in books saved before material returns were added. */
  settlements?: MaterialSettlement[]
  custom?: CustomValues
  receipts: FactoryReceipt[]
  bills: FactoryBill[]
  payments: FactoryPayment[]
}

/* ---------- suppliers ---------- */
export type SupplierTerms = 'credit' | 'cash'
export interface Supplier {
  id: string
  name: string
  contact: string
  phone: string
  address: string
  goods: string
  terms: SupplierTerms
  days: number
  opening: number
  custom?: CustomValues
}
export interface Purchase extends Dated {
  id: string
  billNo: string
  supplierId: string
  productId: string
  qty: number
  rate: number
  terms: SupplierTerms
}
export interface SupplierPayment extends Dated {
  id: string
  supplierId: string
  purchaseId: string
  amount: number
  method: string
  note: string
}

/* ---------- shipments and customs ---------- */
export type Direction = 'import' | 'export'
export type ImportStep = 'lc' | 'shipped' | 'port' | 'customs' | 'warehouse'
export type ExportStep = 'contract' | 'ready' | 'customs' | 'shipped' | 'paid'
export type StepKey = ImportStep | ExportStep
export interface StepState {
  date?: ISODate
  expected?: ISODate
}

export interface ShipmentCost extends Dated {
  id: string
  type: string
  amount: number
  method: string
}

export type DutyKey = 'cd' | 'rd' | 'sd' | 'vat' | 'ait' | 'at'
export type CustomsStage = 'docs' | 'boe' | 'assess' | 'duty' | 'exam' | 'release'
export interface CustomsInfo {
  hsCode?: string
  port?: string
  cnf?: string
  boeNo?: string
  boeDate?: ISODate
  container?: string
  /** Assessable value in Tk. 0 means: work it out from invoice value, freight and insurance. */
  av?: number
  rates: Partial<Record<DutyKey, number>>
  freeUntil?: ISODate
  demurragePerDay?: number
  stages: Partial<Record<CustomsStage, ISODate>>
  docs: Record<string, boolean>
}

export interface Shipment {
  id: string
  ts: number
  direction: Direction
  /** Supplier abroad for imports, buyer abroad for exports. */
  supplier: string
  country: string
  productId: string
  productName: string
  qty: number
  unit: string
  lcNo: string
  bank: string
  usd: number
  rate: number
  costs: ShipmentCost[]
  steps: Partial<Record<StepKey, StepState>>
  customs?: CustomsInfo
  /** Cost per unit of exported goods, fixed when they leave the warehouse. */
  unitCost?: number
  custom?: CustomValues
}

/* ---------- selling ---------- */
export type DealerTerms = 'credit' | 'cod'
export interface Dealer {
  id: string
  name: string
  owner: string
  phone: string
  area: string
  address: string
  opening: number
  terms: DealerTerms
  limit: number
  days: number
  salesId: string
  custom?: CustomValues
}

export interface InvoiceLine {
  productId: string
  qty: number
  price: number
  /** Copied from the product when the invoice is finalised, so old invoices keep their wording and cost. */
  name?: string
  unit?: string
  cost?: number
}
export interface Invoice extends Dated {
  id: string
  status: 'draft' | 'final'
  dealerId: string
  soldBy: string
  terms: DealerTerms
  lines: InvoiceLine[]
  discount: number
  received: number
  method: string
}
export interface Collection extends Dated {
  id: string
  dealerId: string
  invoiceId: string
  amount: number
  method: string
  collectedBy: string
}

/* ---------- money and people ---------- */
export interface Expense extends Dated {
  id: string
  head: string
  details: string
  amount: number
  method: string
  /** Set on transport costs: which vehicle, trip or hired transporter the money went to. */
  transport?: TransportLink
}

/* ---------- transport ---------- */
export type VehicleType = 'truck' | 'covered-van' | 'pickup' | 'van' | 'motorcycle' | 'boat' | 'other'
/** Own: bought by the company. Rented: hired by the month from someone else. */
export type VehicleOwnership = 'own' | 'rented'
export type PaperKey = 'fitness' | 'taxToken' | 'insurance' | 'routePermit' | 'license'
export interface Vehicle {
  id: string
  name: string
  regNo: string
  type: VehicleType
  capacity: string
  ownership: VehicleOwnership
  /** For a rented vehicle: who it is rented from and the rent per month. */
  owner: string
  monthlyRent: number
  /** A driver on the staff list, or a name for an outside driver. */
  driverId: string
  driverName: string
  driverPhone: string
  /** The vehicle's own number: the SIM kept in the cab or its GPS tracker. Missing in older books. */
  phone?: string
  /** Service schedule: every so many km and/or days, counted from the last Servicing cost. */
  serviceKm?: number
  serviceDays?: number
  /** Expiry date of each paper. */
  papers: Partial<Record<PaperKey, ISODate>>
  note: string
  archived?: boolean
}
export type TripPurpose = 'delivery' | 'pickup' | 'transfer' | 'other'
export type TripStatus = 'planned' | 'on-the-way' | 'done' | 'cancelled'
/** A truck or van hired for one trip from a transport agency or truck stand. */
export interface TripHire {
  transporter: string
  vehicleNo: string
  driver: string
  phone: string
  /** Agreed hire charge for the trip. */
  fare: number
}
export interface Trip extends Dated {
  id: string
  purpose: TripPurpose
  status: TripStatus
  /** A vehicle from the fleet (own or rented by the month); empty when hired for this trip. */
  vehicleId: string
  hire?: TripHire
  from: string
  to: string
  dealerId: string
  invoiceId: string
  orderId: string
  shipmentId: string
  load: string
  kmStart?: number
  kmEnd?: number
  /** Date the goods arrived. */
  doneOn?: ISODate
  /** Who signed for the goods, and any note from the delivery. */
  receivedBy?: string
  deliveryNote?: string
  note: string
}
export type TransportCostKind =
  | 'Fuel' | 'Hire charge' | 'Vehicle rent' | 'Driver allowance' | 'Loading and unloading' | 'Toll and parking'
  | 'Repair' | 'Servicing' | 'Tyres and parts' | 'Papers and tax' | 'Insurance' | 'Other'
export interface TransportLink {
  kind: TransportCostKind
  vehicleId?: string
  tripId?: string
  /** For hire charges: the agency or truck owner paid. */
  transporter?: string
  odometer?: number
}
export interface Advance extends Dated {
  id: string
  employeeId: string
  amount: number
  method: string
}

export type PayType = 'salary' | 'sales'
export interface Employee {
  id: string
  name: string
  phone: string
  role: string
  payType: PayType
  salary: number
  rate: number
  commissionOn: 'sales' | 'collection'
  joined: ISODate
  /** Monthly sales target in Taka for sales staff; missing or 0 means none set. */
  salesTarget?: number
}
export interface PayrollLine {
  employeeId: string
  kind: 'salary' | 'commission'
  amount: number
}
export interface PayrollRun extends Dated {
  id: string
  month: MonthKey
  method: string
  lines: PayrollLine[]
}

/** Counters for ids and invoice/order numbers. */
export interface Sequences {
  id: number
  ts: number
  fo: number
  inv: number
  imp: number
  exp: number
  pb: number
  /** Next trip number; missing in older books. */
  trip?: number
}

export interface Db {
  v: 1
  seq: Sequences
  company: Company
  users: User[]
  roles: Role[]
  businessTypes: BusinessTypeId[]
  fieldDefs: FieldDef[]
  openingCash: number
  categories: Category[]
  products: Product[]
  factories: Factory[]
  factoryOrders: FactoryOrder[]
  suppliers: Supplier[]
  purchases: Purchase[]
  supplierPayments: SupplierPayment[]
  /** Import and export shipments. Named `imports` for compatibility with saved books. */
  imports: Shipment[]
  dealers: Dealer[]
  invoices: Invoice[]
  collections: Collection[]
  expenses: Expense[]
  advances: Advance[]
  employees: Employee[]
  payroll: PayrollRun[]
  /** Missing in books saved before stock adjustments were added. */
  adjustments?: StockAdjustment[]
  /** Missing in books saved before workshop production was added. */
  productions?: Production[]
  /** Missing in books saved before transport was added. */
  vehicles?: Vehicle[]
  trips?: Trip[]
}

/** Cheap structural check before trusting a parsed backup or API payload. */
export const isDb = (x: unknown): x is Db =>
  !!x && typeof x === 'object' && (x as Db).v === 1 && Array.isArray((x as Db).products) && Array.isArray((x as Db).invoices)
