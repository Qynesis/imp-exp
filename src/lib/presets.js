/** Screens a role can be given access to. */
export const PAGES = [
  ['dashboard', 'Dashboard'],
  ['factory-orders', 'Factory orders'],
  ['suppliers', 'Suppliers'],
  ['imports', 'Shipments (import and export)'],
  ['customs', 'Customs clearance'],
  ['products', 'Products and stock'],
  ['sell', 'Sell to dealer'],
  ['dealers', 'Dealers'],
  ['cashbook', 'Cashbook and dues'],
  ['employees', 'Employees'],
  ['reports', 'Reports'],
  ['settings', 'Users, roles and settings'],
]

const perms = (edit, view = []) => Object.fromEntries([...edit.map((p) => [p, 'edit']), ...view.map((p) => [p, 'view'])])
export const defaultRoles = () => [
  { id: 'owner', name: 'Owner', system: true, perms: {} },
  { id: 'accountant', name: 'Accountant', perms: perms(['suppliers', 'cashbook', 'employees', 'customs'], ['dashboard', 'dealers', 'reports', 'imports', 'factory-orders']) },
  { id: 'sales', name: 'Sales', perms: perms(['sell', 'dealers'], ['products']) },
  { id: 'warehouse', name: 'Warehouse', perms: perms(['factory-orders', 'products'], ['imports', 'customs']) },
]

/** Records that can carry extra fields. */
export const ENTITIES = {
  product: 'Products',
  supplier: 'Suppliers',
  dealer: 'Dealers',
  shipment: 'Shipments',
  factoryOrder: 'Factory orders',
}
export const FIELD_TYPES = { text: 'Text', number: 'Number', date: 'Date', select: 'Choice from a list' }

const f = (entity, label, type = 'text', options) => ({ entity, label, type, options: options || [] })

/** Each business type brings its own extra fields and customs documents. */
export const BUSINESS_TYPES = {
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
    fields: [
      f('product', 'Brand'), f('product', 'Model'), f('product', 'IMEI or serial number'), f('product', 'Warranty (months)', 'number'),
      f('product', 'BTRC approval number'),
    ],
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

/** Add the extra fields of the chosen business types, without duplicating ones that already exist. */
export function applyBusinessTypes(db, types) {
  db.businessTypes = [...new Set([...(db.businessTypes || []), ...types])].filter((t) => BUSINESS_TYPES[t])
  for (const t of types) {
    for (const def of BUSINESS_TYPES[t]?.fields || []) {
      if (db.fieldDefs.some((x) => x.entity === def.entity && x.label === def.label)) continue
      db.fieldDefs.push({ id: 'cf' + ++db.seq.id, ...def })
    }
  }
}

const IMPORT_DOCS = ['Commercial invoice', 'Packing list', 'Bill of lading or airway bill', 'LC copy', 'Insurance cover note', 'Certificate of origin', 'Import registration certificate (IRC)']
const EXPORT_DOCS = ['Commercial invoice', 'Packing list', 'Sales contract or export LC', 'EXP form', 'Export registration certificate (ERC)', 'Certificate of origin', 'Bill of lading or airway bill']
export function customsDocs(db, shipment) {
  if (shipment.direction === 'export') return EXPORT_DOCS
  const extra = (db.businessTypes || []).flatMap((t) => BUSINESS_TYPES[t]?.docs || [])
  return [...new Set([...IMPORT_DOCS, ...extra])]
}
