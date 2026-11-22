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
  | 'my-work'
  | 'attendance'
  | 'factory-orders'
  | 'raw-materials'
  | 'sales-analytics'
  | 'transport'
  | 'courier'
  | 'deliveries'
  | 'messages'
  | 'suppliers'
  | 'imports'
  | 'customs'
  | 'products'
  | 'sell'
  | 'dealers'
  | 'cashbook'
  | 'employees'
  | 'fixed-assets'
  | 'warehouse'
  | 'expenses'
  | 'accounts'
  | 'investors'
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
  /** Special permissions beyond screens. Missing: only the Owner (and, by default, the Accountant) sees them. */
  see?: Partial<Record<SeeKey, boolean>>
}
/** cost: buying prices, cost per unit, stock value, factory rates, landed costs. profit: profit and margins. */
export type SeeKey = 'cost' | 'profit'

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
  /** Courier service for delivering to customers; missing until set up. */
  courier?: CourierSettings
  /** WhatsApp and SMS; missing until set up. */
  messaging?: MessagingSettings
  /** Country, currency and tax registration; missing means Bangladesh with Taka. */
  tax?: TaxSettings
}

/* ---------- custom fields ---------- */
export type CustomEntity = 'product' | 'supplier' | 'dealer' | 'shipment' | 'factoryOrder' | 'employee'
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
  /** Factories that usually make this. */
  factoryIds?: string[]
  /** Overseas suppliers we usually import this from, by name. */
  importFrom?: string[]
  /** Materials and packaging needed for one unit. */
  recipe?: RecipeLine[]
  /** Hidden from lists and pickers, kept for history. */
  archived?: boolean
  /** Printed on labels and scanned at receiving, delivery and returns. Missing: the product code is used. */
  barcode?: string
  /** Units in one carton, for carton labels: scanning a carton label counts the whole carton. */
  perCarton?: number
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

/* ---------- people we buy from: full details ---------- */
/** Contact, address, registration and bank details shared by suppliers and factories. All optional, missing in older books. */
export interface PartyDetails {
  altPhone?: string
  email?: string
  website?: string
  /** Area, thana or upazila. */
  area?: string
  city?: string
  district?: string
  country?: string
  postCode?: string
  /** Trade licence number. */
  tradeLicense?: string
  /** BIN / VAT / tax registration. */
  taxNo?: string
  /** Bank name, account name and number, branch, routing; or a bKash/Nagad number. */
  bank?: string
  note?: string
}

/** A warehouse or godown where goods are received and kept. */
export interface WarehouseSite {
  id: string
  name: string
  address: string
  area: string
  city: string
  manager: string
  phone: string
  /** How much it holds, as people say it: "8,000 cartons", "12,000 sq ft". */
  capacity: string
  note: string
  /** The main warehouse, shown first and printed on challans. */
  main?: boolean
}
/** Goods moved from one of our warehouses to another. */
export interface StockTransfer {
  id: string
  ts: number
  date: ISODate
  from: string
  to: string
  lines: { productId: string; qty: number }[]
  /** Vehicle, driver, challan… */
  note: string
  by: string
}

/* ---------- factory orders ---------- */
export interface Factory extends PartyDetails {
  id: string
  name: string
  contact: string
  phone: string
  address: string
  makes: string
  /** No longer used: kept for history, left out of pickers. */
  archived?: boolean
}

export interface FactoryReceipt extends Dated {
  id: string
  challan: string
  qty: number
  damaged: number
  note: string
  /** What we paid to bring this shipment from the factory to the warehouse. */
  freight?: number
  /** True when the freight is added into the product's cost per unit; false keeps it as a plain expense. */
  freightInCost?: boolean
  /** Warehouse it went into; missing means the main one. */
  siteId?: string
}
/** A change to an order while the factory is still working on it. */
export interface OrderAmendment extends Dated {
  id: string
  fromQty: number
  toQty: number
  fromRate: number
  toRate: number
  reason: string
}
export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'ordered'
/** A price and quantity proposal sent to a factory before the order is confirmed. */
export interface FactoryEstimate extends Dated {
  id: string
  factoryId: string
  type: FactoryOrderType
  productId: string
  qty: number
  rate: number
  /** When we would like the goods. */
  wanted: ISODate | ''
  /** How long the factory's price holds. */
  validUntil: ISODate | ''
  materials: MaterialGiven[]
  note: string
  status: EstimateStatus
  sentOn?: ISODate
  /** Approval or rejection date, with what the factory said. */
  answeredOn?: ISODate
  answer?: string
  orderId?: string
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
  attachments?: Attachment[]
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
  /** The estimate this order was confirmed from, if any. */
  estimateId?: string
  /** Quantity or rate changes made after the order was placed. */
  amendments?: OrderAmendment[]
  /** Missing in books saved before material returns were added. */
  settlements?: MaterialSettlement[]
  custom?: CustomValues
  receipts: FactoryReceipt[]
  bills: FactoryBill[]
  payments: FactoryPayment[]
}

