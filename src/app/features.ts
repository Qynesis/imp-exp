/**
 * Every screen of the app, in menu order. Adding a feature means: make a folder under src/features
 * whose index.tsx default-exports the screen, then add one entry here (and its PageId in
 * shared/domain/types.ts and permissions.ts so roles can be given access to it).
 *
 * Each screen is its own chunk: it is downloaded the first time it is opened, or earlier while the
 * browser is idle.
 */
import type { ComponentType } from 'react'
import type { PageId } from '@shared/domain'
import type { IconName } from '@/ui'

export interface FeatureRouteProps {
  /** Path segments after the feature id, e.g. ['FO-1042'] for #/factory-orders/FO-1042. */
  params: string[]
}

export type NavGroup = 'Buying' | 'Stock' | 'Selling' | 'Money'

export interface FeatureDef {
  id: PageId
  label: string
  /** Shown beside the label in the menu. */
  icon: IconName
  group?: NavGroup
  /** Shown in the phone tab bar when the role can open it. */
  tab?: { label: string }
  /** Opening a sub-page slides in from the side instead of fading. */
  hasDetail?: boolean
  load: () => Promise<{ default: ComponentType<FeatureRouteProps> }>
}

export const FEATURES: FeatureDef[] = [
  { id: 'dashboard', icon: 'home', label: 'Dashboard', tab: { label: 'Home' }, load: () => import('@/features/dashboard') },
  { id: 'factory-orders', icon: 'factory', label: 'Factory orders', group: 'Buying', tab: { label: 'Orders' }, hasDetail: true, load: () => import('@/features/factory-orders') },
  { id: 'suppliers', icon: 'store', label: 'Suppliers', group: 'Buying', tab: { label: 'Suppliers' }, load: () => import('@/features/suppliers') },
  { id: 'imports', icon: 'ship', label: 'Shipments (LC)', group: 'Buying', tab: { label: 'Shipments' }, load: () => import('@/features/shipments') },
  { id: 'customs', icon: 'shield', label: 'Customs clearance', group: 'Buying', tab: { label: 'Customs' }, load: () => import('@/features/customs') },
  { id: 'products', icon: 'box', label: 'Products and stock', group: 'Stock', tab: { label: 'Stock' }, load: () => import('@/features/products') },
  { id: 'raw-materials', icon: 'layers', label: 'Raw materials', group: 'Stock', load: () => import('@/features/raw-materials') },
  { id: 'transport', icon: 'truck', label: 'Transport', group: 'Stock', load: () => import('@/features/transport') },
  { id: 'sell', icon: 'receipt', label: 'Sell to dealer', group: 'Selling', tab: { label: 'Sell' }, hasDetail: true, load: () => import('@/features/sales') },
  { id: 'dealers', icon: 'users', label: 'Dealers', group: 'Selling', tab: { label: 'Dealers' }, load: () => import('@/features/dealers') },
  { id: 'sales-analytics', icon: 'trend', label: 'Sales analytics', group: 'Selling', load: () => import('@/features/sales-analytics') },
  { id: 'courier', icon: 'parcel', label: 'Courier', group: 'Selling', load: () => import('@/features/courier') },
  { id: 'cashbook', icon: 'wallet', label: 'Cashbook and dues', group: 'Money', tab: { label: 'Cash' }, load: () => import('@/features/cashbook') },
  { id: 'employees', icon: 'badge', label: 'Employees', group: 'Money', load: () => import('@/features/employees') },
  { id: 'reports', icon: 'chart', label: 'Reports', group: 'Money', load: () => import('@/features/reports') },
  { id: 'settings', icon: 'settings', label: 'Users, roles and settings', group: 'Money', load: () => import('@/features/settings') },
]

/** Which screens get a phone tab first, when the role can open them. Four tabs plus "More". */
export const TAB_PRIORITY: PageId[] = ['dashboard', 'factory-orders', 'sell', 'cashbook', 'products', 'dealers', 'suppliers', 'imports', 'customs']
export const TAB_COUNT = 4

export const featureById = (id: string): FeatureDef | undefined => FEATURES.find((f) => f.id === id)
