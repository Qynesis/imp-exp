import { AutoReminders } from '@/features/messages/AutoReminders'
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { setMoney, type PageId } from '@shared/domain'
import { BRAND, POWERED_BY } from '@/config/brand'
import { go, href, useRoute } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { BrandMark, Button, cls, Icon, Logo, useSheets, useToast } from '@/ui'
import { Assistant } from './Assistant'
import { BillingBar } from './BillingBar'
import { BellButton, DesktopAlerts } from './Notifications'
import { FEATURES, type FeatureRouteProps } from './features'
import { Account, MoreMenuSheet, NavList } from './Navigation'
import { useAccess } from './useAccess'

/** One lazily loaded component per screen, made once. */
const SCREENS = Object.fromEntries(FEATURES.map((f) => [f.id, lazy(f.load)])) as Record<PageId, LazyExoticComponent<ComponentType<FeatureRouteProps>>>

type Motion = 'fade' | 'push' | 'pop'

/** Download every screen this role can open while the browser has nothing better to do. */
function usePrefetch(loads: (() => Promise<unknown>)[]) {
  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback || window.clearTimeout
    const id = idle(() => loads.forEach((load) => void load().catch(() => undefined)))
    return () => cancel(id)
  }, [loads])
}

/** Sidebar on wide screens, top bar and tab bar on phones, and the current screen. */
export function Shell() {
  const { db, notice, clearNotice, signOut } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const { level, allowed, tabs, first } = useAccess()
  const route = useRoute()
  const ok = route.length > 0 && allowed.some((f) => f.id === route[0])
  const [current, ...params] = ok ? route : [first?.id || 'dashboard']
  const feature = allowed.find((f) => f.id === current)
  const pageKey = feature?.hasDetail ? [current, ...params].join('/') : current
  const depth = feature?.hasDetail ? 1 + params.length : 1
  const readonly = feature ? level(feature.id) !== 'edit' : true

  useEffect(() => {
    accessGuard.readonly = readonly
  }, [readonly])
  useEffect(() => {
    if (!ok && first) go(first.id)
  }, [ok, first])
  useEffect(() => {
    if (!notice) return
    toast(notice)
    clearNotice()
  }, [notice, toast, clearNotice])
  const allowedIds = allowed.map((f) => f.id).join()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the set of screens changes
  usePrefetch(useMemo(() => allowed.map((f) => f.load), [allowedIds]))

  // pages slide in when going deeper, slide back when going up, and fade between sections
  const [nav, setNav] = useState<{ key: string; depth: number; motion: Motion }>({ key: pageKey, depth, motion: 'fade' })
  if (nav.key !== pageKey) setNav({ key: pageKey, depth, motion: depth > nav.depth ? 'push' : depth < nav.depth ? 'pop' : 'fade' })
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  if (!first || !feature) {
    return (
      <div className="splash">
        <p>Your role has no access to any screen yet. Ask your admin to update it.</p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    )
  }

  const Screen = SCREENS[feature.id]
  const co = db.company
  // amounts everywhere follow the company's currency
  setMoney(co.tax?.currency)
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href={href(first.id)}>
          <Logo height={64} src={co.logo} light />
          <span className="brand-text">
            <b>{co.name || 'Your company'}</b>
            <span>{co.tagline}</span>
          </span>
        </a>
        <div className="side-tools"><BellButton dark /></div>
        <nav aria-label="Sections"><NavList current={current} /></nav>
        <div className="powered"><BrandMark size={18} /><span><b>{BRAND}</b> · by {POWERED_BY}</span></div>
        <Account />
      </aside>

      <header className="topbar">
        <div className="brand">
          <Logo height={36} src={co.logo} light />
          <b>{co.name || 'Your company'}</b>
        </div>
        <BellButton dark />
      </header>

      <AutoReminders />
      <DesktopAlerts />
      <Assistant />
      <main className="main">
        <BillingBar />
        <div className={cls('page', nav.motion, readonly && 'readonly')} key={pageKey}>
          {readonly && feature.id !== 'my-work' && <div className="view-only" role="note">View only. Your role cannot make changes on this screen.</div>}
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
            <Screen params={params} />
          </Suspense>
        </div>
      </main>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <a key={t.id} href={href(t.id)} className={cls('tab', current === t.id && 'active')} aria-current={current === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            <span>{t.tab?.label}</span>
          </a>
        ))}
        <button type="button" className={cls('tab', !tabs.some((t) => t.id === current) && 'active')} onClick={() => sheets.open(MoreMenuSheet, { current })}>
          <Icon name="grid" size={22} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
