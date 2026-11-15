import { useEffect, useState } from 'react'
import { byId, levelFor, roleName } from './lib/selectors.js'
import { StoreProvider, access, useStore } from './lib/store.jsx'
import Auth from './pages/Auth.jsx'
import Cashbook from './pages/Cashbook.jsx'
import Customs from './pages/Customs.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Dealers from './pages/Dealers.jsx'
import Employees from './pages/Employees.jsx'
import { FactoryOrderDetail, FactoryOrders } from './pages/Factory.jsx'
import Imports from './pages/Imports.jsx'
import Products from './pages/Products.jsx'
import Reports from './pages/Reports.jsx'
import Sell from './pages/Sell.jsx'
import Settings from './pages/Settings.jsx'
import Suppliers from './pages/Suppliers.jsx'
import { CustomsSheet, FieldSheet, RoleSheet, UserSheet } from './sheets/admin.jsx'
import { AddCategory, AddCost, AddFactory, AddSupplier, FactoryBill, NewFactoryOrder, NewImport, NewPurchase, Pay, ProductSheet, ReceiveShipment } from './sheets/buying.jsx'
import { AddExpense, EmployeeSheet, Payroll } from './sheets/money.jsx'
import { Collect, DealerSheet, DealerStatement, InvoiceLine, ViewInvoice } from './sheets/selling.jsx'
import Platform from './pages/Platform.jsx'
import { Button, POWERED_BY, Icon, Logo, Sheet, UIProvider, cls, go, useRoute, useSheetItem, useSheets, useToast } from './ui.jsx'

const NAV = [
  { items: [{ path: 'dashboard', label: 'Dashboard', tab: 'Home', icon: 'home' }] },
  { title: 'Buying', items: [
    { path: 'factory-orders', label: 'Factory orders', tab: 'Orders', icon: 'box' },
    { path: 'suppliers', label: 'Suppliers', tab: 'Suppliers', icon: 'users' },
    { path: 'imports', label: 'Shipments (LC)', tab: 'Shipments', icon: 'box' },
    { path: 'customs', label: 'Customs clearance', tab: 'Customs', icon: 'check' },
  ] },
  { title: 'Stock', items: [{ path: 'products', label: 'Products and stock', tab: 'Stock', icon: 'grid' }] },
  { title: 'Selling', items: [
    { path: 'sell', label: 'Sell to dealer', tab: 'Sell', icon: 'receipt' },
    { path: 'dealers', label: 'Dealers', tab: 'Dealers', icon: 'users' },
  ] },
  { title: 'Money', items: [
    { path: 'cashbook', label: 'Cashbook and dues', tab: 'Cash', icon: 'wallet' },
    { path: 'employees', label: 'Employees' },
    { path: 'reports', label: 'Reports' },
    { path: 'settings', label: 'Users, roles and settings' },
  ] },
]
const TAB_ORDER = ['dashboard', 'factory-orders', 'sell', 'cashbook', 'products', 'dealers', 'suppliers', 'imports', 'customs']

function useAccess() {
  const { db, session } = useStore()
  const user = byId(db.users, session.userId)
  const level = (path) => levelFor(db, session.userId, path)
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => level(i.path) !== 'none') })).filter((g) => g.items.length)
  return { user, level, groups, first: groups[0]?.items[0].path }
}

function NavList({ current, onPick }) {
  const { groups } = useAccess()
  return groups.map((g, i) => (
    <div className="nav-group" key={i}>
      {g.title && <div className="nav-title">{g.title}</div>}
      {g.items.map((it) => (
        <a key={it.path} href={'#/' + it.path} className={cls('nav-item', current === it.path && 'active')} aria-current={current === it.path ? 'page' : undefined} onClick={onPick}>
          {it.label}
        </a>
      ))}
    </div>
  ))
}

const SYNC = { saved: 'All changes saved', saving: 'Saving', offline: 'Offline, will retry' }
function Account() {
  const { db, sync, signOut, session } = useStore()
  const { user } = useAccess()
  return (
    <div className="account">
      <div>
        <b>{user?.name}</b>
        <span>{roleName(db, user?.roleId)} · <span className={cls('sync', sync)} role="status">{SYNC[sync]}</span></span>
      </div>
      <button type="button" className="signout" onClick={signOut}>{session.viaPlatform ? 'All companies' : 'Sign out'}</button>
    </div>
  )
}

function MoreMenu({ current }) {
  const { close } = useSheetItem()
  return (
    <Sheet title="Menu">
      <nav className="more-nav" aria-label="All sections">
        <NavList current={current} onPick={close} />
      </nav>
      <Account />
    </Sheet>
  )
}