/* ---------- suppliers ---------- */
export type SupplierTerms = 'credit' | 'cash'
export interface Supplier extends PartyDetails {
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
  /** Input VAT or tax charged by the supplier, on top of qty × rate. */
  tax?: number
  /** Warehouse it went into; missing means the main one. */
  siteId?: string
}
export interface SupplierPayment extends Dated {
  id: string
  supplierId: string
  purchaseId: string
  amount: number
  method: string
  note: string
  attachments?: Attachment[]
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
  /** Warehouse imported goods went into; missing means the main one. */
  siteId?: string
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
  /** Goods go to this dealer by courier; with auto-booking on, a parcel is booked when a sale is saved. */
  courier?: boolean
  /** The made-up dealer that sample bills belong to. */
  sample?: boolean
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
  /**
   * Set on invoices saved after the delivery section was added: stock leaves the warehouse when the
   * goods are delivered, not when the bill is made. Older invoices took stock out at once.
   */
  stockOnDelivery?: boolean
  /** The estimate this invoice was made from. */
  quoteId?: string
  /** Sample data for trying the delivery section: never moves stock, never counts in sales or money. */
  sample?: boolean
  /** VAT, GST or sales tax on this bill. Missing in bills made before taxes were added. */
  taxes?: InvoiceTax[]
}

/* ---------- delivery, returns, estimates to dealers ---------- */
export interface QtyLine {
  productId: string
  qty: number
}
export type DeliveryVia = 'own' | 'courier' | 'pickup' | 'hired'
/** Goods actually handed over against an invoice: all of it or part. Stock moves here. */
export interface Delivery extends Dated {
  id: string
  invoiceId: string
  dealerId: string
  lines: QtyLine[]
  via: DeliveryVia
  tripId?: string
  parcelId?: string
  receivedBy: string
  note: string
  /**
   * Closes the rest of the bill without delivering it (the dealer no longer wants it). These lines
   * never leave the warehouse; `credit` comes off what the dealer owes.
   */
  cancelled?: boolean
  credit?: number
  /** Part of the sample data: never moves stock. */
  sample?: boolean
}
export type ReturnCondition = 'restock' | 'damaged'
/** Goods a dealer sent back. Good goods go back into stock; the credit comes off what the dealer owes. */
export interface SalesReturn extends Dated {
  id: string
  invoiceId: string
  dealerId: string
  lines: (QtyLine & { price: number })[]
  condition: ReturnCondition
  /** Taken off the dealer's due. 0 when the goods are replaced instead. */
  credit: number
  reason: string
  note: string
  /** Part of the sample data: never moves stock. */
  sample?: boolean
}
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'invoiced'
/** A price estimate for a dealer, approved before it becomes an invoice. */
export interface SalesQuote extends Dated {
  id: string
  dealerId: string
  soldBy: string
  terms: DealerTerms
  lines: InvoiceLine[]
  discount: number
  validUntil: ISODate | ''
  note: string
  status: QuoteStatus
  sentOn?: ISODate
  answeredOn?: ISODate
  answer?: string
  invoiceId?: string
}

