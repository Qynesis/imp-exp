import { useEffect, useState } from 'react'
import { fdate, NOTICE_KINDS, type Notice } from '@shared/domain'
import { go } from '@/core/router'
import { Button, cls, Icon, Segmented, Sheet, useSheetItem, useSheets, type SheetComponent } from '@/ui'
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

export const NotificationsSheet: SheetComponent<object> = () => {
  const { list, unread, read, markRead, markUnread, desktop, setDesktop } = useNotices()
  const { close } = useSheetItem()
  const [show, setShow] = useState<Show>(unread.length ? 'unread' : 'all')
  const rows = show === 'unread' ? unread : list
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
  return (
    <Sheet title="Notifications" crumb={`${unread.length} unread`} wide
      footer={
        <>
          {canNotify && <Button variant="ghost" icon="bell" disabled={perm === 'denied' && !desktop} onClick={() => void toggleDesktop()}>{desktop ? 'Desktop alerts on' : perm === 'denied' ? 'Desktop alerts blocked in browser' : 'Turn on desktop alerts'}</Button>}
          <Button variant="secondary" disabled={!unread.length} onClick={() => markRead(unread.map((n) => n.id))}>Mark all as read</Button>
        </>
      }>
      <Segmented<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'unread', label: `Unread (${unread.length})` }, { value: 'all', label: `All (${list.length})` }]} />
      <div className="notice-list">
        {rows.map((n) => (
          <div key={n.id} className={cls('notice', n.tone, !read[n.id] && 'unread')}>
            <button type="button" className="notice-main" onClick={() => open(n)}>
              <span className="notice-dot" aria-hidden="true" />
              <span className="notice-text">
                <b>{n.title}</b>
                <span>{n.body}</span>
                <small>{NOTICE_KINDS[n.kind]} · {fdate(n.date)}</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
            <button type="button" className="link notice-toggle" onClick={() => (read[n.id] ? markUnread(n.id) : markRead([n.id]))}>{read[n.id] ? 'Mark unread' : 'Mark read'}</button>
          </div>
        ))}
        {!rows.length && <p className="t-muted notice-empty">{show === 'unread' ? 'You are all caught up.' : 'Nothing needs attention right now.'}</p>}
      </div>
    </Sheet>
  )
}
NotificationsSheet.readOnlySafe = true
