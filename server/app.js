/**
 * The books API, independent of where it runs.
 * `createApp(store)` returns `handle(req, res)`. The store keeps the data: files on your own
 * computer or server (store-file.js), Postgres when hosted on Vercel (store-pg.js).
 *
 * Keys in the store:
 *   platform            {salt, hash}                     the platform owner's password
 *   account:<email>     {tenantId, userId, salt, hash}   one per sign-in
 *   session:<sha>       {email, exp, platform?, as?}     signed-in tokens
 *   tenant:<id>         {name, createdAt}                one per company
 *   books:<id>          {version, db}                    that company's books
 */
import crypto from 'node:crypto'
import { BUSINESS_TYPES, applyBusinessTypes } from '../src/lib/presets.js'
import { demoDb, emptyDb } from '../src/lib/seed.js'

const SESSION_DAYS = 30
const MAX_BODY = 8 * 1024 * 1024

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const bad = (msg) => new HttpError(400, msg)

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const salt = () => crypto.randomBytes(16).toString('hex')
export const cleanEmail = (e) => String(e || '').trim().toLowerCase()
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

const levelOf = (db, userId, page) => {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return 'none'
  return role.id === 'owner' ? 'edit' : role.perms[page] || 'none'
}

export const DEMO_USERS = [
  ['u1', 'Demo Owner', 'owner@demo.com', 'owner'],
  ['u2', 'Demo Accountant', 'accountant@demo.com', 'accountant'],
  ['u3', 'Demo Sales', 'sales@demo.com', 'sales'],
  ['u4', 'Demo Warehouse', 'warehouse@demo.com', 'warehouse'],
]