/* ---------- messages (WhatsApp and SMS) ---------- */
export type MessageKind = 'estimate' | 'invoice' | 'payment' | 'reminder' | 'occasional' | 'delivery'
export type MessageChannel = 'whatsapp' | 'sms'
export interface MessageLog extends Dated {
  id: string
  kind: MessageKind
  channel: MessageChannel
  to: string
  dealerId: string
  text: string
  /** sent: delivered to the gateway; opened: WhatsApp opened for a person to press send; failed: see error. */
  status: 'sent' | 'opened' | 'failed'
  error?: string
  /** Invoice, estimate or collection it is about. */
  ref?: string
  /** Who it went to, for people who are not dealers (suppliers, staff, a typed number). */
  name?: string
  /** Sent in test mode: nothing left the app. */
  test?: boolean
}
export interface MessagingSettings {
  /** link: opens WhatsApp with the text ready (free, a person presses send). cloud: WhatsApp Business API sends by itself. */
  whatsapp: 'off' | 'link' | 'cloud'
  sms: 'off' | 'gateway'
  /** Which kinds go out by themselves, and on which channels. */
  auto: Partial<Record<MessageKind, MessageChannel[]>>
  /** Remind dealers this many days after a bill falls due, then again every this many days. */
  reminderDays: number
  templates: Partial<Record<MessageKind, string>>
  testMode: boolean
  /** Last day automatic reminders ran. */
  lastReminderRun?: ISODate
}
export interface Collection extends Dated {
  id: string
  dealerId: string
  invoiceId: string
  amount: number
  method: string
  collectedBy: string
  attachments?: Attachment[]
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
  attachments?: Attachment[]
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
  | 'Fuel' | 'Hire charge' | 'Freight to warehouse' | 'Vehicle rent' | 'Driver allowance' | 'Loading and unloading' | 'Toll and parking'
  | 'Repair' | 'Servicing' | 'Tyres and parts' | 'Papers and tax' | 'Insurance' | 'Other'
export interface TransportLink {
  kind: TransportCostKind
  vehicleId?: string
  tripId?: string
  /** For hire charges: the agency or truck owner paid. */
  transporter?: string
  /** Freight for goods from a factory order. */
  orderId?: string
  odometer?: number
}
export interface Advance extends Dated {
  id: string
  employeeId: string
  amount: number
  method: string
  attachments?: Attachment[]
}

/** Monthly salary, commission on sales, a wage for each day worked, or a fixed sum for a contract. */
export type PayType = 'salary' | 'sales' | 'daily' | 'contract'
/** Office and sales staff, or workers (factory floor, loading, labour). */
export type StaffKind = 'staff' | 'worker'
export interface WorkContract {
  /** Total agreed for the job. */
  amount: number
  start: ISODate
  end: ISODate
  /** What the contract covers, e.g. "Loading 40 containers", "Godown painting". */
  work: string
}
/** One line of someone's job history: joined, promoted, pay changed, moved, warned, left… */
export interface JobEvent {
  id: string
  date: ISODate
  kind: 'joined' | 'role' | 'pay' | 'department' | 'contract' | 'note' | 'left' | 'rejoined' | 'transfer'
  text: string
}
/** Where people work: an office, a warehouse, a factory floor, a sales region or a branch. */
export type PlaceKind = 'office' | 'warehouse' | 'factory' | 'region' | 'branch' | 'other'
export interface WorkPlace {
  id: string
  name: string
  kind: PlaceKind
  /** Division or region, e.g. Dhaka, Chattogram. */
  region: string
  /** Areas a sales region covers, or the area the place is in. */
  area: string
  address: string
  /** The person in charge, from the employees; or a name when they are not on the books. */
  headId?: string
  headName?: string
  phone: string
  /** Working hours, shift, weekly off. */
  hours: string
  note: string
  /** The warehouse this place is, when it is one of ours. */
  siteId?: string
  /** Where it is on the map, and how close counts as "at work" for check-in (metres). */
  lat?: number
  lng?: number
  radius?: number
  /** Work starts at "HH:MM"; check-ins after start + grace are late. */
  startTime?: string
  graceMin?: number
  archived?: boolean
}
/** An order moving someone to another workplace from a date. */
export interface StaffTransfer {
  id: string
  employeeId: string
  /** Where they worked before; empty for a first posting. */
  from: string
  to: string
  /** The day they start at the new place. */
  date: ISODate
  /** Office order or letter number. */
  orderNo: string
  reason: string
  /** New job title from that day, when it changes. */
  newRole?: string
  /** One-time transfer or travel allowance. */
  allowance?: number
  note: string
  by: string
  at: string
  cancelled?: boolean
}
/** Leave an employee asks for; the admin approves or declines it. */
export type LeaveKind = 'casual' | 'sick' | 'annual' | 'unpaid' | 'other'
export interface LeaveRequest {
  id: string
  employeeId: string
  kind: LeaveKind
  from: ISODate
  to: ISODate
  /** Half of one day only. */
  half?: boolean
  reason: string
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  /** When asked, and who asked (user name). */
  askedAt: string
  askedBy: string
  /** Who approved or declined, when, and what they said. */
  decidedBy?: string
  decidedAt?: string
  answer?: string
}
/** A day in the attendance register. */
export type DayStatus = 'present' | 'half' | 'absent' | 'leave'
export interface WorkDay {
  id: string
  date: ISODate
  employeeId: string
  status: DayStatus
  /** Hours on the job, when tracked. */
  hours?: number
  /** What they did that day. */
  work: string
  /** Pieces, cartons, bags… done that day, when work is counted. */
  output?: number
  note?: string
  /** Set when the day comes from approved leave. */
  leaveId?: string
  /** Check-in and check-out, local time "HH:MM". */
  inAt?: string
  outAt?: string
  /** Who marked it: the person themselves (check-in) or the office. */
  source?: 'self' | 'office'
  /** Where they checked in from, and whether that was at their workplace. */
  lat?: number
  lng?: number
  /** Metres from the workplace, when both are known. */
  distance?: number
  /** Who last changed the day by hand, and when. */
  editedBy?: string
  editedAt?: string
}
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
  /** Job details; missing in older books. */
  department?: string
  address?: string
  nid?: string
  emergency?: string
  note?: string
  /** Staff or worker; missing means staff. */
  kind?: StaffKind
  /** Wage for one full day (daily pay). */
  dailyRate?: number
  contract?: WorkContract
  /** Still working here, or left on `leftOn`. */
  status?: 'active' | 'left'
  leftOn?: ISODate
  /** Extra details only this person has, added on the spot: "Blood group: B+", "Licence no.: …". */
  extra?: { label: string; value: string }[]
  /** Values of the company's own employee fields (Settings → custom fields). */
  custom?: CustomValues
  history?: JobEvent[]
  /** First workplace, before any transfer order. */
  placeId?: string
}
export interface PayrollLine {
  employeeId: string
  kind: 'salary' | 'commission' | 'wage' | 'contract'
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
  /** Next estimate number; missing in older books. */
  est?: number
  /** Next dealer estimate (quote) number. */
  qt?: number
  /** Next fixed asset number (FA-2026-00001) and profit distribution number (PD-1). */
  fa?: number
  pd?: number
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
  /** Opening money in bank and mobile wallets, out of `openingCash`; the rest was cash in hand. Missing in older books. */
  openingAccounts?: Record<string, number>
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
  /** Missing in books saved before factory estimates were added. */
  estimates?: FactoryEstimate[]
  /** Missing in books saved before courier booking was added. */
  parcels?: Parcel[]
  /** Missing in books saved before the delivery section was added. */
  deliveries?: Delivery[]
  returns?: SalesReturn[]
  quotes?: SalesQuote[]
  messages?: MessageLog[]
  /** Missing in books saved before fixed assets and investors were added. */
  assets?: FixedAsset[]
  investors?: Investor[]
  investorTxns?: InvestorTxn[]
  distributions?: ProfitDistribution[]
  transfers?: AccountTransfer[]
  /** Missing in books saved before warehouse sites were added. */
  warehouses?: WarehouseSite[]
  /** Attendance register: one row per person per day marked. */
  attendance?: WorkDay[]
  leaveRequests?: LeaveRequest[]
  workplaces?: WorkPlace[]
  staffTransfers?: StaffTransfer[]
  /** Paid leave days each person gets in a year, by kind; missing kinds have no limit. */
  leaveQuota?: Partial<Record<LeaveKind, number>>
  /** Goods moved between our warehouses. */
  stockTransfers?: StockTransfer[]
  /** Missing in books saved before tax, accounts and regular expenses were added. */
  taxRates?: TaxRate[]
  taxPayments?: TaxPayment[]
  changeNotes?: ChangeNote[]
  accountHeads?: AccountHead[]
  expenseAccounts?: ExpenseAccount[]
  expenseEntries?: ExpenseEntry[]
}

