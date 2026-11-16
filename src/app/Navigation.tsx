import { roleName } from '@shared/domain'
import { href } from '@/core/router'
import { useBooks, type SyncState } from '@/core/store/context'
import { cls, Icon, Sheet, useSheetItem, type SheetComponent } from '@/ui'
import { LangSwitch } from '@/components/LangSwitch'
import { useAccess } from './useAccess'

/** Menu links, grouped. Hovering a link starts downloading that screen. */
export function NavList({ current, onPick }: { current: string; onPick?: () => void }) {
  const { groups } = useAccess()
  return groups.map((g, i) => (
    <div className="nav-group" key={g.title || i}>
      {g.title && <div className="nav-title">{g.title}</div>}
      {g.items.map((f) => (
        <a key={f.id} href={href(f.id)} className={cls('nav-item', current === f.id && 'active')} aria-current={current === f.id ? 'page' : undefined}
          onClick={onPick} onPointerEnter={() => void f.load()} onFocus={() => void f.load()}>
          <Icon name={f.icon} size={19} className="nav-icon" />
          <span>{f.label}</span>
        </a>
      ))}
    </div>
  ))
}

const SYNC_TEXT: Record<SyncState, string> = { saved: 'All changes saved', saving: 'Saving', offline: 'Offline, will retry' }

/** Who is signed in, whether changes are saved, and the way out. */
export function Account() {
  const { db, sync, signOut, session } = useBooks()
  const { user } = useAccess()
  return (
    <>
    <div className="lang-row"><LangSwitch dark /></div>
    <div className="account">
      <div>
        <b>{user?.name}</b>
        <span>{roleName(db, user?.roleId)} · <span className={cls('sync', sync)} role="status">{SYNC_TEXT[sync]}</span></span>
      </div>
      <button type="button" className="signout" onClick={signOut}>{session.viaPlatform ? 'All companies' : 'Sign out'}</button>
    </div>
    </>
  )
}

/** The full menu on phones. */
export const MoreMenuSheet: SheetComponent<{ current: string }> = ({ current }) => {
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
MoreMenuSheet.readOnlySafe = true