export function createApp(store, env = process.env) {
  const PLATFORM_EMAIL = cleanEmail(env.PLATFORM_ADMIN_EMAIL || 'admin@starbangla.local')
  const DEMO_ON = env.DEMO_ACCOUNTS === '1'
  const DEMO_PASSWORD = env.DEMO_PASSWORD || 'demo1234'

  /* ---------- one-time setup: platform password and demo company ---------- */
  let readyPromise = null
  const ready = () => (readyPromise ||= setup().catch((e) => {
    readyPromise = null
    throw e
  }))
  async function setup() {
    if (!store.ok) return
    const plat = await store.get('platform')
    if (env.PLATFORM_ADMIN_PASSWORD) {
      if (!plat || !safeEqual(hashPw(env.PLATFORM_ADMIN_PASSWORD, plat.salt), plat.hash)) {
        const s = salt()
        await store.set('platform', { salt: s, hash: hashPw(env.PLATFORM_ADMIN_PASSWORD, s) })
      }
    } else if (!plat) {
      const pw = crypto.randomBytes(9).toString('base64url')
      const s = salt()
      await store.set('platform', { salt: s, hash: hashPw(pw, s) })
      await store.generatedPassword(PLATFORM_EMAIL, pw)
    }

    if (DEMO_ON) {
      let books = await store.get('books:demo')
      if (!books) {
        const db = demoDb()
        db.company.name = 'Star Bangla Demo'
        db.company.logo = '/brand-logo.png'
        applyBusinessTypes(db, ['general', 'electronics', 'medical'])
        db.users = DEMO_USERS.map(([id, name, email, roleId]) => ({ id, name, email, roleId, employeeId: '' }))
        books = { version: 1, db }
        await store.set('books:demo', books)
        await store.set('tenant:demo', { name: db.company.name, createdAt: new Date().toISOString() })
      }
      for (const [userId, , email] of DEMO_USERS) {
        const acc = await store.get('account:' + email)
        if (acc && acc.tenantId === 'demo' && safeEqual(hashPw(DEMO_PASSWORD, acc.salt), acc.hash)) continue
        const s = salt()
        await store.set('account:' + email, { tenantId: 'demo', userId, salt: s, hash: hashPw(DEMO_PASSWORD, s) })
      }
    } else {
      for (const [, , email] of DEMO_USERS) {
        const acc = await store.get('account:' + email)
        if (acc?.tenantId === 'demo') await store.del('account:' + email)
      }
    }
  }

  /* ---------- helpers ---------- */
  const newSession = async (email, extra = {}) => {
    const token = crypto.randomBytes(32).toString('hex')
    await store.set('session:' + sha(token), { email, exp: Date.now() + SESSION_DAYS * 86400000, ...extra })
    return token
  }
  const dropSessions = async (email, keepToken) => {
    for (const { key, value } of await store.list('session:')) {
      if (value.email === email && key !== 'session:' + sha(keepToken || '')) await store.del(key)
    }
  }
  const tokenOf = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '')

  // slow down password guessing: 8 failed sign-ins per address per 10 minutes (per running instance)
  const fails = new Map()
  const tooMany = (key) => {
    const f = fails.get(key)
    return f && f.until > Date.now() && f.n >= 8
  }
  const noteFail = (key) => {
    const f = fails.get(key)
    if (!f || f.until < Date.now()) fails.set(key, { n: 1, until: Date.now() + 600000 })
    else f.n++
  }

  function readBody(req) {
    // hosts such as Vercel may have parsed the body already
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        try {
          return Promise.resolve(req.body ? JSON.parse(req.body) : {})
        } catch {
          return Promise.reject(bad('The request was not valid JSON.'))
        }
      }
      return Promise.resolve(req.body)
    }
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new HttpError(413, 'That is too much data to save at once.'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => {
        if (!chunks.length) return resolve({})
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(bad('The request was not valid JSON.'))
        }
      })
      req.on('error', reject)
    })
  }

  async function auth(req) {
    const token = tokenOf(req)
    const s = token && (await store.get('session:' + sha(token)))
    if (!s || s.exp < Date.now()) throw new HttpError(401, 'Please sign in again.')
    if (s.platform) throw new HttpError(403, 'Open a company first.')
    const acc = s.as || (await store.get('account:' + s.email))
    if (!acc) throw new HttpError(401, 'This account no longer exists.')
    const tenant = await store.get('books:' + acc.tenantId)
    if (!tenant) throw new HttpError(401, 'This company no longer exists.')
    return { token, email: s.email, acc, tenant }
  }
  async function platformAuth(req) {
    const token = tokenOf(req)
    const s = token && (await store.get('session:' + sha(token)))
    if (!s || s.exp < Date.now() || !s.platform) throw new HttpError(401, 'Please sign in as the platform owner.')
  }
  const needAdmin = (ctx) => {
    if (levelOf(ctx.tenant.db, ctx.acc.userId, 'settings') !== 'edit') throw new HttpError(403, 'Only an admin can do that.')
  }
  const sessionInfo = (ctx) => ({ userId: ctx.acc.userId, email: ctx.email, tenantId: ctx.acc.tenantId, viaPlatform: ctx.email === PLATFORM_EMAIL })
  /** Save books only if nobody saved in between. */
  const saveBooks = async (ctx) => {
    const base = ctx.tenant.version
    ctx.tenant.version = base + 1
    if (!(await store.cas('books:' + ctx.acc.tenantId, base, ctx.tenant))) throw new HttpError(409, 'Someone else changed the books.')
  }

  /* ---------- routes ---------- */
  const routes = {
    /** Lets the sign-in screen check the server is reachable and offer demo logins when they are on. */
    'GET /api/status': async () => ({
      ok: store.ok,
      problem: store.ok ? null : store.problem,
      demo: store.ok && DEMO_ON ? { password: DEMO_PASSWORD, logins: DEMO_USERS.map(([, name, email, roleId]) => ({ name, email, role: roleId[0].toUpperCase() + roleId.slice(1) })) } : null,
    }),

    'POST /api/signup': async (req) => {
      const b = await readBody(req)
      const email = cleanEmail(b.email)
      const company = String(b.company || '').trim()
      const name = String(b.name || '').trim()
      if (!company) throw bad('Enter your company name.')
      if (!name) throw bad('Enter your name.')
      if (!validEmail(email)) throw bad('Enter a valid email address.')
      if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
      if (email === PLATFORM_EMAIL || (await store.get('account:' + email))) throw new HttpError(409, 'That email already has an account. Sign in instead.')
      const types = (Array.isArray(b.businessTypes) ? b.businessTypes : []).filter((t) => BUSINESS_TYPES[t])
      const db = b.sample ? demoDb() : emptyDb()
      db.company.name = company
      db.users = [{ id: 'u1', name, email, roleId: 'owner', employeeId: '' }]
      applyBusinessTypes(db, types.length ? types : ['general'])
      const tenantId = crypto.randomBytes(8).toString('hex')
      const s = salt()
      await store.set('books:' + tenantId, { version: 1, db })
      await store.set('tenant:' + tenantId, { name: company, createdAt: new Date().toISOString() })
      await store.set('account:' + email, { tenantId, userId: 'u1', salt: s, hash: hashPw(b.password, s) })
      const token = await newSession(email)
      return { token, session: { userId: 'u1', email, tenantId }, db, version: 1 }
    },

    'POST /api/login': async (req) => {
      const b = await readBody(req)
      const email = cleanEmail(b.email)
      const key = `${req.socket?.remoteAddress || req.headers['x-forwarded-for'] || ''}|${email}`
      if (tooMany(key)) throw new HttpError(429, 'Too many attempts. Wait ten minutes and try again.')
      if (email === PLATFORM_EMAIL) {
        const plat = await store.get('platform')
        if (!plat || !safeEqual(hashPw(String(b.password || ''), plat.salt), plat.hash)) {
          noteFail(key)
          throw new HttpError(401, 'Wrong email or password.')
        }
        await store.audit(`platform sign-in from ${key.split('|')[0]}`)
        return { platform: true, token: await newSession(email, { platform: true }) }
      }
      const acc = await store.get('account:' + email)
      // hash even when the account is unknown so the timing does not reveal which emails exist
      const hash = hashPw(String(b.password || ''), acc?.salt || 'no-such-account')
      if (!acc || !safeEqual(hash, acc.hash)) {
        noteFail(key)
        throw new HttpError(401, 'Wrong email or password.')
      }
      const tenant = await store.get('books:' + acc.tenantId)
      if (!tenant) throw new HttpError(401, 'This company no longer exists.')
      return { token: await newSession(email), session: { userId: acc.userId, email, tenantId: acc.tenantId }, db: tenant.db, version: tenant.version }
    },

    'POST /api/logout': async (req) => {
      const token = tokenOf(req)
      if (token) await store.del('session:' + sha(token))
      return { ok: true }
    },

    'GET /api/books': async (req, url) => {
      const ctx = await auth(req)
      if (Number(url.searchParams.get('v')) === ctx.tenant.version) return { same: true, version: ctx.tenant.version }
      return { session: sessionInfo(ctx), db: ctx.tenant.db, version: ctx.tenant.version }
    },

    'PUT /api/books': async (req) => {
      const ctx = await auth(req)
      const { db: cur, version } = ctx.tenant
      const b = await readBody(req)
      const next = b.db
      if (!next || next.v !== 1 || !Array.isArray(next.products) || !Array.isArray(next.invoices)) throw bad('Those are not valid books.')
      if (b.baseVersion !== version) throw new HttpError(409, 'Someone else changed the books.')
      const uid = ctx.acc.userId
      const me = cur.users.find((u) => u.id === uid)
      const myRole = me && cur.roles.find((r) => r.id === me.roleId)
      if (!myRole) throw new HttpError(403, 'Your role was removed.')
      const isAdmin = levelOf(cur, uid, 'settings') === 'edit'
      if (!isAdmin && !Object.values(myRole.perms).includes('edit')) throw new HttpError(403, 'Your role is view-only.')
      next.users = cur.users // users only change through /api/users
      if (!isAdmin) {
        // only an admin may change roles, company details and custom fields
        next.roles = cur.roles
        next.company = cur.company
        next.fieldDefs = cur.fieldDefs
        next.businessTypes = cur.businessTypes
      } else if (!next.roles?.some((r) => r.id === 'owner')) throw bad('The Owner role cannot be removed.')
      ctx.tenant.db = next
      await saveBooks(ctx)
      return { version: ctx.tenant.version }
    },

    'POST /api/users': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = await readBody(req)
      const email = cleanEmail(b.email)
      const name = String(b.name || '').trim()
      const { db } = ctx.tenant
      if (!name) throw bad('Enter the user’s name.')
      if (!validEmail(email)) throw bad('Enter a valid email address.')
      if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
      if (!db.roles.some((r) => r.id === b.roleId)) throw bad('Choose a role.')
      if (email === PLATFORM_EMAIL || (await store.get('account:' + email))) throw new HttpError(409, 'That email already has an account.')
      const id = 'u' + ++db.seq.id
      db.users.push({ id, name, email, roleId: b.roleId, employeeId: b.employeeId || '' })
      await saveBooks(ctx)
      const s = salt()
      await store.set('account:' + email, { tenantId: ctx.acc.tenantId, userId: id, salt: s, hash: hashPw(b.password, s) })
      return { db, version: ctx.tenant.version }
    },

    'PATCH /api/users': async (req) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const b = await readBody(req)
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
        const acc = await store.get('account:' + user.email)
        if (acc) {
          acc.salt = salt()
          acc.hash = hashPw(b.password, acc.salt)
          await store.set('account:' + user.email, acc)
          await dropSessions(user.email, ctx.token)
        }
      }
      await saveBooks(ctx)
      return { db, version: ctx.tenant.version }
    },

    'DELETE /api/users': async (req, url) => {
      const ctx = await auth(req)
      needAdmin(ctx)
      const id = url.searchParams.get('id')
      const { db } = ctx.tenant
      const user = db.users.find((u) => u.id === id)
      if (!user) throw bad('No such user.')
      if (id === ctx.acc.userId) throw bad('You cannot remove yourself.')
      if (user.roleId === 'owner' && db.users.filter((u) => u.roleId === 'owner').length === 1) throw bad('There must be at least one Owner.')
      db.users = db.users.filter((u) => u.id !== id)
      await saveBooks(ctx)
      await store.del('account:' + user.email)
      await dropSessions(user.email)
      return { db, version: ctx.tenant.version }
    },

    'GET /api/platform/companies': async (req) => {
      await platformAuth(req)
      const tenants = await store.list('tenant:')
      const companies = []
      for (const { key, value: t } of tenants) {
        const id = key.slice('tenant:'.length)
        const db = (await store.get('books:' + id))?.db
        companies.push({
          id, name: db?.company.name || t.name, createdAt: t.createdAt, trades: db?.businessTypes || [],
          counts: { products: db?.products.length || 0, invoices: db?.invoices.length || 0, shipments: db?.imports.length || 0 },
          users: (db?.users || []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: db.roles.find((r) => r.id === u.roleId)?.name || 'No role' })),
        })
      }
      return { companies: companies.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) }
    },

    /** Open a company's books as its owner. Every use is written to the audit log. */
    'POST /api/platform/open': async (req) => {
      await platformAuth(req)
      const { tenantId } = await readBody(req)
      const tenant = await store.get('books:' + tenantId)
      if (!tenant) throw bad('No such company.')
      const owner = tenant.db.users.find((u) => u.roleId === 'owner')
      if (!owner) throw bad('That company has no owner.')
      await store.audit(`platform opened company ${tenantId} (${tenant.db.company.name}) as ${owner.email}`)
      const token = await newSession(PLATFORM_EMAIL, { as: { tenantId, userId: owner.id }, exp: Date.now() + 4 * 3600000 })
      return { token, session: { userId: owner.id, email: owner.email, tenantId, viaPlatform: true }, db: tenant.db, version: tenant.version }
    },

    'POST /api/platform/password': async (req) => {
      await platformAuth(req)
      const b = await readBody(req)
      const email = cleanEmail(b.email)
      const acc = await store.get('account:' + email)
      if (!acc) throw bad('No such user.')
      if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
      acc.salt = salt()
      acc.hash = hashPw(b.password, acc.salt)
      await store.set('account:' + email, acc)
      await dropSessions(email)
      await store.audit(`platform reset password for ${email}`)
      return { ok: true }
    },
  }

  /** Works as a plain Node request handler and as a Vercel function. Returns false for non-API paths. */
  async function handle(req, res) {
    // on Vercel, vercel.json rewrites /api/<path> to /api?path=<path>; req.url may show either form
    const q = req.query?.path
    let pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')
    if (pathname === '/api' && q) pathname = '/api/' + (Array.isArray(q) ? q.join('/') : String(q)).replace(/^\/+/, '')
    if (!pathname.startsWith('/api/')) return false
    const url = new URL(req.url, 'http://localhost')
    const handler = routes[`${req.method} ${pathname}`]
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (!handler) return send(404, { error: 'Not found.' }), true
    try {
      if (pathname !== '/api/status') {
        if (!store.ok) throw new HttpError(503, store.problem)
        await ready()
      } else await ready().catch(() => {})
      send(200, await handler(req, url))
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e)
      send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong on the server.' })
    }
    return true
  }

  return { handle, ready, PLATFORM_EMAIL, DEMO_ON, DEMO_PASSWORD }
}
