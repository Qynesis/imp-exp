import {
  assetSummary, expenseAccountTotals, fmt, foCalc, investors, isLowStock, orderBook, payables, pendingDeliveries, profitAndLoss, receivables, taxReport, thisMonth,
  tkShort, todayISO, tradeOverview, trips, type Db, type PageId,
} from '@shared/domain'
import { useAccess } from '@/app/useAccess'
import { FEATURES, type NavGroup } from '@/app/features'
import { href } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { cls, Icon } from '@/ui'

const plural = (n: number, one: string, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`

/** A plain title for each tile, and one live line so the tile already says something useful. */
const TILES: Partial<Record<PageId, { title: string; info: (db: Db) => string }>> = {
  sell: { title: 'Sell and orders', info: (db) => `${tkShort(orderBook(db).today.value)} sold today` },
  products: { title: 'Stock and inventory', info: (db) => { const low = db.products.filter((p) => p.kind === 'finished' && isLowStock(p)).length; return low ? `${plural(low, 'item')} low` : `${plural(db.products.filter((p) => p.kind === 'finished' && !p.archived).length, 'product')}` } },
  'raw-materials': { title: 'Raw materials', info: (db) => { const low = db.products.filter((p) => p.kind !== 'finished' && isLowStock(p)).length; return low ? `${plural(low, 'item')} low` : 'Stock is fine' } },
  dealers: { title: 'Dealers and retailers', info: (db) => `${tkShort(receivables(db).total)} to collect` },
  cashbook: { title: 'Cash flow and dues', info: (db) => `Owe ${tkShort(payables(db).total)} · due in ${tkShort(receivables(db).total)}` },
  deliveries: { title: 'Delivery and returns', info: (db) => { const n = pendingDeliveries(db).filter((x) => !x.inv.sample).length; return n ? `${plural(n, 'bill')} to deliver` : 'All delivered' } },
  'sales-analytics': { title: 'Sales reports', info: (db) => `${tkShort(orderBook(db).month.value)} this month` },
  reports: { title: 'Reports (profit, dues, stock)', info: (db) => { const n = profitAndLoss(db, thisMonth()).net; return `${n < 0 ? 'Loss' : 'Profit'} ${tkShort(Math.abs(n))} this month` } },
  'factory-orders': { title: 'Factory orders', info: (db) => { const n = db.factoryOrders.filter((o) => foCalc(db, o).pending > 0).length; return n ? `${plural(n, 'order')} in progress` : 'Nothing pending' } },
  suppliers: { title: 'Suppliers and purchases', info: (db) => { const owe = payables(db).rows.filter((r) => r.kind === 'supplier').reduce((s, r) => s + r.due, 0); return owe ? `We owe ${tkShort(owe)}` : 'Nothing owed' } },
  imports: { title: 'Import and export (LC)', info: (db) => { const t = tradeOverview(db); return `${plural(t.imports.length, 'import')}, ${plural(t.exports.length, 'export')}` } },
  customs: { title: 'Customs clearance', info: (db) => { const t = tradeOverview(db); return t.demurrage ? `Demurrage ${tkShort(t.demurrage)}` : `Duty ${tkShort(t.dutyDue)} due` } },
  transport: { title: 'Transport and vehicles', info: (db) => { const n = trips(db).filter((t) => t.status === 'on-the-way').length; return n ? `${plural(n, 'trip')} on the road` : 'No trip on the road' } },
  courier: { title: 'Courier parcels', info: (db) => { const n = (db.parcels || []).filter((p) => !/deliver|cancel|return/i.test(p.status)).length; return n ? `${plural(n, 'parcel')} on the way` : 'No parcel on the way' } },
  messages: { title: 'SMS and WhatsApp', info: (db) => { const n = (db.messages || []).filter((m) => m.date === todayISO()).length; return n ? `${plural(n, 'message')} today` : 'Send to anyone' } },
  expenses: { title: 'Expenses', info: (db) => { const d = expenseAccountTotals(db).due; return d ? `${tkShort(d)} regular due` : 'Nothing due' } },
  accounts: { title: 'Accounts, tax and VAT', info: (db) => { const b = taxReport(db, '2000-01-01', todayISO()).balance; return b > 0 ? `VAT ${tkShort(b)} to pay` : 'VAT settled' } },
  employees: { title: 'Employees and payroll', info: (db) => plural(db.employees.length, 'person', 'people') },
  'fixed-assets': { title: 'Fixed assets', info: (db) => `${tkShort(assetSummary(db).nbv)} book value` },
  investors: { title: 'Investors', info: (db) => plural(investors(db).filter((i) => i.status === 'active').length, 'investor') },
  settings: { title: 'Users and settings', info: (db) => plural(db.users.length, 'user') },
}

/** A tile's live line; a figure that cannot be worked out just leaves the line empty. */
const safeInfo = (f: ((db: Db) => string) | undefined, db: Db): string => {
  try {
    return f?.(db) || ''
  } catch {
    return ''
  }
}

/** The everyday screens first, in the order traders use them; the rest follow in menu order. */
const ORDER: PageId[] = ['sell', 'products', 'dealers', 'cashbook', 'deliveries', 'sales-analytics', 'reports', 'messages', 'expenses', 'accounts', 'raw-materials', 'suppliers', 'factory-orders', 'imports', 'customs', 'transport', 'courier', 'employees', 'fixed-assets', 'investors', 'settings']

const TONE: Record<NavGroup, string> = { Buying: 'buy', Stock: 'stock', Selling: 'sell', Money: 'money' }

/** The first thing on the dashboard: every screen this person can open, as a big icon with a name and one live figure. */
export function Shortcuts({ onPick }: { onPick?: () => void }) {
  const { db } = useBooks()
  const { allowed } = useAccess()
  const rank = (id: PageId) => (ORDER.indexOf(id) < 0 ? ORDER.length : ORDER.indexOf(id))
  const tiles = FEATURES.filter((f) => f.id !== 'dashboard' && allowed.some((a) => a.id === f.id)).sort((x, y) => rank(x.id) - rank(y.id))
  return (
    <nav className="shortcuts" aria-label="Shortcuts">
      {tiles.map((f) => {
        const t = TILES[f.id]
        const info = safeInfo(t?.info, db)
        return (
          <a key={f.id} href={href(f.id)} className={cls('shortcut', f.group && `tone-${TONE[f.group]}`)} onPointerEnter={() => void f.load()} onClick={onPick}>
            <span className="shortcut-icon"><Icon name={f.icon} size={30} /></span>
            <b>{t?.title || f.label}</b>
            {info && <small>{info}</small>}
          </a>
        )
      })}
    </nav>
  )
}