/** Money moved between the company's own accounts: cash deposited in the bank, cash taken out, bank to bKash. */
export interface AccountTransfer extends Dated {
  id: string
  from: string
  to: string
  amount: number
  note: string
  attachments?: Attachment[]
}

/* ---------- attachments ---------- */
/** Records that can carry attached money receipts and documents. */
export type AttachTarget = 'collection' | 'supplierPayment' | 'factoryPayment' | 'expense' | 'advance' | 'investorTxn' | 'transfer' | 'taxPayment' | 'expenseEntry'
/** A money receipt, bank slip or other document kept with a payment. The file itself is stored by the API. */
export interface Attachment {
  id: string
  name: string
  type: string
  size: number
}

/* ---------- country, tax and VAT ---------- */
export type TaxKind = 'vat' | 'gst' | 'sales' | 'sd' | 'withholding' | 'income' | 'other'
export type MoneyGrouping = 'lakh' | 'western'
export interface Currency {
  code: string
  symbol: string
  grouping: MoneyGrouping
}
export interface TaxSettings {
  /** Code of a preset in countries.ts, or 'XX' for custom. */
  country: string
  currency: Currency
  /** The company's tax registration (BIN in Bangladesh, VAT no., EIN…), printed on bills. */
  taxNo: string
  /** Rates ticked by default on a new sale bill. */
  salesDefault: string[]
  /** Prices typed on bills already include the default taxes. */
  pricesIncludeTax: boolean
}
export interface TaxRate {
  id: string
  name: string
  kind: TaxKind
  /** Percent. */
  rate: number
  appliesTo: 'sales' | 'purchases' | 'both'
  active: boolean
  note: string
}
/** A tax on one bill, copied from the rate when the bill was made so later rate changes leave old bills alone. */
export interface InvoiceTax {
  rateId?: string
  name: string
  kind: TaxKind
  rate: number
  /** The price already contains this tax. */
  inclusive: boolean
}
/** VAT or tax paid to the government (or deposited by challan). */
export interface TaxPayment extends Dated {
  id: string
  kind: TaxKind
  /** Month the payment is for, 'YYYY-MM'. */
  period: string
  amount: number
  method: string
  /** Challan or receipt number. */
  ref: string
  note: string
  attachments?: Attachment[]
}
export type ChangeArea = 'vat' | 'tax' | 'costing' | 'currency' | 'expense' | 'other'
/** "Why did this change?": a dated note kept whenever a VAT or tax rate, a cost or the currency changes. */
export interface ChangeNote extends Dated {
  id: string
  area: ChangeArea
  subject: string
  from?: string
  to?: string
  note: string
  /** Who made the change. */
  by: string
  /** When it takes effect, if not the same day. */
  effective?: ISODate
}
/** An account head the company adds itself, e.g. Rent, Utilities, Bank charges. */
export interface AccountHead {
  id: string
  code: string
  name: string
  group: 'expense' | 'income'
  note: string
  archived?: boolean
}

