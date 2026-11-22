import { useEffect, useState } from 'react'
import { daysBetween, fdate, NOTICE_KINDS, todayISO, type Notice, type NoticeKind } from '@shared/domain'
import { BRAND } from '@/config/brand'
import { go } from '@/core/router'
import { Button, cls, Icon, Segmented, Sheet, type IconName, useSheetItem, useSheets, type SheetComponent } from '@/ui'
import { load, save, useNotices } from './useNotices'

/** Shows a system notification for alerts this browser has not seen yet, when the person turned it on. */
export function DesktopAlerts() {
  const { list, desktop, key } = useNotices()
  useEffect(() => {
    const cur = load(key)
    const fresh = list.filter((n) => !cur.seen[n.id] && !cur.read[n.id])
    if (!fresh.length) return
    for (const n of list) cur.seen[n.id] = cur.seen[n.id] || Date.now()
    save(key, cur)
    if (!desktop || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    // the first visit would otherwise announce every old alert at once
    for (const n of fresh.filter((x) => x.tone === 'warn').slice(0, 3)) {
      const note = new Notification(n.title, { body: n.body, tag: n.id })
      note.onclick = () => {
        window.focus()
        go(n.to)
      }
    }
  }, [list, desktop, key])
  return null
}

/** The bell: count of unread alerts; opens the list. */
export function BellButton({ dark }: { dark?: boolean }) {
  const { unread } = useNotices()
  const sheets = useSheets()
  const urgent = unread.some((n) => n.tone === 'warn')
  return (
    <button type="button" className={cls('bell', dark && 'dark')} aria-label={`Notifications, ${unread.length} unread`} onClick={() => sheets.open(NotificationsSheet)}>
      <Icon name="bell" size={20} />
      {unread.length > 0 && <span className={cls('bell-count', urgent && 'urgent')}>{unread.length > 99 ? '99+' : unread.length}</span>}
    </button>
  )
}

type Show = 'unread' | 'all'

const KIND_ICON: Record<NoticeKind, IconName> = {
  money: 'wallet', stock: 'box', delivery: 'truck', trade: 'ship', factory: 'factory', transport: 'route', sales: 'trend', accounts: 'layers', messages: 'send', people: 'calendar',
}

/** "Today", "Yesterday", "3 days ago", or the date. */
const when = (d: string) => {
  const n = daysBetween(d, todayISO())
  if (n <= 0) return 'Today'
  if (n === 1) return 'Yesterday'
  if (n < 7) return `${n} days ago`
  return fdate(d)
}

export const NotificationsSheet: SheetComponent<object> = () => {
  const { list, unread, read, markRead, markUnread, desktop, setDesktop } = useNotices()
  const { close } = useSheetItem()
  const [show, setShow] = useState<Show>(unread.length ? 'unread' : 'all')
  const [kind, setKind] = useState<NoticeKind | 'all'>('all')
  const base = show === 'unread' ? unread : list
  const rows = kind === 'all' ? base : base.filter((n) => n.kind === kind)
  const kinds = (Object.keys(NOTICE_KINDS) as NoticeKind[]).map((k) => ({ k, count: base.filter((n) => n.kind === k).length })).filter((x) => x.count > 0)
  const urgent = rows.filter((n) => n.tone === 'warn')
  const rest = rows.filter((n) => n.tone !== 'warn')
  const urgentAll = unread.filter((n) => n.tone === 'warn').length
  const canNotify = typeof Notification !== 'undefined'
  const [perm, setPerm] = useState(canNotify ? Notification.permission : 'denied')
  const open = (n: Notice) => {
    markRead([n.id])
    close()
    go(n.to)
  }
  const toggleDesktop = async () => {
    if (desktop) return setDesktop(false)
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') setDesktop(true)
  }
  const card = (n: Notice) => {
    const isRead = !!read[n.id]
    return (
      <li key={n.id} className={cls('ntf', n.tone, !isRead && 'unread')}>
        <button type="button" className="ntf-main" onClick={() => open(n)}>
          <span className="ntf-icon"><Icon name={KIND_ICON[n.kind]} size={19} /></span>
          <span className="ntf-text">
            <span className="ntf-top"><b>{n.title}</b>{!isRead && <i className="ntf-dot" aria-label="Unread" />}</span>
            <span className="ntf-body">{n.body}</span>
            <span className="ntf-meta"><span className="ntf-kind">{NOTICE_KINDS[n.kind]}</span><span>{when(n.date)}</span></span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="ntf-toggle" title={isRead ? 'Mark unread' : 'Mark read'} aria-label={isRead ? 'Mark unread' : 'Mark read'}
          onClick={() => (isRead ? markUnread(n.id) : markRead([n.id]))}>
          <Icon name={isRead ? 'undo' : 'check'} size={15} />
        </button>
      </li>
    )
  }
  return (
    <Sheet title="Notifications" crumb={BRAND} wide
      footer={
        <>
          {canNotify && <Button variant="ghost" icon="bell" disabled={perm === 'denied' && !desktop} onClick={() => void toggleDesktop()}>{desktop ? 'Desktop alerts on' : perm === 'denied' ? 'Desktop alerts blocked in browser' : 'Turn on desktop alerts'}</Button>}
          <Button variant="secondary" icon="check" disabled={!unread.length} onClick={() => markRead(unread.map((n) => n.id))}>Mark all as read</Button>
        </>
      }>
      <div className={cls('ntf-hero', urgentAll > 0 ? 'warn' : unread.length ? 'info' : 'good')}>
        <span className="ntf-hero-icon"><Icon name={urgentAll > 0 ? 'alert' : unread.length ? 'bell' : 'check'} size={24} /></span>
        <div className="ntf-hero-text">
          <b>{urgentAll > 0 ? `${urgentAll} need${urgentAll === 1 ? 's' : ''} your attention` : unread.length ? `${unread.length} new update${unread.length === 1 ? '' : 's'}` : 'You are all caught up'}</b>
          <span>{list.length ? `${unread.length} unread of ${list.length} · worked out from your books just now` : 'Alerts appear here when dues, stock or orders need you.'}</span>
        </div>
        <div className="ntf-hero-stats">
          <span><b>{urgentAll}</b>urgent</span>
          <span><b>{unread.length}</b>unread</span>
          <span><b>{list.length}</b>total</span>
        </div>
      </div>
      <Segmented<Show> label="Show" value={show} onChange={(v) => { setShow(v); setKind('all') }} options={[{ value: 'unread', label: `Unread (${unread.length})` }, { value: 'all', label: `All (${list.length})` }]} />
      {kinds.length > 1 && (
        <div className="ntf-chips" role="group" aria-label="Kind">
          <button type="button" className={cls('ntf-chip', kind === 'all' && 'on')} onClick={() => setKind('all')}>All <small>{base.length}</small></button>
          {kinds.map(({ k, count }) => (
            <button key={k} type="button" className={cls('ntf-chip', kind === k && 'on')} onClick={() => setKind(k)}><Icon name={KIND_ICON[k]} size={14} />{NOTICE_KINDS[k]} <small>{count}</small></button>
          ))}
        </div>
      )}
      {urgent.length > 0 && (
        <>
          <h3 className="ntf-group warn"><Icon name="alert" size={15} />Needs action <small>{urgent.length}</small></h3>
          <ul className="ntf-list">{urgent.map(card)}</ul>
        </>
      )}
      {rest.length > 0 && (
        <>
          <h3 className="ntf-group"><Icon name="bell" size={15} />{urgent.length ? 'For your information' : 'Updates'} <small>{rest.length}</small></h3>
          <ul className="ntf-list">{rest.map(card)}</ul>
        </>
      )}
      {!rows.length && (
        <div className="ntf-empty">
          <span><Icon name="check" size={30} /></span>
          <b>{show === 'unread' ? 'You are all caught up' : 'Nothing needs attention right now'}</b>
          <p className="t-muted">{show === 'unread' ? 'Read alerts are under All.' : 'We will tell you when a bill is overdue, stock runs low or goods are due.'}</p>
          {show === 'unread' && list.length > 0 && <Button variant="secondary" onClick={() => setShow('all')}>See all {list.length}</Button>}
        </div>
      )}
    </Sheet>
  )
}
NotificationsSheet.readOnlySafe = true
