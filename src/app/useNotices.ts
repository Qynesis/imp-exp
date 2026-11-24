import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { notifications, type Notice } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { useAccess } from './useAccess'

/* ---------- what this person has read, kept in this browser ---------- */
type ReadMap = Record<string, number>
const listeners = new Set<() => void>()
const keyFor = (tenant: string, user: string) => `sbt-notices:${tenant}:${user}`
const parse = (text: string | null): { read: ReadMap; seen: ReadMap; desktop: boolean } => {
  try {
    const v = JSON.parse(text || '{}') as Partial<{ read: ReadMap; seen: ReadMap; desktop: boolean }>
    return { read: v.read || {}, seen: v.seen || {}, desktop: !!v.desktop }
  } catch {
    return { read: {}, seen: {}, desktop: false }
  }
}
const stored = (key: string) => {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}
export const load = (key: string) => parse(stored(key))
export const save = (key: string, v: ReturnType<typeof load>) => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* private window or full storage: read state just lasts this visit */
  }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Every alert this person may see right now, newest situation first, with read state. */
export function useNotices() {
  const { db, session } = useBooks()
  const { level } = useAccess()
  const key = keyFor(session.tenantId, session.userId)
  const raw = useSyncExternalStore(subscribe, () => stored(key), () => '')
  const state = useMemo(() => parse(raw), [raw])

  const list = useMemo(() => {
    const myEmployee = db.users.find((u) => u.id === session.userId)?.employeeId || ''
    const out: Notice[] = notifications(db).filter((n) => level(n.page) !== 'none' && (!n.forEmployee || n.forEmployee === myEmployee))
    return out
  }, [db, level, session.userId])

  const unread = list.filter((n) => !state.read[n.id])
  const markRead = useCallback((ids: string[]) => {
    const cur = load(key)
    for (const id of ids) cur.read[id] = Date.now()
    // forget old ids so the store does not grow forever
    const live = new Set(list.map((n) => n.id))
    for (const id of Object.keys(cur.read)) if (!live.has(id) && Date.now() - cur.read[id] > 30 * 86400000) delete cur.read[id]
    save(key, cur)
  }, [key, list])
  const markUnread = useCallback((id: string) => {
    const cur = load(key)
    delete cur.read[id]
    save(key, cur)
  }, [key])
  const setDesktop = useCallback((on: boolean) => save(key, { ...load(key), desktop: on }), [key])
  return { list, unread, read: state.read, desktop: state.desktop, markRead, markUnread, setDesktop, key }
}