const SHEETS = {
  more: MoreMenu,
  addFactory: AddFactory, newFactoryOrder: NewFactoryOrder, receiveShipment: ReceiveShipment, factoryBill: FactoryBill, pay: Pay,
  addSupplier: AddSupplier, newPurchase: NewPurchase, newImport: NewImport, addCost: AddCost, addCategory: AddCategory, product: ProductSheet,
  dealer: DealerSheet, dealerStatement: DealerStatement, collect: Collect, invoiceLine: InvoiceLine, viewInvoice: ViewInvoice,
  addExpense: AddExpense, employee: EmployeeSheet, payroll: Payroll,
  user: UserSheet, role: RoleSheet, field: FieldSheet, customs: CustomsSheet,
}

function Screen({ parts }) {
  const [page, a, b] = parts
  switch (page) {
    case 'factory-orders': return a ? <FactoryOrderDetail id={a} /> : <FactoryOrders />
    case 'suppliers': return <Suppliers id={a} />
    case 'imports': return <Imports id={a} />
    case 'customs': return <Customs id={a} />
    case 'products': return <Products />
    case 'sell': return <Sell dealerId={a === 'new' ? b : undefined} />
    case 'dealers': return <Dealers />
    case 'cashbook': return <Cashbook />
    case 'employees': return <Employees />
    case 'reports': return <Reports />
    case 'settings': return <Settings />
    default: return <Dashboard />
  }
}

function Shell() {
  const { db, notice, clearNotice, signOut } = useStore()
  const sheets = useSheets()
  const toast = useToast()
  const { level, first } = useAccess()
  const raw = useRoute()
  const ok = raw.length > 0 && level(raw[0]) !== 'none'
  const parts = ok ? raw : [first]
  const current = parts[0]
  const pushes = current === 'factory-orders' || current === 'sell'
  const pageKey = pushes ? parts.join('/') : current
  const depth = pushes ? parts.length : 1
  const readonly = level(current) !== 'edit'

  useEffect(() => {
    access.readonly = readonly
  })
  useEffect(() => {
    if (!ok && first) go(first)
  })
  useEffect(() => {
    if (notice) {
      toast(notice)
      clearNotice()
    }
  }, [notice, toast, clearNotice])

  const [nav, setNav] = useState({ key: pageKey, depth, dir: 'fade' })
  if (nav.key !== pageKey) setNav({ key: pageKey, depth, dir: depth > nav.depth ? 'push' : depth < nav.depth ? 'pop' : 'fade' })
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  const co = db.company
  if (!first) {
    return (
      <div className="splash">
        <p>Your role has no access to any screen yet. Ask your admin to update it.</p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    )
  }
  const tabs = TAB_ORDER.filter((p) => level(p) !== 'none').slice(0, 4).map((p) => NAV.flatMap((g) => g.items).find((i) => i.path === p))

  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href={'#/' + first}>
          <Logo height={64} src={co.logo} light />
          <span className="brand-text">
            <b>{co.name || 'Your company'}</b>
            <span>{co.tagline}</span>
          </span>
        </a>
        <nav aria-label="Sections"><NavList current={current} /></nav>
        <div className="powered">Powered by <b>{POWERED_BY}</b></div>
        <Account />
      </aside>

      <header className="topbar">
        <div className="brand">
          <Logo height={36} src={co.logo} light />
          <b>{co.name || 'Your company'}</b>
        </div>
      </header>

      <main className="main">
        <div className={cls('page', nav.dir, readonly && 'readonly')} key={pageKey}>
          {readonly && <div className="view-only" role="note">View only. Your role cannot make changes on this screen.</div>}
          <Screen parts={parts} />
        </div>
      </main>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <a key={t.path} href={'#/' + t.path} className={cls('tab', current === t.path && 'active')} aria-current={current === t.path ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            <span>{t.tab}</span>
          </a>
        ))}
        <button type="button" className={cls('tab', !tabs.some((t) => t.path === current) && 'active')} onClick={() => sheets.open('more', { current })}>
          <Icon name="grid" size={22} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}

function Gate() {
  const { phase } = useStore()
  if (phase === 'loading') return <div className="splash"><p>Opening your books</p></div>
  if (phase === 'signedOut') return <Auth />
  if (phase === 'platform') return <Platform />
  return <Shell />
}

/** Sheets, toasts and dialogs belong to one signed-in session: they all close when you sign in, out or switch company. */
function SessionUI() {
  const { phase, session } = useStore()
  return (
    <UIProvider key={`${phase}:${session?.tenantId || ''}:${session?.userId || ''}`} registry={SHEETS}>
      <Gate />
    </UIProvider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <SessionUI />
    </StoreProvider>
  )
}
