/** Fixed lists the forms offer, and the trade presets that add extra fields and customs documents. */
import type { BusinessTypeId, CustomEntity, Db, DutyKey, FieldDef, FieldType, EstimateStatus, PaperKey, ProductKind, ProductSource, Shipment, TransportCostKind, TripPurpose, TripStatus, VehicleType } from './types'

export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'bKash', 'Cheque'] as const
export const UNITS = ['cartons', 'jars', 'pouches', 'pcs', 'units', 'sets', 'kg', 'litres', 'MT', 'boxes', 'bags', 'drums', 'rolls'] as const
export const PRODUCT_KINDS: Record<ProductKind, string> = { finished: 'Finished goods', raw: 'Raw material', packaging: 'Packaging' }
export const PRODUCT_SOURCES: Record<ProductSource, string> = {
  supplier: 'Local supplier',
  import: 'Imported (LC)',
  factory: 'Made at a factory',
  workshop: 'Our own workshop',
}
export const ADJUST_REASONS = ['Stock count', 'Damaged', 'Expired', 'Lost or stolen', 'Sample given', 'Returned by dealer', 'Other'] as const
export const VEHICLE_TYPES: Record<VehicleType, string> = {
  truck: 'Truck', 'covered-van': 'Covered van', pickup: 'Pickup', van: 'Van', motorcycle: 'Motorcycle', boat: 'Boat or trawler', other: 'Other',
}
export const PAPERS: Record<PaperKey, string> = {
  fitness: 'Fitness certificate', taxToken: 'Tax token', insurance: 'Insurance', routePermit: 'Route permit', license: 'Driving licence',
}
export const TRIP_PURPOSES: Record<TripPurpose, string> = {
  delivery: 'Delivery to dealer', pickup: 'Pickup (factory, supplier or port)', transfer: 'Warehouse transfer', other: 'Other',
}
export const TRIP_STATUS: Record<TripStatus, string> = { planned: 'Planned', 'on-the-way': 'On the way', done: 'Delivered', cancelled: 'Cancelled' }
/** Costs of running a trip, and costs of keeping a vehicle on the road. */
export const TRIP_COSTS: readonly TransportCostKind[] = ['Fuel', 'Driver allowance', 'Loading and unloading', 'Toll and parking', 'Hire charge']
export const VEHICLE_COSTS: readonly TransportCostKind[] = ['Fuel', 'Repair', 'Servicing', 'Tyres and parts', 'Papers and tax', 'Insurance', 'Vehicle rent', 'Driver allowance', 'Toll and parking', 'Other']
export const TRANSPORT_COSTS: readonly TransportCostKind[] = [
  'Fuel', 'Hire charge', 'Freight to warehouse', 'Vehicle rent', 'Driver allowance', 'Loading and unloading', 'Toll and parking', 'Repair', 'Servicing', 'Tyres and parts', 'Papers and tax', 'Insurance', 'Other',
]
export const ESTIMATE_STATUS: Record<EstimateStatus, string> = { draft: 'Draft', sent: 'Sent to factory', approved: 'Approved', rejected: 'Rejected', ordered: 'Order confirmed' }
export const TRANSPORT_HEAD = 'Transport'
export const WAREHOUSE_PLACE = 'Our warehouse'
export const EXPENSE_HEADS = ['Transport', 'Office', 'Employee', 'Other'] as const
export const SALARY_ADVANCE = 'Salary advance'
export const SHIPMENT_COST_TYPES = ['Sea freight', 'Insurance', 'Customs duty and VAT', 'C&F agent', 'Port charge', 'Transport to warehouse', 'Bank charge', 'Other'] as const
export const DUTY_COST_TYPE = 'Customs duty and VAT'
export const DEFAULT_PORT = 'Chattogram port'

export const DUTIES: readonly (readonly [DutyKey, string])[] = [
  ['cd', 'Customs duty (CD)'],
  ['rd', 'Regulatory duty (RD)'],
  ['sd', 'Supplementary duty (SD)'],
  ['vat', 'VAT'],
  ['ait', 'Advance income tax (AIT)'],
  ['at', 'Advance tax (AT)'],
]

/** Records that can carry extra fields, with the label used in settings. */
export const CUSTOM_ENTITIES: Record<CustomEntity, string> = {
  product: 'Products',
  supplier: 'Suppliers',
  dealer: 'Dealers',
  shipment: 'Shipments',
  factoryOrder: 'Factory orders',
}
export const FIELD_TYPES: Record<FieldType, string> = { text: 'Text', number: 'Number', date: 'Date', select: 'Choice from a list' }