/* ---------- regular expenses ---------- */
export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'variable'
/**
 * A cost that comes again and again (rent, electricity, internet, a guard's wage). It runs like an account:
 * charges build up each period, payments go against it, and the balance shows what is owed or paid ahead.
 */
export interface ExpenseAccount {
  id: string
  name: string
  /** The expense head it counts under in reports. */
  head: string
  /** Who is paid: landlord, utility company… */
  party: string
  phone: string
  frequency: ExpenseFrequency
  /** Charge per period. For 'variable', each bill is entered by hand. */
  amount: number
  start: ISODate
  end?: ISODate
  note: string
  active: boolean
}
/** A bill (a charge for a period), a payment, or a correction on an expense account. */
export interface ExpenseEntry extends Dated {
  id: string
  accountId: string
  kind: 'bill' | 'payment' | 'adjustment'
  /** Bills: the period it is for ('YYYY-MM' monthly, 'YYYY' yearly, a date for daily or weekly). A bill replaces the automatic charge for that period. */
  period?: string
  /** Bills and payments: positive. Adjustments: + adds to what is owed, − takes off. */
  amount: number
  method: string
  note: string
  attachments?: Attachment[]
}

/* ---------- fixed assets ---------- */
/** straight: the same amount every month over the asset's life. declining: a yearly rate on what is left. none: land and the like. */
export type DepreciationMethod = 'straight' | 'declining' | 'none'
/** Depreciation booked for one asset in one month. */
export interface AssetDepreciation {
  id: string
  month: MonthKey
  date: ISODate
  amount: number
}
/** Something the company owns and uses for years: machines, vehicles, furniture, computers. `date` is the purchase date. */
export interface FixedAsset extends Dated {
  id: string
  name: string
  category: string
  location: string
  /** Who it was bought from. */
  vendor: string
  cost: number
  /** What it will still be worth at the end of its life (scrap value). */
  salvage: number
  method: DepreciationMethod
  /** Useful life in months, for straight-line. */
  lifeMonths: number
  /** Percent per year, for declining balance. */
  rate: number
  /** How it was paid for (Cash, Bank transfer…). Empty when it was not paid from the company's money now (brought in, or a gift). */
  paidFrom: string
  note: string
  status: 'active' | 'disposed'
  disposedOn?: ISODate
  /** What it was sold for when disposed; 0 when scrapped. */
  disposalAmount?: number
  disposalMethod?: string
  disposalNote?: string
  depreciation: AssetDepreciation[]
}

