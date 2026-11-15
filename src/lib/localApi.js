/**
 * Browser-only backend. Answers the same calls as the real server (server/app.js), but keeps
 * every company, login and session in this browser's localStorage. Used when the app is deployed
 * as a frontend only (the default). Set VITE_BACKEND=server at build time to use the real server.
 *
 * Data never leaves the device, and passwords are only lightly protected: fine for a demo or a
 * single shop on one computer, not for many users sharing books.
 */
import { BUSINESS_TYPES, applyBusinessTypes } from './presets.js'
import { demoDb, emptyDb } from './seed.js'

const KEY = 'books-local-v1'
const PLATFORM_EMAIL = 'admin@starbangla.local'
const DEMO_PASSWORD = 'demo1234'
const DEMO_USERS = [
  ['u1', 'Demo Owner', 'owner@demo.com', 'owner'],
  ['u2', 'Demo Accountant', 'accountant@demo.com', 'accountant'],
  ['u3', 'Demo Sales', 'sales@demo.com', 'sales'],
  ['u4', 'Demo Warehouse', 'warehouse@demo.com', 'warehouse'],
]

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const bad = (m) => new ApiError(400, m)
const cleanEmail = (e) => String(e || '').trim().toLowerCase()
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const rand = (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('')

async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + ':' + pw)
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 0 // fallback for non-secure pages (plain http on a LAN)
  for (const b of data) h = (Math.imul(h, 31) + b) | 0
  return String(h)
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.accounts) return s
  } catch {
    /* start fresh */
  }
  return { accounts: {}, sessions: {}, tenants: {}, books: {}, platform: null }
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    throw new ApiError(507, 'This browser has no room left to save. Remove the company logo or download a backup and clear old data.')
  }
}

let readyPromise = null
async function ready() {
  const s = load()
  if (!s.platform) {
    const salt = rand()
    s.platform = { salt, hash: await hashPw(DEMO_PASSWORD, salt) }
  }
  if (!s.books.demo) {
    const db = demoDb()
    db.company.name = 'Star Bangla Demo'
    db.company.logo = '/brand-logo.png'
    applyBusinessTypes(db, ['general', 'electronics', 'medical'])
    db.users = DEMO_USERS.map(([id, name, email, roleId]) => ({ id, name, email, roleId, employeeId: '' }))
    s.books.demo = { version: 1, db }
    s.tenants.demo = { name: db.company.name, createdAt: new Date().toISOString() }
    for (const [userId, , email] of DEMO_USERS) {
      const salt = rand()
      s.accounts[email] = { tenantId: 'demo', userId, salt, hash: await hashPw(DEMO_PASSWORD, salt) }
    }
  }
  save(s)
}

const newSession = (s, email, extra = {}) => {
  const token = rand(24)
  s.sessions[token] = { email, exp: Date.now() + 30 * 86400000, ...extra }
  return token
}
function auth(s, token) {
  const ses = token && s.sessions[token]
  if (!ses || ses.exp < Date.now()) throw new ApiError(401, 'Please sign in again.')
  if (ses.platform) throw new ApiError(403, 'Open a company first.')
  const acc = ses.as || s.accounts[ses.email]
  if (!acc) throw new ApiError(401, 'This account no longer exists.')
  const tenant = s.books[acc.tenantId]
  if (!tenant) throw new ApiError(401, 'This company no longer exists.')
  return { email: ses.email, acc, tenant }
}
const platformAuth = (s, token) => {
  const ses = token && s.sessions[token]
  if (!ses || ses.exp < Date.now() || !ses.platform) throw new ApiError(401, 'Please sign in as the platform owner.')
}
const levelOf = (db, userId, page) => {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return 'none'
  return role.id === 'owner' ? 'edit' : role.perms[page] || 'none'
}
const needAdmin = (ctx) => {
  if (levelOf(ctx.tenant.db, ctx.acc.userId, 'settings') !== 'edit') throw new ApiError(403, 'Only an admin can do that.')
}
const dropSessions = (s, email, keep) => {
  for (const t of Object.keys(s.sessions)) if (s.sessions[t].email === email && t !== keep) delete s.sessions[t]
}
const clone = (x) => structuredClone(x)