type FieldPreset = Omit<FieldDef, 'id'>
const f = (entity: CustomEntity, label: string, type: FieldType = 'text', options: string[] = []): FieldPreset => ({ entity, label, type, options })

export interface BusinessType {
  label: string
  fields: FieldPreset[]
  docs: string[]
}

/** Each kind of trade brings its own extra fields and customs documents. */
export const BUSINESS_TYPES: Record<BusinessTypeId, BusinessType> = {
  general: { label: 'General trading and FMCG', fields: [], docs: [] },
  food: {
    label: 'Food and edible goods',
    fields: [f('product', 'Batch number'), f('product', 'Expiry date', 'date'), f('product', 'BSTI licence number')],
    docs: ['BSTI clearance', 'Health or radiation certificate'],
  },
  machinery: {
    label: 'Machinery and industrial equipment',
    fields: [
      f('product', 'Brand'), f('product', 'Model'), f('product', 'Serial number'), f('product', 'Power rating'),
      f('product', 'Warranty (months)', 'number'), f('product', 'Country of origin'), f('product', 'Condition', 'select', ['New', 'Reconditioned']),
      f('shipment', 'Pre-shipment inspection certificate number'),
    ],
    docs: ['Pre-shipment inspection certificate', 'Manufacturer catalogue and specification'],
  },
  electronics: {
    label: 'Gadgets and electronics',
    fields: [f('product', 'Brand'), f('product', 'Model'), f('product', 'IMEI or serial number'), f('product', 'Warranty (months)', 'number'), f('product', 'BTRC approval number')],
    docs: ['BTRC approval (for telecom devices)'],
  },
  toys: {
    label: 'Toys and fidget items',
    fields: [f('product', 'Brand'), f('product', 'Age group'), f('product', 'Material'), f('product', 'BSTI certificate number')],
    docs: ['BSTI clearance', 'Product safety test report'],
  },
  medical: {
    label: 'Medical and pharmaceutical items',
    fields: [
      f('product', 'Generic name'), f('product', 'Manufacturer'), f('product', 'Batch number'), f('product', 'Manufacturing date', 'date'),
      f('product', 'Expiry date', 'date'), f('product', 'DGDA registration number'),
      f('product', 'Storage condition', 'select', ['Room temperature', 'Cool (8 to 15 °C)', 'Refrigerated (2 to 8 °C)', 'Frozen']),
      f('shipment', 'DGDA import permit (NOC) number'), f('supplier', 'Drug licence number'), f('dealer', 'Drug licence number'),
    ],
    docs: ['DGDA import permit (NOC)', 'Certificate of analysis', 'Free sale certificate'],
  },
}
export const isBusinessType = (t: unknown): t is BusinessTypeId => typeof t === 'string' && t in BUSINESS_TYPES

/** Turn on trade types and add their extra fields, without duplicating fields that already exist. Mutates `db`. */
export function applyBusinessTypes(db: Db, types: readonly BusinessTypeId[]): void {
  db.businessTypes = [...new Set([...(db.businessTypes || []), ...types])].filter(isBusinessType)
  for (const t of types) {
    for (const def of BUSINESS_TYPES[t]?.fields || []) {
      if (db.fieldDefs.some((x) => x.entity === def.entity && x.label === def.label)) continue
      db.fieldDefs.push({ id: 'cf' + ++db.seq.id, ...def, options: [...def.options] })
    }
  }
}

const IMPORT_DOCS = ['Commercial invoice', 'Packing list', 'Bill of lading or airway bill', 'LC copy', 'Insurance cover note', 'Certificate of origin', 'Import registration certificate (IRC)']
const EXPORT_DOCS = ['Commercial invoice', 'Packing list', 'Sales contract or export LC', 'EXP form', 'Export registration certificate (ERC)', 'Certificate of origin', 'Bill of lading or airway bill']

/** Documents customs expects for this shipment, given the trades the company is in. */
export function customsDocs(db: Pick<Db, 'businessTypes'>, shipment: Pick<Shipment, 'direction'>): string[] {
  if (shipment.direction === 'export') return EXPORT_DOCS
  const extra = (db.businessTypes || []).flatMap((t) => BUSINESS_TYPES[t]?.docs || [])
  return [...new Set([...IMPORT_DOCS, ...extra])]
}
