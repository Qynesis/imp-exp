import type { AccessLevel, Db, PageId, Permissions, Role, SeeKey } from './types'

/** Every screen a role can be given access to, in menu order, with the label used in the role editor. */
export const PAGES: readonly (readonly [PageId, string])[] = [
  ['dashboard', 'Dashboard'],
  ['factory-orders', 'Factory orders'],
  ['suppliers', 'Suppliers'],
  ['imports', 'Shipments (LC)'],
  ['trade', 'Import and export'],
  ['customs', 'Customs clearance'],
  ['products', 'Products and stock'],
  ['raw-materials', 'Raw materials'],
  ['warehouse', 'Warehouse (receiving and sources)'],
  ['transport', 'Transport'],
  ['courier', 'Courier'],
  ['deliveries', 'Delivery and returns'],
  ['messages', 'Messages (WhatsApp and SMS)'],
  ['sell', 'Sell to dealer'],
  ['dealers', 'Dealers'],
  ['sales-analytics', 'Sales analytics'],
  ['cashbook', 'Cashbook and dues'],
  ['employees', 'Employees'],
  ['attendance', 'Attendance (see and correct)'],
  ['staff-reports', 'Employee reports (read and review)'],
  ['expenses', 'Expenses (one-time and regular)'],
  ['accounts', 'Accounts, tax and VAT'],
  ['fixed-assets', 'Fixed assets'],
  ['investors', 'Investors and profit sharing'],
  ['reports', 'Reports'],
  ['settings', 'Users, roles and settings'],
]

export const OWNER_ROLE_ID = 'owner'

const perms = (edit: PageId[], view: PageId[] = []): Permissions =>
  Object.fromEntries([...edit.map((p) => [p, 'edit']), ...view.map((p) => [p, 'view'])])

export const defaultRoles = (): Role[] => [
  { id: OWNER_ROLE_ID, name: 'Owner', system: true, perms: {} },
  { id: 'accountant', name: 'Accountant', perms: perms(['suppliers', 'cashbook', 'employees', 'customs'], ['dashboard', 'dealers', 'reports', 'imports', 'factory-orders', 'raw-materials']), see: { cost: true, profit: true } },
  { id: 'sales', name: 'Sales', perms: perms(['sell', 'dealers'], ['products']), see: { cost: false, profit: false } },
  // staff who only see their own work, salary and job history (My work)
  { id: 'staff', name: 'Employee (own profile only)', perms: {}, see: { cost: false, profit: false } },
  // the warehouse receives goods from suppliers and factories, so it sees suppliers and what they send, but not the prices
  { id: 'warehouse', name: 'Warehouse', perms: perms(['warehouse', 'factory-orders', 'products', 'raw-materials', 'deliveries', 'suppliers'], ['imports', 'customs']), see: { cost: false, profit: false } },
]

/** What a user may do on a screen. The Owner role can do everything. */
export function levelFor(db: Pick<Db, 'users' | 'roles'>, userId: string, page: PageId): AccessLevel {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return 'none'
  // everyone linked to an employee sees their own work, pay and history, read-only
  if (page === 'my-work') return user.employeeId ? 'view' : 'none'
  if (role.id === OWNER_ROLE_ID) return 'edit'
  return roleLevel(role, page)
}

/** A role's access to one screen, as set in the role editor. */
export function roleLevel(role: Pick<Role, 'perms'>, page: PageId): AccessLevel {
  const set = role.perms[page]
  if (set) return set
  // the most access any parent screen gives
  const from = (INHERITS[page] || []).map((p) => role.perms[p] || 'none')
  return from.includes('edit') ? 'edit' : from.includes('view') ? 'view' : 'none'
}

/** Screens added after roles were first saved take the access of the screen they grew out of until an admin sets them. */
const INHERITS: Partial<Record<PageId, PageId[]>> = {
  attendance: ['employees'],
  'staff-reports': ['employees'],
  // the import and export section grew out of Shipments (LC): same access until an admin sets it
  trade: ['imports'],
  'raw-materials': ['products'],
  // whoever keeps stock receives goods
  warehouse: ['products', 'raw-materials'],
  'sales-analytics': ['reports'],
  // stock people book trips, the accountant enters what transport costs
  transport: ['products', 'cashbook'],
  // whoever sells or arranges delivery books parcels
  courier: ['sell', 'transport'],
  deliveries: ['sell', 'products', 'transport'],
  messages: ['sell', 'cashbook'],
  // whoever keeps the cashbook records what the company buys to keep
  'fixed-assets': ['cashbook'],
  // whoever keeps the cashbook records expenses; accounts and VAT are for the accountant and the reports
  expenses: ['cashbook'],
  accounts: ['cashbook', 'reports'],
  // capital and profit sharing are for the people who see the reports
  investors: ['reports'],
}

/** Special permissions, as the role editor lists them. */
export const SEE_KEYS: { key: SeeKey; label: string; hint: string }[] = [
  { key: 'cost', label: 'See buying prices and costs', hint: 'Cost per unit, supplier and factory prices, stock value, landed cost' },
  { key: 'profit', label: 'See profit and margins', hint: 'Gross profit, margins and profit reports' },
]

/** Whether someone may see costs or profit. The Owner always can; a role without a setting follows its default. */
export function canSee(db: Pick<Db, 'users' | 'roles'>, userId: string, key: SeeKey): boolean {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return false
  if (role.id === OWNER_ROLE_ID) return true
  return role.see?.[key] ?? role.id === 'accountant'
}

export const isAdmin = (db: Pick<Db, 'users' | 'roles'>, userId: string): boolean => levelFor(db, userId, 'settings') === 'edit'

export const roleName = (db: Pick<Db, 'roles'>, roleId: string | undefined): string => db.roles.find((r) => r.id === roleId)?.name || 'No role'

/** Who may confirm goods into the warehouse: an admin, or a role the admin gave edit access to Warehouse. */
export const canReceive = (db: Pick<Db, 'users' | 'roles'>, userId: string): boolean => isAdmin(db, userId) || levelFor(db, userId, 'warehouse') === 'edit'

/**
 * Goods confirmed into stock between two copies of the books by someone who may not receive them, or null.
 * The server refuses such a save, so a supplier's bill entered by the office waits for the warehouse.
 */
export function receiptRefusal(cur: Pick<Db, 'users' | 'roles' | 'purchases' | 'factoryOrders'>, next: Pick<Db, 'purchases' | 'factoryOrders'>, userId: string): string | null {
  if (canReceive(cur, userId)) return null
  const was = new Map(cur.purchases.map((p) => [p.id, p]))
  for (const p of next.purchases) {
    const before = was.get(p.id)
    if (!p.pending && (!before || before.pending)) return `Only an admin or the warehouse can confirm goods received (bill ${p.billNo}).`
  }
  const seen = new Set(cur.factoryOrders.flatMap((o) => o.receipts.map((r) => r.id)))
  for (const o of next.factoryOrders) for (const r of o.receipts) if (!seen.has(r.id)) return `Only an admin or the warehouse can receive factory goods (${o.id}).`
  return null
}