const routes = {
  'GET status': async () => ({
    ok: true,
    local: true,
    demo: {
      password: DEMO_PASSWORD,
      logins: [
        ...DEMO_USERS.map(([, name, email, roleId]) => ({ name, email, role: roleId[0].toUpperCase() + roleId.slice(1) })),
        { name: 'Platform owner', email: PLATFORM_EMAIL, role: 'Platform owner' },
      ],
    },
  }),

  'POST signup': async (s, b) => {
    const email = cleanEmail(b.email)
    const company = String(b.company || '').trim()
    const name = String(b.name || '').trim()
    if (!company) throw bad('Enter your company name.')
    if (!name) throw bad('Enter your name.')
    if (!validEmail(email)) throw bad('Enter a valid email address.')
    if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
    if (email === PLATFORM_EMAIL || s.accounts[email]) throw new ApiError(409, 'That email already has an account. Sign in instead.')
    const types = (Array.isArray(b.businessTypes) ? b.businessTypes : []).filter((t) => BUSINESS_TYPES[t])
    const db = b.sample ? demoDb() : emptyDb()
    db.company.name = company
    db.users = [{ id: 'u1', name, email, roleId: 'owner', employeeId: '' }]
    applyBusinessTypes(db, types.length ? types : ['general'])
    const tenantId = rand(8)
    const salt = rand()
    s.books[tenantId] = { version: 1, db }
    s.tenants[tenantId] = { name: company, createdAt: new Date().toISOString() }
    s.accounts[email] = { tenantId, userId: 'u1', salt, hash: await hashPw(b.password, salt) }
    const token = newSession(s, email)
    return { token, session: { userId: 'u1', email, tenantId }, db: clone(db), version: 1 }
  },

  'POST login': async (s, b) => {
    const email = cleanEmail(b.email)
    const pw = String(b.password || '')
    if (email === PLATFORM_EMAIL) {
      if ((await hashPw(pw, s.platform.salt)) !== s.platform.hash) throw new ApiError(401, 'Wrong email or password.')
      return { platform: true, token: newSession(s, email, { platform: true }) }
    }
    const acc = s.accounts[email]
    if (!acc || (await hashPw(pw, acc.salt)) !== acc.hash) throw new ApiError(401, 'Wrong email or password.')
    const tenant = s.books[acc.tenantId]
    if (!tenant) throw new ApiError(401, 'This company no longer exists.')
    return { token: newSession(s, email), session: { userId: acc.userId, email, tenantId: acc.tenantId }, db: clone(tenant.db), version: tenant.version }
  },

  'POST logout': async (s, b, q, token) => {
    delete s.sessions[token]
    return { ok: true }
  },

  'GET books': async (s, b, q, token) => {
    const ctx = auth(s, token)
    if (Number(q.get('v')) === ctx.tenant.version) return { same: true, version: ctx.tenant.version }
    return { session: { userId: ctx.acc.userId, email: ctx.email, tenantId: ctx.acc.tenantId, viaPlatform: ctx.email === PLATFORM_EMAIL }, db: clone(ctx.tenant.db), version: ctx.tenant.version }
  },

  'PUT books': async (s, b, q, token) => {
    const ctx = auth(s, token)
    const cur = ctx.tenant.db
    const next = b.db
    if (!next || next.v !== 1 || !Array.isArray(next.products)) throw bad('Those are not valid books.')
    if (b.baseVersion !== ctx.tenant.version) throw new ApiError(409, 'Someone else changed the books.')
    next.users = cur.users
    if (levelOf(cur, ctx.acc.userId, 'settings') !== 'edit') {
      next.roles = cur.roles
      next.company = cur.company
      next.fieldDefs = cur.fieldDefs
      next.businessTypes = cur.businessTypes
    }
    ctx.tenant.db = next
    ctx.tenant.version++
    return { version: ctx.tenant.version }
  },

  'POST users': async (s, b, q, token) => {
    const ctx = auth(s, token)
    needAdmin(ctx)
    const email = cleanEmail(b.email)
    const name = String(b.name || '').trim()
    const { db } = ctx.tenant
    if (!name) throw bad('Enter the user’s name.')
    if (!validEmail(email)) throw bad('Enter a valid email address.')
    if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
    if (!db.roles.some((r) => r.id === b.roleId)) throw bad('Choose a role.')
    if (email === PLATFORM_EMAIL || s.accounts[email]) throw new ApiError(409, 'That email already has an account.')
    const id = 'u' + ++db.seq.id
    db.users.push({ id, name, email, roleId: b.roleId, employeeId: b.employeeId || '' })
    const salt = rand()
    s.accounts[email] = { tenantId: ctx.acc.tenantId, userId: id, salt, hash: await hashPw(b.password, salt) }
    ctx.tenant.version++
    return { db: clone(db), version: ctx.tenant.version }
  },

  'PATCH users': async (s, b, q, token) => {
    const ctx = auth(s, token)
    needAdmin(ctx)
    const { db } = ctx.tenant
    const user = db.users.find((u) => u.id === b.id)
    if (!user) throw bad('No such user.')
    if (b.roleId) {
      if (!db.roles.some((r) => r.id === b.roleId)) throw bad('Choose a role.')
      if (user.roleId === 'owner' && b.roleId !== 'owner' && db.users.filter((u) => u.roleId === 'owner').length === 1) throw bad('There must be at least one Owner.')
      user.roleId = b.roleId
    }
    if (b.password) {
      if (String(b.password).length < 8) throw bad('Use a password of at least 8 characters.')
      const acc = s.accounts[user.email]
      if (acc) {
        acc.salt = rand()
        acc.hash = await hashPw(b.password, acc.salt)
        dropSessions(s, user.email, token)
      }
    }
    ctx.tenant.version++
    return { db: clone(db), version: ctx.tenant.version }
  },

  'DELETE users': async (s, b, q, token) => {
    const ctx = auth(s, token)
    needAdmin(ctx)
    const id = q.get('id')
    const { db } = ctx.tenant
    const user = db.users.find((u) => u.id === id)
    if (!user) throw bad('No such user.')
    if (id === ctx.acc.userId) throw bad('You cannot remove yourself.')
    if (user.roleId === 'owner' && db.users.filter((u) => u.roleId === 'owner').length === 1) throw bad('There must be at least one Owner.')
    db.users = db.users.filter((u) => u.id !== id)
    delete s.accounts[user.email]
    dropSessions(s, user.email)
    ctx.tenant.version++
    return { db: clone(db), version: ctx.tenant.version }
  },

  'GET platform/companies': async (s, b, q, token) => {
    platformAuth(s, token)
    const companies = Object.entries(s.tenants).map(([id, t]) => {
      const db = s.books[id]?.db
      return {
        id, name: db?.company.name || t.name, createdAt: t.createdAt, trades: db?.businessTypes || [],
        counts: { products: db?.products.length || 0, invoices: db?.invoices.length || 0, shipments: db?.imports.length || 0 },
        users: (db?.users || []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: db.roles.find((r) => r.id === u.roleId)?.name || 'No role' })),
      }
    })
    return { companies: companies.sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1)) }
  },

  'POST platform/open': async (s, b, q, token) => {
    platformAuth(s, token)
    const tenant = s.books[b.tenantId]
    if (!tenant) throw bad('No such company.')
    const owner = tenant.db.users.find((u) => u.roleId === 'owner')
    if (!owner) throw bad('That company has no owner.')
    const t = newSession(s, PLATFORM_EMAIL, { as: { tenantId: b.tenantId, userId: owner.id } })
    return { token: t, session: { userId: owner.id, email: owner.email, tenantId: b.tenantId, viaPlatform: true }, db: clone(tenant.db), version: tenant.version }
  },

  'POST platform/password': async (s, b, q, token) => {
    platformAuth(s, token)
    const email = cleanEmail(b.email)
    const acc = s.accounts[email]
    if (!acc) throw bad('No such user.')
    if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
    acc.salt = rand()
    acc.hash = await hashPw(b.password, acc.salt)
    dropSessions(s, email)
    return { ok: true }
  },
}

/** Same signature and errors as the network `call` in store.jsx. */
export async function localCall(method, path, body, token) {
  await (readyPromise ||= ready())
  const [p, query = ''] = path.split('?')
  const handler = routes[`${method} ${p}`]
  if (!handler) throw Object.assign(new Error('Not found.'), { status: 404 })
  const s = load()
  try {
    const result = await handler(s, body ? clone(body) : {}, new URLSearchParams(query), token)
    save(s)
    return result
  } catch (e) {
    throw Object.assign(new Error(e.message), { status: e.status || 500 })
  }
}
