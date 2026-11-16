import type { AccessLevel, Db, PageId, Permissions, Role } from './types'

/** Every screen a role can be given access to, in menu order, with the label used in the role editor. */
export const PAGES: readonly (readonly [PageId, string])[] = [
  ['dashboard', 'Dashboard'],
  ['factory-orders', 'Factory orders'],
  ['suppliers', 'Suppliers'],
  ['imports', 'Shipments (import and export)'],
  ['customs', 'Customs clearance'],
  ['products', 'Products and stock'],
  ['raw-materials', 'Raw materials'],
  ['transport', 'Transport'],
  ['sell', 'Sell to dealer'],
  ['dealers', 'Dealers'],
  ['sales-analytics', 'Sales analytics'],
  ['cashbook', 'Cashbook and dues'],
  ['employees', 'Employees'],
  ['reports', 'Reports'],
  ['settings', 'Users, roles and settings'],
]

export const OWNER_ROLE_ID = 'owner'

const perms = (edit: PageId[], view: PageId[] = []): Permissions =>
  Object.fromEntries([...edit.map((p) => [p, 'edit']), ...view.map((p) => [p, 'view'])])

export const defaultRoles = (): Role[] => [
  { id: OWNER_ROLE_ID, name: 'Owner', system: true, perms: {} },
  { id: 'accountant', name: 'Accountant', perms: perms(['suppliers', 'cashbook', 'employees', 'customs'], ['dashboard', 'dealers', 'reports', 'imports', 'factory-orders', 'raw-materials']) },
  { id: 'sales', name: 'Sales', perms: perms(['sell', 'dealers'], ['products']) },
  { id: 'warehouse', name: 'Warehouse', perms: perms(['factory-orders', 'products', 'raw-materials'], ['imports', 'customs']) },
]

/** What a user may do on a screen. The Owner role can do everything. */
export function levelFor(db: Pick<Db, 'users' | 'roles'>, userId: string, page: PageId): AccessLevel {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return 'none'
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
  'raw-materials': ['products'],
  'sales-analytics': ['reports'],
  // stock people book trips, the accountant enters what transport costs
  transport: ['products', 'cashbook'],
}

export const isAdmin = (db: Pick<Db, 'users' | 'roles'>, userId: string): boolean => levelFor(db, userId, 'settings') === 'edit'

export const roleName = (db: Pick<Db, 'roles'>, roleId: string | undefined): string => db.roles.find((r) => r.id === roleId)?.name || 'No role'
