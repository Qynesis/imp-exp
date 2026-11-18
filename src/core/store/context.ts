import { createContext, useContext } from 'react'
import type { HttpMethod, LoginRequest, SessionInfo, SignupRequest, StatusResponse } from '@shared/api/contract'
import type { ActionName, ActionPayload, Db } from '@shared/domain'

export type Phase = 'loading' | 'signedOut' | 'platform' | 'ready'
export type SyncState = 'saved' | 'saving' | 'offline'

export interface StoreValue {
  phase: Phase
  db: Db | null
  session: SessionInfo | null
  sync: SyncState
  /** A message for the person, shown once as a toast. */
  notice: string
  clearNotice(): void
  /** Change the books. Applies on screen at once and is saved in the background. */
  act<K extends ActionName>(name: K, payload: ActionPayload<K>): void
  signIn(path: 'login', body: LoginRequest): Promise<void>
  signIn(path: 'signup', body: SignupRequest): Promise<void>
  signOut(): void
  status(): Promise<StatusResponse>
  /** Platform owner calls: list companies, reset a password. */
  platform<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>
  openCompany(tenantId: string): Promise<void>
  platformSignOut(): void
  /** User management goes through the API because it owns the passwords. */
  users(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query?: string): Promise<void>
  /** Any other API call made as the signed-in user, e.g. courier booking. */
  call<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore must be used inside <StoreProvider>')
  return v
}

/** For screens inside the signed-in app, where books and session are always there. */
export function useBooks() {
  const s = useStore()
  if (!s.db || !s.session) throw new Error('useBooks needs a signed-in company')
  return { ...s, db: s.db, session: s.session }
}

/**
 * Set by the app shell: true while the signed-in role may only view the current screen.
 * Changes and editing sheets are refused while it is set.
 */
export const accessGuard = { readonly: false }
