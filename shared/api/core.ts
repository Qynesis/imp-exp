/**
 * The books API, independent of where it runs. The same routes back the Node server, the Vercel
 * function and the browser-only mode; only the storage (KvStore) and the hashing (CryptoKit) differ.
 *
 * Keys in the store:
 *   platform          {salt, hash}                     the platform owner's password
 *   account:<email>   {tenantId, userId, salt, hash}   one per sign-in
 *   session:<digest>  {email, exp, platform?, as?}     signed-in tokens (stored hashed)
 *   tenant:<id>       {name, createdAt}                one per company
 *   books:<id>        {version, db}                    that company's books
 *   billing:<id>      BillingRecord                    trial, plan, paid until, payments
 *   billingtx:<tran>  {tenantId}                       finds the company when the payment gateway calls back
 */
import {
  gatewayReady, GatewayError, markPaid, newBilling, planById, startCheckout, summarize, validatePayment,
  type BillingPayment, type BillingRecord, type GatewayKeys, type PayMethod,
} from '../billing'
import { localAnswer } from '../assistant/local'
import { applyBusinessTypes, isBusinessType } from '../domain/catalog'
import { MESSAGING_FIELDS, MessagingError, sendMessage, type MessagingKeys } from '../messaging'
import { bookParcel, COURIER_PROVIDERS, courierAreas, courierBalance, CourierError, FIELDS, parcelStatus, testCourier, trackParcel, type BookRequest, type CourierKeys } from '../courier'
import { defaultRoles, isAdmin, OWNER_ROLE_ID } from '../domain/permissions'
import { applyAction } from '../domain/actions'
import { demoDb, emptyDb } from '../domain/seed'
import { isDb, type CourierProvider, type Db, type MessageChannel } from '../domain/types'
import type { BillingView, CompanySummary, DemoLogin, HttpMethod, SessionInfo, StatusResponse } from './contract'

/* ---------- ports ---------- */
export interface Account {
  tenantId: string
  userId: string
  salt: string
  hash: string
}
export interface Session {
  email: string
  exp: number
  platform?: boolean
  /** The platform owner acting as a company's owner. */
  as?: { tenantId: string; userId: string }
}
export interface TenantBooks {
  version: number
  db: Db
}
export interface TenantInfo {
  name: string
  createdAt: string
}

export interface KvStore {
  /** False when the store is not set up; `problem` then says why. */
  ok: boolean
  problem?: string
  kind: string
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  list<T>(prefix: string): Promise<{ key: string; value: T }[]>
  /** Save books only if the stored version is still `expectedVersion`. */
  cas(key: string, expectedVersion: number, value: TenantBooks): Promise<boolean>
  audit(line: string): Promise<void>
  /** Tell the operator a password generated on first start. */
  generatedPassword(email: string, password: string): Promise<void>
}

export interface CryptoKit {
  /** Slow, salted password hash. */
  hashPassword(password: string, salt: string): Promise<string>
  /** Fast digest for storing session tokens. */
  digest(value: string): Promise<string>
  randomHex(bytes: number): string
  /** Constant-time comparison. */
  equal(a: string, b: string): boolean
}

/** One turn of the assistant chat, as text. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}
export interface AssistantRequest {
  db: Db
  userId: string
  messages: ChatTurn[]
}
/** Answers with an AI model; supplied by the server when it has a key. */
export type AssistantRunner = (req: AssistantRequest) => Promise<{ reply: string; used: string[] }>

export interface ApiOptions {
  platformEmail: string
  /** When unset, a password is generated once and handed to `store.generatedPassword`. */
  platformPassword?: string
  demo: boolean
  demoPassword: string
  /** Browser-only mode lists the platform owner among the demo logins. */
  listPlatformInDemo?: boolean
  local?: boolean
  /** Courier keys from the server's environment, per courier. They win over keys saved in the app and never reach a browser. */
  courier?: Partial<Record<CourierProvider, Omit<CourierKeys, 'provider'>>>
  /** WhatsApp and SMS keys from the server's environment. */
  messaging?: Partial<Record<MessageChannel, MessagingKeys>>
  /** The AI assistant. Without it, questions are answered by the built-in answerer. */
  assistant?: AssistantRunner
  billing?: {
    /** Days of free trial for a new company (default 14). */
    trialDays?: number
    /** Simulate online payments when no gateway is set up: for the demo and the browser-only mode. */
    testPayments?: boolean
    gateway?: GatewayKeys
    /** The app's public address, e.g. https://app.example.com, for the gateway to send people back to. */
    publicUrl?: string
    /** Where customers send money for a manual payment. */
    manual?: { bkash?: string; nagad?: string; bank?: string }
  }
}

export interface ApiRequest {
  method: HttpMethod | string
  /** Route path without the /api/ prefix, e.g. "books" or "platform/companies". */
  path: string
  query: URLSearchParams
  body: unknown
  token: string
  /** For rate limiting sign-in attempts. */
  client: string
}
export interface ApiResponse {
  status: number
  body: unknown
  /** Send the browser to this address instead (the payment gateway's return). */
  redirect?: string
}
/** A handler's answer that sends the browser elsewhere. */
class Redirect {
  constructor(public url: string) {}
}

export class ApiFailure extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const bad = (message: string) => new ApiFailure(400, message)

/* ---------- helpers ---------- */
const SESSION_MS = 30 * 86400000
const PLATFORM_OPEN_MS = 4 * 3600000
/** [user id, name, email, role, linked employee] */
export const DEMO_USERS = [
  ['u1', 'Demo Owner', 'owner@demo.com', 'owner', ''],
  ['u2', 'Demo Accountant', 'accountant@demo.com', 'accountant', 'e1'],
  ['u3', 'Demo Sales', 'sales@demo.com', 'sales', 'e4'],
  ['u4', 'Demo Warehouse', 'warehouse@demo.com', 'warehouse', 'e2'],
  ['u5', 'Rina Akter', 'employee@demo.com', 'staff', 'e5'],
] as const
const DEMO_TENANT = 'demo'

export const cleanEmail = (e: unknown): string => String(e ?? '').trim().toLowerCase()
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const needPassword = (pw: string) => {
  if (pw.length < 8) throw bad('Use a password of at least 8 characters.')
}

