/** Request and response shapes of the books API, shared by the client and every backend. */
import type { BillingPayment, BillingSummary } from '../billing'
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
  /** The company's subscription: trial, paid, or ended (then the books are read-only). */
  billing?: BillingSummary
}
export interface PlatformLoginResponse {
  platform: true
  token: string
}
export type LoginResponse = BooksResponse | PlatformLoginResponse
export const isPlatformLogin = (r: LoginResponse): r is PlatformLoginResponse => 'platform' in r && r.platform === true

export type BooksPollResponse = BooksResponse | { same: true; version: number; billing?: BillingSummary }

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
  billing?: BillingSummary
  /** "I paid" claims waiting for the platform owner. */
  claims?: BillingPayment[]
}

/** GET /api/billing */
export interface BillingView {
  summary: BillingSummary
  payments: BillingPayment[]
  /** Pay online is offered (a gateway is set up, or test payments are on). */
  online: boolean
  /** Online payments are simulated: nothing is charged. */
  test: boolean
  /** Where to send money for a manual payment, as the platform owner set it. */
  manual: { bkash?: string; nagad?: string; bank?: string }
  trialDays: number
}

/** POST /api/assistant/chat */
export interface AssistantReply {
  reply: string
  /** The look-ups made to answer, e.g. "dealer_statement". */
  used: string[]
  /** Answered by the AI model (false: the built-in answerer). */
  ai: boolean
}