/* ---------- investors ---------- */
export interface Investor {
  id: string
  name: string
  phone: string
  address: string
  note: string
  joined: ISODate
  status: 'active' | 'exited'
}
/**
 * invest: capital put in (cash in). withdraw: capital taken back (cash out). share: their part of a profit
 * distribution (no cash moves). payout: profit paid to them (cash out). reinvest: profit added to their capital.
 */
export type InvestorTxnKind = 'invest' | 'withdraw' | 'share' | 'payout' | 'reinvest'
export interface InvestorTxn extends Dated {
  id: string
  investorId: string
  kind: InvestorTxnKind
  amount: number
  method: string
  note: string
  /** For shares: the distribution they came from. */
  distributionId?: string
  attachments?: Attachment[]
}
/** Profit shared out among investors by their ownership on the day. */
export interface ProfitDistribution extends Dated {
  id: string
  amount: number
  /** What the profit is for, e.g. "January to June 2026". */
  period: string
  note: string
}

/* ---------- courier ---------- */
export type CourierProvider = 'steadfast' | 'pathao' | 'redx' | 'manual' | 'demo'
/** Courier choices kept with the books. The API keys are not here: they stay on the server (or in this browser). */
export interface CourierSettings {
  /** The courier used unless another is picked when booking. */
  provider: CourierProvider
  /** Book a parcel by itself when a credit or cash sale is saved for a dealer who takes courier delivery. */
  autoBook: boolean
  /** Couriers offered when booking; missing means just the default one. */
  enabled?: CourierProvider[]
  /** Test mode: every courier is simulated inside the app, so nothing real is booked and no keys are needed. */
  testMode?: boolean
}
export interface ParcelEvent {
  date: ISODate
  status: string
}
export interface Parcel extends Dated {
  id: string
  invoiceId: string
  dealerId: string
  provider: CourierProvider
  consignmentId: string
  trackingCode: string
  trackingUrl: string
  status: string
  /** Cash the courier collects from the customer. */
  cod: number
  recipientName: string
  phone: string
  address: string
  note: string
  history: ParcelEvent[]
  /** Weight in kg, as told to the courier. */
  weight?: number
  /** The courier's own delivery area, for couriers that need one (Pathao city and zone, RedX area). */
  areaName?: string
  /** What the courier charged for delivery, when it says. */
  charge?: number
  /** Our reference sent to the courier: the invoice number, or an order number for other customers. */
  reference?: string
  /** Booked in test mode or loaded as sample data: never sent to a real courier. */
  test?: boolean
}

/** Cheap structural check before trusting a parsed backup or API payload. */
export const isDb = (x: unknown): x is Db =>
  !!x && typeof x === 'object' && (x as Db).v === 1 && Array.isArray((x as Db).products) && Array.isArray((x as Db).invoices)
