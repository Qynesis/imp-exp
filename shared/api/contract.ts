/** Request and response shapes of the books API, shared by the client and every backend. */
import type { BusinessTypeId, Db } from '../domain/types'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface SessionInfo {
  userId: string
  email: string
  tenantId: string
  /** Signed in by the platform owner through "Open books". */
  viaPlatform?: boolean
}

/** Answer to sign-up, sign-in and opening a company: the session and that company's books. */
export interface BooksResponse {
  token?: string
  session?: SessionInfo
  db: Db
  version: number
}
export interface PlatformLoginResponse {
  platform: true
  token: string
}
export type LoginResponse = BooksResponse | PlatformLoginResponse
export const isPlatformLogin = (r: LoginResponse): r is PlatformLoginResponse => 'platform' in r && r.platform === true

export type BooksPollResponse = BooksResponse | { same: true; version: number }

export interface DemoLogin {
  name: string
  email: string
  role: string
}
export interface StatusResponse {
  ok: boolean
  /** The books live in this browser only. */
  local?: boolean
  problem?: string | null
  demo: { password: string; logins: DemoLogin[] } | null
}

export interface SignupRequest {
  company: string
  name: string
  email: string
  password: string
  businessTypes: BusinessTypeId[]
  sample: boolean
}
export interface LoginRequest {
  email: string
  password: string
}
export interface SaveBooksRequest {
  db: Db
  baseVersion: number
}
export interface NewUserRequest {
  name: string
  email: string
  password: string
  roleId: string
  employeeId: string
}
export interface EditUserRequest {
  id: string
  roleId?: string
  password?: string
}

export interface CompanySummary {
  id: string
  name: string
  createdAt: string
  trades: BusinessTypeId[]
  counts: { products: number; invoices: number; shipments: number }
  users: { id: string; name: string; email: string; role: string }[]
}
