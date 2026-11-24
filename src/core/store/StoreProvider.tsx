/**
 * Holds the signed-in session and this company's books.
 * Changes apply on screen at once and are saved in the background; the books are re-read every
 * 15 seconds and when the window regains focus, so people working together see each other's changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isPlatformLogin, type BooksPollResponse, type BooksResponse, type HttpMethod, type LoginResponse, type StatusResponse } from '@shared/api/contract'
import type { BillingSummary } from '@shared/billing'
import { applyAction, type ActionName, type ActionPayload, type Db } from '@shared/domain'
import { ApiError, request } from '../api/client'
import { getToken, setToken } from '../session/tokens'
import { StoreContext, accessGuard, type Phase, type StoreValue, type SyncState } from './context'

const SAVE_DELAY_MS = 350
const RETRY_MS = 4000
const POLL_MS = 15000

type State = Pick<StoreValue, 'phase' | 'db' | 'session' | 'billing'>
const initialPhase = (): Phase => (getToken() ? 'loading' : getToken('platform') ? 'platform' : 'signedOut')

export function StoreProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(() => ({ phase: initialPhase(), db: null, session: null, billing: null }))
  const [sync, setSync] = useState<SyncState>('saved')
  const [notice, setNotice] = useState('')
  const ref = useRef({ token: getToken(), version: 0, db: null as Db | null, dirty: false, busy: false, timer: 0 as ReturnType<typeof setTimeout> | 0, locked: '' })
  const pushRef = useRef<() => void>(() => undefined)
  // people waiting for the current change to reach the server (saveNow)
  const waiters = useRef<((why: string | null) => void)[]>([])
  const settle = useCallback((why: string | null) => {
    const list = waiters.current
    waiters.current = []
    for (const w of list) w(why)
  }, [])

  const enter = useCallback((r: BooksResponse) => {
    Object.assign(ref.current, { token: r.token ?? ref.current.token, version: r.version, db: r.db, dirty: false })
    if (r.token) setToken(r.token)
    setSt((s) => ({ phase: 'ready', db: r.db, session: r.session || s.session, billing: r.billing || s.billing }))
  }, [])

  const setBilling = useCallback((billing: BillingSummary) => setSt((s) => ({ ...s, billing })), [])

  const leave = useCallback(() => {
    setToken('')
    clearTimeout(ref.current.timer)
    Object.assign(ref.current, { token: '', version: 0, db: null, dirty: false })
    setSt({ phase: getToken('platform') ? 'platform' : 'signedOut', db: null, session: null, billing: null })
  }, [])

  const pull = useCallback(async (force: boolean) => {
    const r = ref.current
    if (!r.token || r.busy || (r.dirty && !force)) return
    try {
      const res = await request<BooksPollResponse>('GET', `books?v=${force ? 0 : r.version}`, undefined, r.token)
      if (!('same' in res)) enter(res)
      else if (res.billing) setBilling(res.billing)
      setSync('saved')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) leave()
      else if (e instanceof ApiError && e.status === 0) setSync('offline')
    }
  }, [enter, leave, setBilling])

  const push = useCallback(async () => {
    const r = ref.current
    if (r.busy || !r.dirty || !r.token || !r.db) return
    r.busy = true
    r.dirty = false
    setSync('saving')
    try {
      const res = await request<{ version: number }>('PUT', 'books', { db: r.db, baseVersion: r.version }, r.token)
      r.version = res.version
      r.busy = false
      if (r.dirty) pushRef.current()
      else {
        setSync('saved')
        settle(null)
      }
    } catch (e) {
      r.busy = false
      const status = e instanceof ApiError ? e.status : 500
      if (status === 401) {
        settle('You were signed out. Sign in again and redo the change.')
        return leave()
      }
      if (status === 0) {
        r.dirty = true
        setSync('offline')
        r.timer = setTimeout(() => pushRef.current(), RETRY_MS)
        // kept on this device and sent when the connection is back
        settle(null)
        return
      }
      // someone else saved first, or the change was not allowed: take the stored copy
      const why = status === 409 ? 'Someone else just changed the books. Reloaded the latest, please redo your last change.' : (e as Error).message || 'The server did not accept the change.'
      setNotice(why)
      settle(why)
      void pull(true)
    }
  }, [leave, pull, settle])

  const saveNow = useCallback(() => new Promise<string | null>((resolve) => {
    const r = ref.current
    if (!r.dirty && !r.busy) return resolve(null)
    waiters.current.push(resolve)
    clearTimeout(r.timer)
    pushRef.current()
  }), [])

  useEffect(() => {
    pushRef.current = () => void push()
  }, [push])

  const act = useCallback(<K extends ActionName>(name: K, payload: ActionPayload<K>): string | null => {
    if (ref.current.locked) {
      setNotice(ref.current.locked)
      return ref.current.locked
    }
    if (accessGuard.readonly) {
      setNotice('Your role can only view this screen.')
      return 'Your role can only view this screen.'
    }
    const cur = ref.current.db
    if (!cur) return 'Not signed in.'
    let next: Db
    try {
      next = applyAction(cur, name, payload)
    } catch (e) {
      // the books refuse with a reason a person can act on, e.g. "Only 70 cartons left on INV-2312"
      const why = e instanceof Error && e.message ? e.message : 'That change could not be made. Reload and try again.'
      console.error(e)
      setNotice(why)
      return why
    }
    ref.current.db = next
    ref.current.dirty = true
    setSt((s) => ({ ...s, db: next }))
    clearTimeout(ref.current.timer)
    ref.current.timer = setTimeout(() => pushRef.current(), SAVE_DELAY_MS)
    return null
  }, [])

  useEffect(() => {
    if (ref.current.token) void pull(true)
    const id = setInterval(() => void pull(false), POLL_MS)
    const onFocus = () => void pull(false)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [pull])

  const api = useMemo(() => {
    const signIn = async (path: 'login' | 'signup', body: unknown) => {
      const res = await request<LoginResponse>('POST', path, body)
      if (!isPlatformLogin(res)) return enter(res)
      setToken(res.token, 'platform')
      setSt({ phase: 'platform', db: null, session: null, billing: null })
    }
    return {
      signIn: signIn as StoreValue['signIn'],
      signOut: () => {
        void request('POST', 'logout', undefined, ref.current.token).catch(() => undefined)
        leave()
      },
      status: () => request<StatusResponse>('GET', 'status'),
      platform: <T,>(method: HttpMethod, path: string, body?: unknown) => request<T>(method, 'platform/' + path, body, getToken('platform')),
      openCompany: async (tenantId: string) => enter(await request<BooksResponse>('POST', 'platform/open', { tenantId }, getToken('platform'))),
      platformSignOut: () => {
        void request('POST', 'logout', undefined, getToken('platform')).catch(() => undefined)
        setToken('', 'platform')
        setSt({ phase: 'signedOut', db: null, session: null, billing: null })
      },
      call: <T,>(method: HttpMethod, path: string, body?: unknown) => request<T>(method, path, body, ref.current.token),
      users: async (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') => enter(await request<BooksResponse>(method, 'users' + query, body, ref.current.token)),
      leave: async (body: unknown) => enter(await request<BooksResponse>('POST', 'leave', body, ref.current.token)),
      workReport: async (body: object) => enter(await request<BooksResponse>('POST', 'work-report', body, ref.current.token)),
      attend: async (body: object) => enter(await request<BooksResponse>('POST', 'attendance', { ...body, tz: new Date().getTimezoneOffset() }, ref.current.token)),
    }
  }, [enter, leave])

  const clearNotice = useCallback(() => setNotice(''), [])
  const value = useMemo<StoreValue>(() => ({ ...st, act, saveNow, sync, notice, clearNotice, setBilling, ...api }), [st, act, saveNow, sync, notice, clearNotice, setBilling, api])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