type Ctx = { token: string; email: string; acc: Account; tenant: TenantBooks }
type Handler = (req: ApiRequest) => Promise<unknown>

export function createApi(store: KvStore, kit: CryptoKit, opts: ApiOptions) {
  const PLATFORM = cleanEmail(opts.platformEmail)

  /* ----- one-time setup: platform password and demo company ----- */
  let readyPromise: Promise<void> | null = null
  const ready = () =>
    (readyPromise ||= setup().catch((e: unknown) => {
      readyPromise = null
      throw e
    }))

  async function setup() {
    if (!store.ok) return
    const plat = await store.get<{ salt: string; hash: string }>('platform')
    if (opts.platformPassword) {
      if (!plat || !kit.equal(await kit.hashPassword(opts.platformPassword, plat.salt), plat.hash)) {
        const salt = kit.randomHex(16)
        await store.set('platform', { salt, hash: await kit.hashPassword(opts.platformPassword, salt) })
      }
    } else if (!plat) {
      const pw = kit.randomHex(9)
      const salt = kit.randomHex(16)
      await store.set('platform', { salt, hash: await kit.hashPassword(pw, salt) })
      await store.generatedPassword(PLATFORM, pw)
    }

    if (opts.demo) {
      if (!(await store.get('books:' + DEMO_TENANT))) {
        const db = demoDb()
        db.company.name = 'Star Bangla Demo'
        db.company.logo = '/brand-logo.png' // the demo customer's own logo
        applyBusinessTypes(db, ['general', 'electronics', 'medical'])
        db.users = DEMO_USERS.map(([id, name, email, roleId, employeeId]) => ({ id, name, email, roleId, employeeId }))
        await store.set('books:' + DEMO_TENANT, { version: 1, db } satisfies TenantBooks)
        await store.set('tenant:' + DEMO_TENANT, { name: db.company.name, createdAt: new Date().toISOString() } satisfies TenantInfo)
      } else {
        // demo books made by an older version: add the employee login and its role
        const books = await store.get<TenantBooks>('books:' + DEMO_TENANT)
        if (books && !books.db.users.some((u) => u.id === 'u5')) {
          const staff = defaultRoles().find((r) => r.id === 'staff')
          if (staff && !books.db.roles.some((r) => r.id === 'staff')) books.db.roles.push(staff)
          for (const [id, name, email, roleId, employeeId] of DEMO_USERS) {
            const u = books.db.users.find((x) => x.id === id)
            const linked = books.db.employees.some((e) => e.id === employeeId) ? employeeId : ''
            if (!u) books.db.users.push({ id, name, email, roleId, employeeId: linked })
            else if (!u.employeeId) u.employeeId = linked
          }
          books.version++
          await store.set('books:' + DEMO_TENANT, books)
        }
      }
      for (const [userId, , email] of DEMO_USERS) {
        const acc = await store.get<Account>('account:' + email)
        if (acc?.tenantId === DEMO_TENANT && kit.equal(await kit.hashPassword(opts.demoPassword, acc.salt), acc.hash)) continue
        const salt = kit.randomHex(16)
        await store.set('account:' + email, { tenantId: DEMO_TENANT, userId, salt, hash: await kit.hashPassword(opts.demoPassword, salt) } satisfies Account)
      }
    } else {
      // demo logins switched off: make sure nobody can still use them
      for (const [, , email] of DEMO_USERS) {
        const acc = await store.get<Account>('account:' + email)
        if (acc?.tenantId === DEMO_TENANT) await store.del('account:' + email)
      }
    }
  }

  /* ----- sessions ----- */
  const newSession = async (email: string, extra: Partial<Session> = {}) => {
    const token = kit.randomHex(32)
    await store.set('session:' + (await kit.digest(token)), { email, exp: Date.now() + SESSION_MS, ...extra } satisfies Session)
    return token
  }
  const dropSessions = async (email: string, keepToken?: string) => {
    const keep = keepToken ? 'session:' + (await kit.digest(keepToken)) : ''
    for (const { key, value } of await store.list<Session>('session:')) if (value.email === email && key !== keep) await store.del(key)
  }
  const sessionOf = async (token: string) => (token ? store.get<Session>('session:' + (await kit.digest(token))) : null)

  async function auth(req: ApiRequest): Promise<Ctx> {
    const s = await sessionOf(req.token)
    if (!s || s.exp < Date.now()) throw new ApiFailure(401, 'Please sign in again.')
    if (s.platform) throw new ApiFailure(403, 'Open a company first.')
    const acc = s.as ? ({ ...s.as, salt: '', hash: '' } as Account) : await store.get<Account>('account:' + s.email)
    if (!acc) throw new ApiFailure(401, 'This account no longer exists.')
    const tenant = await store.get<TenantBooks>('books:' + acc.tenantId)
    if (!tenant) throw new ApiFailure(401, 'This company no longer exists.')
    return { token: req.token, email: s.email, acc, tenant }
  }
  async function platformAuth(req: ApiRequest) {
    const s = await sessionOf(req.token)
    if (!s || s.exp < Date.now() || !s.platform) throw new ApiFailure(401, 'Please sign in as the platform owner.')
  }
  const needAdmin = (ctx: Ctx) => {
    if (!isAdmin(ctx.tenant.db, ctx.acc.userId)) throw new ApiFailure(403, 'Only an admin can do that.')
  }
  const sessionInfo = (ctx: Ctx): SessionInfo => ({ userId: ctx.acc.userId, email: ctx.email, tenantId: ctx.acc.tenantId, viaPlatform: ctx.email === PLATFORM })
  /** Save books only if nobody saved in between. */
  const saveBooks = async (ctx: Ctx) => {
    const base = ctx.tenant.version
    ctx.tenant.version = base + 1
    if (!(await store.cas('books:' + ctx.acc.tenantId, base, ctx.tenant))) throw new ApiFailure(409, 'Someone else changed the books.')
  }
  /** Anyone allowed to change something in the books may book a parcel. */
  const needEditor = (ctx: Ctx) => {
    const me = ctx.tenant.db.users.find((u) => u.id === ctx.acc.userId)
    const role = me && ctx.tenant.db.roles.find((r) => r.id === me.roleId)
    if (!role || (role.id !== OWNER_ROLE_ID && !Object.values(role.perms).includes('edit'))) throw new ApiFailure(403, 'Your role is view-only.')
  }
  /** A courier's keys: the server's environment first, then what an admin saved for this company. */
  const keysFor = async (ctx: Ctx, provider: CourierProvider): Promise<CourierKeys> => {
    const env = opts.courier?.[provider]
    if (env && Object.entries(env).some(([k, v]) => k !== 'baseUrl' && v)) return { provider, ...env }
    const saved = (await store.get<Omit<CourierKeys, 'provider'>>(`courier:${ctx.acc.tenantId}:${provider}`)) ||
      // keys saved before several couriers were supported belonged to Steadfast
      (provider === 'steadfast' ? await store.get<Omit<CourierKeys, 'provider'>>('courier:' + ctx.acc.tenantId) : null) || {}
    return { provider, ...saved }
  }
  const withKeys = async <T,>(ctx: Ctx, asked: unknown, run: (k: CourierKeys) => Promise<T>, test?: unknown): Promise<T> => {
    const provider = (COURIER_PROVIDERS.includes(asked as CourierProvider) ? asked : ctx.tenant.db.company.courier?.provider || 'demo') as CourierProvider
    // test mode for the company, or a sample parcel, never reaches a real courier
    const simulate = !!ctx.tenant.db.company.courier?.testMode || test === true
    return run({ ...(await keysFor(ctx, provider)), test: simulate })
  }
  /** WhatsApp or SMS keys: the server's environment first, then what an admin saved for this company. */
  const msgKeys = async (ctx: Ctx, ch: MessageChannel): Promise<MessagingKeys> => {
    const env = opts.messaging?.[ch]
    if (env && Object.values(env).some(Boolean)) return env
    return (await store.get<MessagingKeys>(`messaging:${ctx.acc.tenantId}:${ch}`)) || {}
  }
  /** Courier failures become a clear message for the person, not a server error. */
  const courierCall = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (e) {
      if (e instanceof CourierError) throw new ApiFailure(502, e.message)
      throw e
    }
  }
  const emailTaken = async (email: string) => email === PLATFORM || !!(await store.get('account:' + email))

  /* ----- subscriptions ----- */
  const B = opts.billing || {}
  const trialDays = B.trialDays && B.trialDays > 0 ? B.trialDays : 14
  /** A company's subscription. Companies made before subscriptions start a fresh trial today. */
  const billingOf = async (tenantId: string): Promise<BillingRecord> => {
    const rec = await store.get<BillingRecord>('billing:' + tenantId)
    if (rec) return rec
    const fresh = tenantId === DEMO_TENANT ? { ...newBilling(Date.now(), trialDays), plan: 'free' as const } : newBilling(Date.now(), trialDays)
    await store.set('billing:' + tenantId, fresh)
    return fresh
  }
  const billingSummary = async (tenantId: string) => summarize(await billingOf(tenantId), Date.now())
  /** Changes stop when the subscription has ended. The platform owner can still fix things. */
  const needActive = async (ctx: Ctx) => {
    if (ctx.email === PLATFORM) return
    if ((await billingSummary(ctx.acc.tenantId)).status === 'expired') {
      throw new ApiFailure(402, 'Your subscription has ended, so changes cannot be saved. Choose a plan in Settings → Subscription to continue.')
    }
  }
  const billingView = async (tenantId: string): Promise<BillingView> => {
    const rec = await billingOf(tenantId)
    return {
      summary: summarize(rec, Date.now()),
      payments: [...rec.payments].reverse(),
      online: gatewayReady(B.gateway) || !!B.testPayments,
      test: !gatewayReady(B.gateway) && !!B.testPayments,
      manual: B.manual || {},
      trialDays,
    }
  }
  const newPayment = (rec: BillingRecord, tenantId: string, p: Omit<BillingPayment, 'id' | 'at'>): BillingPayment => {
    rec.seq++
    const pay: BillingPayment = { ...p, id: `SUB-${tenantId.slice(0, 4).toUpperCase()}-${rec.seq}`, at: new Date().toISOString() }
    rec.payments.push(pay)
    return pay
  }
  const appLink = (hash: string) => `${(B.publicUrl || '').replace(/\/+$/, '')}/#/${hash}`

  // slow down password guessing: 8 failed sign-ins per client and address per 10 minutes
  const fails = new Map<string, { n: number; until: number }>()
  const chats = new Map<string, { n: number; until: number }>()
  const tooMany = (key: string) => {
    const f = fails.get(key)
    return !!f && f.until > Date.now() && f.n >= 8
  }
  const noteFail = (key: string) => {
    const f = fails.get(key)
    if (!f || f.until < Date.now()) fails.set(key, { n: 1, until: Date.now() + 600000 })
    else f.n++
  }

  /* ----- routes ----- */
  const routes: Record<string, Handler> = {
    'GET status': async (): Promise<StatusResponse> => {
      const logins: DemoLogin[] = DEMO_USERS.map(([, name, email, roleId]) => ({ name, email, role: roleId === 'staff' ? 'Employee' : roleId[0].toUpperCase() + roleId.slice(1) }))
      if (opts.listPlatformInDemo) logins.push({ name: 'Platform owner', email: PLATFORM, role: 'Platform owner' })
      return {
        ok: store.ok,
        local: opts.local,
        problem: store.ok ? null : store.problem,
        demo: store.ok && opts.demo ? { password: opts.demoPassword, logins } : null,
      }
    },

    'POST signup': async (req) => {
      const b = obj(req.body)
      const email = cleanEmail(b.email)
      const company = str(b.company).trim()
      const name = str(b.name).trim()
      if (!company) throw bad('Enter your company name.')
      if (!name) throw bad('Enter your name.')
      if (!validEmail(email)) throw bad('Enter a valid email address.')
      needPassword(str(b.password))
      if (await emailTaken(email)) throw new ApiFailure(409, 'That email already has an account. Sign in instead.')
      const types = (Array.isArray(b.businessTypes) ? b.businessTypes : []).filter(isBusinessType)
      const db = b.sample ? demoDb() : emptyDb()
      db.company.name = company
      db.users = [{ id: 'u1', name, email, roleId: OWNER_ROLE_ID, employeeId: '' }]
      applyBusinessTypes(db, types.length ? types : ['general'])
      const tenantId = kit.randomHex(8)
      const salt = kit.randomHex(16)
      await store.set('books:' + tenantId, { version: 1, db } satisfies TenantBooks)
      await store.set('tenant:' + tenantId, { name: company, createdAt: new Date().toISOString() } satisfies TenantInfo)
      await store.set('account:' + email, { tenantId, userId: 'u1', salt, hash: await kit.hashPassword(str(b.password), salt) } satisfies Account)
      await store.set('billing:' + tenantId, newBilling(Date.now(), trialDays))
      return { token: await newSession(email), session: { userId: 'u1', email, tenantId }, db, version: 1, billing: await billingSummary(tenantId) }
    },

    'POST login': async (req) => {
      const b = obj(req.body)
      const email = cleanEmail(b.email)
      const pw = str(b.password)
      const key = `${req.client}|${email}`
      if (tooMany(key)) throw new ApiFailure(429, 'Too many attempts. Wait ten minutes and try again.')
      if (email === PLATFORM) {
        const plat = await store.get<{ salt: string; hash: string }>('platform')
        if (!plat || !kit.equal(await kit.hashPassword(pw, plat.salt), plat.hash)) {
          noteFail(key)
          throw new ApiFailure(401, 'Wrong email or password.')
        }
        await store.audit(`platform sign-in from ${req.client}`)
        return { platform: true, token: await newSession(email, { platform: true }) }
      }
      const acc = await store.get<Account>('account:' + email)
      // hash even when the account is unknown so the timing does not reveal which emails exist
      const hash = await kit.hashPassword(pw, acc?.salt || 'no-such-account')
      if (!acc || !kit.equal(hash, acc.hash)) {
        noteFail(key)
        throw new ApiFailure(401, 'Wrong email or password.')
      }
      const tenant = await store.get<TenantBooks>('books:' + acc.tenantId)
      if (!tenant) throw new ApiFailure(401, 'This company no longer exists.')
      return { token: await newSession(email), session: { userId: acc.userId, email, tenantId: acc.tenantId }, db: tenant.db, version: tenant.version, billing: await billingSummary(acc.tenantId) }
    },

    'POST logout': async (req) => {
      if (req.token) await store.del('session:' + (await kit.digest(req.token)))
      return { ok: true }
    },

    'GET books': async (req) => {
      const ctx = await auth(req)
      const billing = await billingSummary(ctx.acc.tenantId)
      if (Number(req.query.get('v')) === ctx.tenant.version) return { same: true, version: ctx.tenant.version, billing }
      return { session: sessionInfo(ctx), db: ctx.tenant.db, version: ctx.tenant.version, billing }
    },

    'PUT books': async (req) => {
      const ctx = await auth(req)
      const { db: cur, version } = ctx.tenant
      const b = obj(req.body)
      const next = b.db
      if (!isDb(next)) throw bad('Those are not valid books.')
      if (b.baseVersion !== version) throw new ApiFailure(409, 'Someone else changed the books.')
      await needActive(ctx)
      const uid = ctx.acc.userId
      const me = cur.users.find((u) => u.id === uid)
      const myRole = me && cur.roles.find((r) => r.id === me.roleId)
      if (!myRole) throw new ApiFailure(403, 'Your role was removed.')
      const admin = isAdmin(cur, uid)
      if (!admin && !Object.values(myRole.perms).includes('edit')) throw new ApiFailure(403, 'Your role is view-only.')
      next.users = cur.users // users only change through the users routes
      if (!admin) {
        // only an admin may change roles, company details and custom fields
        next.roles = cur.roles
        next.company = cur.company
        next.fieldDefs = cur.fieldDefs
        next.businessTypes = cur.businessTypes
      } else if (!next.roles?.some((r) => r.id === OWNER_ROLE_ID)) throw bad('The Owner role cannot be removed.')
      ctx.tenant.db = next
      await saveBooks(ctx)
      return { version: ctx.tenant.version }
    },

    /* ----- courier ----- */
    'GET courier/settings': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const hint = (x?: string) => (x ? `•••• ${x.slice(-4)}` : '')
      const out: Record<string, { hints: Record<string, string>; configured: boolean; fromServer: boolean }> = {}
      for (const p of COURIER_PROVIDERS) {
        const env = opts.courier?.[p]
        const fromServer = !!env && Object.values(env).some(Boolean)
        const k = await keysFor(ctx, p)
        const hints: Record<string, string> = {}
        for (const f of FIELDS[p]) hints[f.key] = f.key === 'baseUrl' || f.key === 'storeId' || f.key === 'username' ? k[f.key] || '' : hint(k[f.key])
        out[p] = { hints, configured: FIELDS[p].every((f) => f.key === 'baseUrl' || !!k[f.key]), fromServer }
      }
      return out
    },
    'PUT courier/settings': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = obj(req.body)
      const provider = str(b.provider) as CourierProvider
      if (!COURIER_PROVIDERS.includes(provider)) throw bad('Which courier?')
      const key = `courier:${ctx.acc.tenantId}:${provider}`
      const cur = (await store.get<Omit<CourierKeys, 'provider'>>(key)) || {}
      const values = obj(b.values)
      // an empty box keeps what was saved; `clear` removes everything for this courier
      const next: Omit<CourierKeys, 'provider'> = {}
      if (!b.clear) for (const f of FIELDS[provider]) next[f.key] = str(values[f.key]).trim() || (f.key === 'baseUrl' ? '' : cur[f.key] || '')
      await store.set(key, next)
      await store.audit(`courier ${provider} keys ${b.clear ? 'removed' : 'saved'} for ${ctx.acc.tenantId}`)
      return { ok: true }
    },
    'POST courier/book': async (req) => {
      const ctx = await auth(req)
      needEditor(ctx)
      await needActive(ctx)
      const b = obj(req.body)
      const r: BookRequest = {
        invoice: str(b.invoice), name: str(b.name), phone: str(b.phone), address: str(b.address), cod: Number(b.cod) || 0, note: str(b.note),
        weight: Number(b.weight) || undefined, quantity: Number(b.quantity) || undefined, cityId: str(b.cityId), zoneId: str(b.zoneId), areaId: str(b.areaId), areaName: str(b.areaName),
      }
      if (!r.invoice || !r.name || !r.phone || !r.address) throw bad('Name, phone and address are needed to book a parcel.')
      return courierCall(() => withKeys(ctx, b.provider, (k) => bookParcel(k, r)))
    },
    'POST courier/status': async (req) => {
      const ctx = await auth(req)
      const b = obj(req.body)
      const id = str(b.consignmentId)
      if (!id) throw bad('Which parcel?')
      return courierCall(async () => ({ status: await withKeys(ctx, b.provider, (k) => parcelStatus(k, id), b.test) }))
    },
    'POST courier/track': async (req) => {
      const ctx = await auth(req)
      const b = obj(req.body)
      const code = str(b.code).trim()
      if (!code) throw bad('Enter a tracking code or consignment number.')
      return courierCall(() => withKeys(ctx, b.provider, (k) => trackParcel(k, code), b.test))
    },
    'POST courier/areas': async (req) => {
      const ctx = await auth(req)
      const b = obj(req.body)
      return courierCall(async () => ({ areas: await withKeys(ctx, b.provider, (k) => courierAreas(k, str(b.parentId))) }))
    },
    'POST courier/balance': async (req) => {
      const ctx = await auth(req)
      const b = obj(req.body)
      return courierCall(async () => ({ balance: await withKeys(ctx, b.provider, (k) => courierBalance(k)) }))
    },
    'POST courier/test': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = obj(req.body)
      return courierCall(async () => ({ message: await withKeys(ctx, b.provider, (k) => testCourier(k)) }))
    },

    /* ----- WhatsApp and SMS ----- */
    'GET messaging/settings': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const out: Record<string, { hints: Record<string, string>; configured: boolean; fromServer: boolean }> = {}
      for (const ch of ['whatsapp', 'sms'] as MessageChannel[]) {
        const k = await msgKeys(ctx, ch)
        const hints: Record<string, string> = {}
        for (const f of MESSAGING_FIELDS[ch]) hints[f.key] = f.secret ? (k[f.key] ? `•••• ${String(k[f.key]).slice(-4)}` : '') : k[f.key] || ''
        const env = opts.messaging?.[ch]
        out[ch] = { hints, configured: ch === 'whatsapp' ? !!(k.token && k.phoneNumberId) : !!(k.apiKey && k.senderId), fromServer: !!env && Object.values(env).some(Boolean) }
      }
      return out
    },
    'PUT messaging/settings': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = obj(req.body)
      const ch = str(b.channel) as MessageChannel
      if (ch !== 'whatsapp' && ch !== 'sms') throw bad('Which channel?')
      const key = `messaging:${ctx.acc.tenantId}:${ch}`
      const cur = (await store.get<MessagingKeys>(key)) || {}
      const values = obj(b.values)
      const next: MessagingKeys = {}
      // an empty box keeps what was saved; `clear` removes everything for this channel
      if (!b.clear) for (const f of MESSAGING_FIELDS[ch]) next[f.key] = str(values[f.key]).trim() || cur[f.key] || ''
      await store.set(key, next)
      await store.audit(`messaging ${ch} keys ${b.clear ? 'removed' : 'saved'} for ${ctx.acc.tenantId}`)
      return { ok: true }
    },
    'POST messaging/send': async (req) => {
      const ctx = await auth(req)
      needEditor(ctx)
      await needActive(ctx)
      const b = obj(req.body)
      const ch = str(b.channel) as MessageChannel
      if (ch !== 'whatsapp' && ch !== 'sms') throw bad('Which channel?')
      const test = !!ctx.tenant.db.company.messaging?.testMode || b.test === true
      try {
        return { id: await sendMessage(ch, { ...(await msgKeys(ctx, ch)), test }, str(b.to), str(b.text)) }
      } catch (e) {
        if (e instanceof MessagingError) throw new ApiFailure(502, e.message)
        throw e
      }
    },

    /* ----- subscription ----- */
    'GET billing': async (req) => {
      const ctx = await auth(req)
      return billingView(ctx.acc.tenantId)
    },
    /** "I paid by bKash / bank transfer": waits for the platform owner to check and approve. */
    'POST billing/claim': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = obj(req.body)
      const plan = planById(str(b.plan))
      const method = str(b.method) as PayMethod
      const tranId = str(b.tranId).trim()
      if (!plan) throw bad('Choose a plan.')
      if (!['bkash', 'nagad', 'rocket', 'bank'].includes(method)) throw bad('How did you pay?')
      if (tranId.length < 4) throw bad('Enter the transaction ID from your payment message or bank slip.')
      const rec = await billingOf(ctx.acc.tenantId)
      if (rec.payments.some((p) => p.tranId.toLowerCase() === tranId.toLowerCase() && p.status !== 'rejected')) throw new ApiFailure(409, 'That transaction ID was already sent.')
      const pay = newPayment(rec, ctx.acc.tenantId, {
        tranId, plan: plan.id, months: plan.months, amount: plan.price, method, sender: str(b.sender).trim().slice(0, 60),
        paidOn: str(b.paidOn).slice(0, 10), note: str(b.note).trim().slice(0, 300), status: 'pending', by: ctx.email,
      })
      await store.set('billing:' + ctx.acc.tenantId, rec)
      await store.audit(`billing claim ${pay.id} ${plan.id} ${method} ${tranId} for ${ctx.acc.tenantId}`)
      return billingView(ctx.acc.tenantId)
    },
    /** Start paying online. Returns the gateway's page, or `test` when payments are simulated. */
    'POST billing/checkout': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const plan = planById(str(obj(req.body).plan))
      if (!plan) throw bad('Choose a plan.')
      const live = gatewayReady(B.gateway)
      if (!live && !B.testPayments) throw bad('Online payment is not set up yet. Pay by bKash or bank transfer and press “I paid”.')
      if (live && !B.publicUrl) throw new ApiFailure(503, 'The server needs APP_URL set before it can take payments online.')
      const rec = await billingOf(ctx.acc.tenantId)
      const tranId = ('SB' + ctx.acc.tenantId.slice(0, 4) + Date.now().toString(36) + kit.randomHex(2)).toUpperCase()
      const pay = newPayment(rec, ctx.acc.tenantId, { tranId, plan: plan.id, months: plan.months, amount: plan.price, method: live ? 'online' : 'test', status: 'started', by: ctx.email })
      await store.set('billing:' + ctx.acc.tenantId, rec)
      if (!live) return { test: true, tranId, amount: plan.price, id: pay.id }
      await store.set('billingtx:' + tranId, { tenantId: ctx.acc.tenantId })
      const me = ctx.tenant.db.users.find((u) => u.id === ctx.acc.userId)
      try {
        const url = await startCheckout(B.gateway!, {
          tranId, amount: plan.price, plan: plan.label, returnUrl: `${B.publicUrl!.replace(/\/+$/, '')}/api/billing/return`,
          company: ctx.tenant.db.company.name, email: ctx.email, phone: ctx.tenant.db.company.phone || '',
        })
        await store.audit(`billing checkout ${pay.id} ${plan.id} for ${ctx.acc.tenantId} by ${me?.email || ctx.email}`)
        return { url }
      } catch (e) {
        pay.status = 'failed'
        pay.reason = (e as Error).message
        await store.set('billing:' + ctx.acc.tenantId, rec)
        if (e instanceof GatewayError) throw new ApiFailure(502, e.message)
        throw e
      }
    },
    /** Finish a simulated payment (test mode only). */
    'POST billing/test-pay': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      if (gatewayReady(B.gateway) || !B.testPayments) throw bad('Test payments are off.')
      const b = obj(req.body)
      const rec = await billingOf(ctx.acc.tenantId)
      const pay = rec.payments.find((p) => p.tranId === str(b.tranId) && p.status === 'started')
      if (!pay) throw bad('That payment is not waiting.')
      if (b.result === 'paid') markPaid(rec, pay, Date.now(), 'Test')
      else pay.status = 'cancelled'
      await store.set('billing:' + ctx.acc.tenantId, rec)
      return billingView(ctx.acc.tenantId)
    },
    /** The payment gateway sends the person (and its server, for IPN) back here. Checked with the gateway before anything is marked paid. */
    'POST billing/return': async (req) => {
      const b = obj(req.body)
      const tranId = str(b.tran_id)
      const ipn = req.query.get('ipn') === '1'
      const done = (outcome: string) => (ipn ? { ok: true } : new Redirect(appLink(`settings/billing?payment=${outcome}`)))
      const link = tranId ? await store.get<{ tenantId: string }>('billingtx:' + tranId) : null
      if (!link) return done('unknown')
      const rec = await billingOf(link.tenantId)
      const pay = rec.payments.find((p) => p.tranId === tranId)
      if (!pay) return done('unknown')
      if (pay.status === 'paid') return done('paid')
      const valId = str(b.val_id)
      if (valId && gatewayReady(B.gateway)) {
        const v = await validatePayment(B.gateway, valId).catch(() => null)
        if (v?.ok && v.tranId === tranId && v.amount + 0.001 >= pay.amount) {
          markPaid(rec, pay, Date.now(), v.channel)
          await store.set('billing:' + link.tenantId, rec)
          await store.audit(`billing paid online ${pay.id} ${pay.plan} ${tranId} for ${link.tenantId}`)
          return done('paid')
        }
      }
      if (pay.status === 'started') {
        pay.status = str(b.status).toUpperCase() === 'CANCELLED' ? 'cancelled' : 'failed'
        pay.reason = str(b.error) || str(b.failedreason) || undefined
        await store.set('billing:' + link.tenantId, rec)
      }
      return done(pay.status)
    },

    /* ----- attached documents (money receipts, slips, challans) ----- */
    /** Keep a file for this company. The books only hold its id, name and size. */
    'POST files': async (req) => {
      const ctx = await auth(req)
      needEditor(ctx)
      await needActive(ctx)
      const b = obj(req.body)
      const name = str(b.name).trim().slice(0, 120) || 'document'
      const type = str(b.type)
      const data = str(b.data)
      if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(type)) throw bad('Attach a photo (JPG, PNG, WebP) or a PDF.')
      if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw bad('That file could not be read.')
      const size = Math.floor((data.length * 3) / 4)
      if (size > 3 * 1024 * 1024) throw bad('That file is larger than 3 MB. Take a smaller photo or compress the PDF.')
      const id = 'f' + kit.randomHex(10)
      await store.set(`file:${ctx.acc.tenantId}:${id}`, { name, type, size, data, at: new Date().toISOString(), by: ctx.email })
      return { id, name, type, size }
    },
    'GET files': async (req) => {
      const ctx = await auth(req)
      const id = str(req.query.get('id'))
      const f = /^f[0-9a-f]{20}$/.test(id) ? await store.get<{ name: string; type: string; data: string }>(`file:${ctx.acc.tenantId}:${id}`) : null
      if (!f) throw new ApiFailure(404, 'That document is no longer there.')
      return { name: f.name, type: f.type, data: f.data }
    },
    'DELETE files': async (req) => {
      const ctx = await auth(req)
      needEditor(ctx)
      const id = str(req.query.get('id'))
      if (/^f[0-9a-f]{20}$/.test(id)) await store.del(`file:${ctx.acc.tenantId}:${id}`)
      return { ok: true }
    },

    /* ----- assistant ----- */
    'GET assistant': async (req) => {
      await auth(req)
      return { ai: !!opts.assistant }
    },
    /** Answer a question from this company's books, limited to what the person's role can see. */
    'POST assistant/chat': async (req) => {
      const ctx = await auth(req)
      const raw = Array.isArray(obj(req.body).messages) ? (obj(req.body).messages as unknown[]) : []
      const messages: ChatTurn[] = raw
        .map((m) => ({ role: obj(m).role === 'assistant' ? ('assistant' as const) : ('user' as const), text: str(obj(m).text).slice(0, 4000) }))
        .filter((m) => m.text.trim())
        .slice(-20)
      while (messages.length && messages[0].role !== 'user') messages.shift()
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'user') throw bad('Ask a question.')
      // 20 questions a minute per company is plenty for people and keeps the AI bill in check
      const key = 'ai|' + ctx.acc.tenantId
      const f = chats.get(key)
      if (f && f.until > Date.now() && f.n >= 20) throw new ApiFailure(429, 'Too many questions in a minute. Wait a little and ask again.')
      if (!f || f.until < Date.now()) chats.set(key, { n: 1, until: Date.now() + 60000 })
      else f.n++
      if (opts.assistant) {
        try {
          return { ...(await opts.assistant({ db: ctx.tenant.db, userId: ctx.acc.userId, messages })), ai: true }
        } catch (e) {
          throw new ApiFailure(502, e instanceof Error ? e.message : 'The AI assistant failed.')
        }
      }
      return { ...localAnswer(ctx.tenant.db, ctx.acc.userId, last.text), ai: false }
    },

    'POST users': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      await needActive(ctx)
      const b = obj(req.body)
      const email = cleanEmail(b.email)
      const name = str(b.name).trim()
      const roleId = str(b.roleId)
      const { db } = ctx.tenant
      if (!name) throw bad('Enter the user’s name.')
      if (!validEmail(email)) throw bad('Enter a valid email address.')
      needPassword(str(b.password))
      if (!db.roles.some((r) => r.id === roleId)) throw bad('Choose a role.')
      if (await emailTaken(email)) throw new ApiFailure(409, 'That email already has an account.')
      const employeeId = str(b.employeeId)
      if (employeeId && !db.employees.some((e) => e.id === employeeId)) throw bad('That employee is not in the books.')
      if (employeeId && db.users.some((u) => u.employeeId === employeeId)) throw new ApiFailure(409, 'That employee already has a login.')
      const id = 'u' + ++db.seq.id
      db.users.push({ id, name, email, roleId, employeeId })
      await saveBooks(ctx)
      const salt = kit.randomHex(16)
      await store.set('account:' + email, { tenantId: ctx.acc.tenantId, userId: id, salt, hash: await kit.hashPassword(str(b.password), salt) } satisfies Account)
      return { db, version: ctx.tenant.version }
    },

    'PATCH users': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      await needActive(ctx)
      const b = obj(req.body)
      const { db } = ctx.tenant
      const user = db.users.find((u) => u.id === b.id)
      if (!user) throw bad('No such user.')
      const roleId = str(b.roleId)
      if (roleId) {
        if (!db.roles.some((r) => r.id === roleId)) throw bad('Choose a role.')
        if (user.roleId === OWNER_ROLE_ID && roleId !== OWNER_ROLE_ID && db.users.filter((u) => u.roleId === OWNER_ROLE_ID).length === 1) throw bad('There must be at least one Owner.')
        user.roleId = roleId
      }
      if (typeof b.employeeId === 'string') {
        const employeeId = b.employeeId
        if (employeeId && !db.employees.some((e) => e.id === employeeId)) throw bad('That employee is not in the books.')
        if (employeeId && db.users.some((u) => u.id !== user.id && u.employeeId === employeeId)) throw new ApiFailure(409, 'That employee already has a login.')
        user.employeeId = employeeId
      }
      const pw = str(b.password)
      if (pw) {
        needPassword(pw)
        const acc = await store.get<Account>('account:' + user.email)
        if (acc) {
          acc.salt = kit.randomHex(16)
          acc.hash = await kit.hashPassword(pw, acc.salt)
          await store.set('account:' + user.email, acc)
          await dropSessions(user.email, ctx.token)
        }
      }
      await saveBooks(ctx)
      return { db, version: ctx.tenant.version }
    },

    /**
     * An employee asks for leave or withdraws a request, for themselves only. Works for every role,
     * even one that cannot change the books, because it touches nothing but their own request.
     */
    'POST leave': async (req) => {
      const ctx = await auth(req)
      await needActive(ctx)
      const b = obj(req.body)
      const me = ctx.tenant.db.users.find((u) => u.id === ctx.acc.userId)
      const employeeId = me?.employeeId || ''
      if (!employeeId || !ctx.tenant.db.employees.some((e) => e.id === employeeId)) throw new ApiFailure(403, 'Your login is not linked to an employee.')
      const at = new Date().toISOString()
      const run = (fn: () => Db) => {
        try { return fn() } catch (e) { throw bad((e as Error).message) }
      }
      if (str(b.op) === 'cancel') {
        ctx.tenant.db = run(() => applyAction(ctx.tenant.db, 'cancelLeave', { id: str(b.id), employeeId, today: at.slice(0, 10) }))
      } else {
        const kind = str(b.kind)
        if (!['casual', 'sick', 'annual', 'unpaid', 'other'].includes(kind)) throw bad('Choose the kind of leave.')
        ctx.tenant.db = run(() => applyAction(ctx.tenant.db, 'requestLeave', {
          employeeId, kind: kind as 'casual', from: str(b.from).slice(0, 10), to: str(b.to).slice(0, 10), half: b.half === true, reason: str(b.reason).slice(0, 500), by: me?.name || ctx.email, at,
        }))
      }
      await saveBooks(ctx)
      return { db: ctx.tenant.db, version: ctx.tenant.version }
    },

    /**
     * The signed-in employee checks in or out. The time is the server's, shown in the person's own
     * time zone, so nobody can check in for an earlier hour by changing the phone's clock.
     */
    'POST attendance': async (req) => {
      const ctx = await auth(req)
      await needActive(ctx)
      const b = obj(req.body)
      const me = ctx.tenant.db.users.find((u) => u.id === ctx.acc.userId)
      const employeeId = me?.employeeId || ''
      if (!employeeId || !ctx.tenant.db.employees.some((e) => e.id === employeeId)) throw new ApiFailure(403, 'Your login is not linked to an employee.')
      const tz = Number(b.tz)
      if (!Number.isFinite(tz) || tz < -840 || tz > 720) throw bad('Your device did not send its time zone.')
      const local = new Date(Date.now() - tz * 60000).toISOString()
      const date = local.slice(0, 10)
      const time = local.slice(11, 16)
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
      const lat = num(b.lat)
      const lng = num(b.lng)
      const ok = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      const run = (fn: () => Db) => {
        try { return fn() } catch (e) { throw bad((e as Error).message) }
      }
      if (str(b.op) === 'out') {
        ctx.tenant.db = run(() => applyAction(ctx.tenant.db, 'checkOut', { employeeId, date, time, work: str(b.work).slice(0, 300), output: num(b.output) }))
      } else {
        ctx.tenant.db = run(() => applyAction(ctx.tenant.db, 'checkIn', { employeeId, date, time, lat: ok ? lat : undefined, lng: ok ? lng : undefined }))
      }
      await saveBooks(ctx)
      return { db: ctx.tenant.db, version: ctx.tenant.version }
    },

    'DELETE users': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      await needActive(ctx)
      const id = req.query.get('id')
      const { db } = ctx.tenant
      const user = db.users.find((u) => u.id === id)
      if (!user) throw bad('No such user.')
      if (id === ctx.acc.userId) throw bad('You cannot remove yourself.')
      if (user.roleId === OWNER_ROLE_ID && db.users.filter((u) => u.roleId === OWNER_ROLE_ID).length === 1) throw bad('There must be at least one Owner.')
      db.users = db.users.filter((u) => u.id !== id)
      await saveBooks(ctx)
      await store.del('account:' + user.email)
      await dropSessions(user.email)
      return { db, version: ctx.tenant.version }
    },

    'GET platform/companies': async (req) => {
      await platformAuth(req)
      const companies: CompanySummary[] = []
      for (const { key, value: t } of await store.list<TenantInfo>('tenant:')) {
        const id = key.slice('tenant:'.length)
        const db = (await store.get<TenantBooks>('books:' + id))?.db
        companies.push({
          id, name: db?.company.name || t.name, createdAt: t.createdAt, trades: db?.businessTypes || [],
          counts: { products: db?.products.length || 0, invoices: db?.invoices.length || 0, shipments: db?.imports.length || 0 },
          users: (db?.users || []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: db?.roles.find((r) => r.id === u.roleId)?.name || 'No role' })),
          billing: await billingSummary(id),
          claims: (await billingOf(id)).payments.filter((p) => p.status === 'pending'),
        })
      }
      return { companies: companies.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) }
    },

    /** Open a company's books as its owner. Every use is written to the audit log. */
    'POST platform/open': async (req) => {
      await platformAuth(req)
      const tenantId = str(obj(req.body).tenantId)
      const tenant = await store.get<TenantBooks>('books:' + tenantId)
      if (!tenant) throw bad('No such company.')
      const owner = tenant.db.users.find((u) => u.roleId === OWNER_ROLE_ID)
      if (!owner) throw bad('That company has no owner.')
      await store.audit(`platform opened company ${tenantId} (${tenant.db.company.name}) as ${owner.email}`)
      const token = await newSession(PLATFORM, { as: { tenantId, userId: owner.id }, exp: Date.now() + PLATFORM_OPEN_MS })
      return { token, session: { userId: owner.id, email: owner.email, tenantId, viaPlatform: true }, db: tenant.db, version: tenant.version, billing: await billingSummary(tenantId) }
    },

    /** Approve or reject an "I paid" claim, give extra days, or make a company free. Every use is audited. */
    'POST platform/billing': async (req) => {
      await platformAuth(req)
      const b = obj(req.body)
      const tenantId = str(b.tenantId)
      if (!(await store.get('tenant:' + tenantId))) throw bad('No such company.')
      const rec = await billingOf(tenantId)
      const now = Date.now()
      const action = str(b.action)
      if (action === 'approve' || action === 'reject') {
        const pay = rec.payments.find((p) => p.id === str(b.paymentId))
        if (!pay || pay.status !== 'pending') throw bad('That payment is not waiting for a decision.')
        if (action === 'approve') markPaid(rec, pay, now)
        else Object.assign(pay, { status: 'rejected', decidedAt: new Date(now).toISOString(), reason: str(b.reason).trim() || 'Payment not found' })
      } else if (action === 'extend') {
        const days = Math.round(Number(b.days))
        if (!(days > 0 && days <= 3660)) throw bad('Give between 1 and 3660 days.')
        const s = summarize(rec, now)
        if (s.status === 'trial' || (s.status === 'expired' && !rec.paidUntil)) rec.trialEnds = new Date(Math.max(Date.parse(rec.trialEnds), now) + days * 86400000).toISOString()
        else rec.paidUntil = new Date(Math.max(Date.parse(rec.paidUntil || rec.trialEnds), now) + days * 86400000).toISOString()
      } else if (action === 'free') rec.plan = 'free'
      else if (action === 'unfree') rec.plan = rec.payments.filter((p) => p.status === 'paid').pop()?.plan || 'trial'
      else throw bad('Unknown action.')
      await store.set('billing:' + tenantId, rec)
      await store.audit(`platform billing ${action}${b.paymentId ? ' ' + str(b.paymentId) : ''}${b.days ? ' ' + str(b.days) + ' days' : ''} for ${tenantId}`)
      return { billing: summarize(rec, now), claims: rec.payments.filter((p) => p.status === 'pending') }
    },

    'POST platform/password': async (req) => {
      await platformAuth(req)
      const b = obj(req.body)
      const email = cleanEmail(b.email)
      const acc = await store.get<Account>('account:' + email)
      if (!acc) throw bad('No such user.')
      needPassword(str(b.password))
      acc.salt = kit.randomHex(16)
      acc.hash = await kit.hashPassword(str(b.password), acc.salt)
      await store.set('account:' + email, acc)
      await dropSessions(email)
      await store.audit(`platform reset password for ${email}`)
      return { ok: true }
    },
  }

  /** Run one request. Never throws: failures come back as an error status with a message. */
  async function handle(req: ApiRequest): Promise<ApiResponse> {
    const handler = routes[`${req.method} ${req.path.replace(/^\/+|\/+$/g, '')}`]
    if (!handler) return { status: 404, body: { error: 'Not found.' } }
    try {
      if (req.path !== 'status') {
        if (!store.ok) throw new ApiFailure(503, store.problem || 'The data store is not set up.')
        await ready()
      } else await ready().catch(() => undefined)
      const out = await handler(req)
      if (out instanceof Redirect) return { status: 303, body: null, redirect: out.url }
      return { status: 200, body: out }
    } catch (e) {
      if (e instanceof ApiFailure) return { status: e.status, body: { error: e.message } }
      console.error(e)
      return { status: 500, body: { error: 'Something went wrong on the server.' } }
    }
  }

  return { handle, ready, platformEmail: PLATFORM }
}

export type BooksApi = ReturnType<typeof createApi>
