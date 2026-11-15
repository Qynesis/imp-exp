/**
 * Multi-company server. Each company (tenant) has its own books file and its own users.
 * No dependencies: Node's built-in http, crypto and fs only.
 *
 *   node server/index.js            API on :8787, also serves ./dist when it exists
 *   PORT=80 DATA_DIR=/var/books node server/index.js
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUSINESS_TYPES, applyBusinessTypes } from '../src/lib/presets.js'
import { demoDb, emptyDb } from '../src/lib/seed.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// read settings from .env next to package.json (real environment variables win)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  /* no .env file: use the defaults */
}

const DATA = process.env.DATA_DIR || path.join(ROOT, 'data')
const DIST = path.join(ROOT, '..', 'dist')
const PORT = Number(process.env.PORT) || 8787
const SESSION_DAYS = 30
const MAX_BODY = 8 * 1024 * 1024

fs.mkdirSync(DATA, { recursive: true })
const REG = path.join(DATA, 'registry.json')
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file) // atomic: a crash never leaves a half-written file
}

/** registry: { tenants: {id: {name, createdAt}}, accounts: {email: {tenantId, userId, salt, hash}}, sessions: {tokenHash: {email, exp}} } */
const reg = readJson(REG, { tenants: {}, accounts: {}, sessions: {} })
const saveReg = () => writeJson(REG, reg)
const tenantFile = (id) => path.join(DATA, `tenant-${id}.json`)
const loadTenant = (id) => readJson(tenantFile(id), null)
const saveTenant = (id, t) => writeJson(tenantFile(id), t)

const cleanEmail = (e) => String(e || '').trim().toLowerCase()
const audit = (line) => fs.appendFileSync(path.join(DATA, 'audit.log'), `${new Date().toISOString()} ${line}\n`)
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/**
 * The platform owner (you, the operator of QynTrading) can see every company, open its books and reset passwords.
 * Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD, or a password is generated once and written to DATA/platform-admin.txt.
 * User passwords are stored only as scrypt hashes and can never be read back, by anyone.
 */
const PLATFORM_EMAIL = cleanEmail(process.env.PLATFORM_ADMIN_EMAIL || 'admin@qyntrading.local')
if (process.env.PLATFORM_ADMIN_PASSWORD) {
  const salt = crypto.randomBytes(16).toString('hex')
  reg.platform = { salt, hash: hashPw(process.env.PLATFORM_ADMIN_PASSWORD, salt) }
  saveReg()
} else if (!reg.platform) {
  const pw = crypto.randomBytes(9).toString('base64url')
  const salt = crypto.randomBytes(16).toString('hex')
  reg.platform = { salt, hash: hashPw(pw, salt) }
  saveReg()
  fs.writeFileSync(path.join(DATA, 'platform-admin.txt'), `Platform owner sign-in\nEmail: ${PLATFORM_EMAIL}\nPassword: ${pw}\n`, { mode: 0o600 })
}

/**
 * Demo logins: one sample company with a user for each role, all sharing one password.
 * On with DEMO_ACCOUNTS=1 (the dev server turns it on). When off, the demo logins are removed so they cannot be used.
 */
const DEMO_ON = process.env.DEMO_ACCOUNTS === '1'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234'
const DEMO_USERS = [
  ['u1', 'Demo Owner', 'owner@demo.com', 'owner'],
  ['u2', 'Demo Accountant', 'accountant@demo.com', 'accountant'],
  ['u3', 'Demo Sales', 'sales@demo.com', 'sales'],
  ['u4', 'Demo Warehouse', 'warehouse@demo.com', 'warehouse'],
]
if (DEMO_ON) {
  if (!loadTenant('demo')) {
    const db = demoDb()
    db.company.name = 'QynTrading Demo'
    applyBusinessTypes(db, ['general', 'electronics', 'medical'])
    db.users = DEMO_USERS.map(([id, name, email, roleId]) => ({ id, name, email, roleId, employeeId: '' }))
    saveTenant('demo', { version: 1, db })
    reg.tenants.demo = { name: 'QynTrading Demo', createdAt: new Date().toISOString() }
  }
  for (const [userId, , email] of DEMO_USERS) {
    const salt = crypto.randomBytes(16).toString('hex')
    reg.accounts[email] = { tenantId: 'demo', userId, salt, hash: hashPw(DEMO_PASSWORD, salt) }
  }
  saveReg()
} else if (DEMO_USERS.some(([, , email]) => reg.accounts[email]?.tenantId === 'demo')) {
  for (const [, , email] of DEMO_USERS) if (reg.accounts[email]?.tenantId === 'demo') delete reg.accounts[email]
  saveReg()
}

function newSession(email, extra = {}) {
  const token = crypto.randomBytes(32).toString('hex')
  reg.sessions[sha(token)] = { email, exp: Date.now() + SESSION_DAYS * 86400000, ...extra }
  saveReg()
  return token
}

// slow down password guessing: 8 failed sign-ins per address per 10 minutes
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

const levelOf = (db, userId, page) => {
  const user = db.users.find((u) => u.id === userId)
  const role = user && db.roles.find((r) => r.id === user.roleId)
  if (!role) return 'none'
  return role.id === 'owner' ? 'edit' : role.perms[page] || 'none'
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const bad = (msg) => new HttpError(400, msg)

function readBody(req) {
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

function auth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const s = token && reg.sessions[sha(token)]
  if (!s || s.exp < Date.now()) throw new HttpError(401, 'Please sign in again.')
  if (s.platform) throw new HttpError(403, 'Open a company first.')
  const acc = s.as || reg.accounts[s.email]
  if (!acc) throw new HttpError(401, 'This account no longer exists.')
  const tenant = loadTenant(acc.tenantId)
  if (!tenant) throw new HttpError(401, 'This company no longer exists.')
  return { token, email: s.email, acc, tenant }
}
function platformAuth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const s = token && reg.sessions[sha(token)]
  if (!s || s.exp < Date.now() || !s.platform) throw new HttpError(401, 'Please sign in as the platform owner.')
}
const needAdmin = (ctx) => {
  if (levelOf(ctx.tenant.db, ctx.acc.userId, 'settings') !== 'edit') throw new HttpError(403, 'Only an admin can do that.')
}
const sessionInfo = (ctx) => ({ userId: ctx.acc.userId, email: ctx.email, tenantId: ctx.acc.tenantId, viaPlatform: ctx.email === PLATFORM_EMAIL })

const routes = {
  /** Lets the sign-in screen check the server is up, and offer the demo logins when they are switched on. */
  'GET /api/status': async () => ({
    ok: true,
    demo: DEMO_ON ? { password: DEMO_PASSWORD, logins: DEMO_USERS.map(([, name, email, roleId]) => ({ name, email, role: roleId[0].toUpperCase() + roleId.slice(1) })) } : null,
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
    if (reg.accounts[email] || email === PLATFORM_EMAIL) throw new HttpError(409, 'That email already has an account. Sign in instead.')
    const types = (Array.isArray(b.businessTypes) ? b.businessTypes : []).filter((t) => BUSINESS_TYPES[t])
    const db = b.sample ? demoDb() : emptyDb()
    db.company.name = company
    db.users = [{ id: 'u1', name, email, roleId: 'owner', employeeId: '' }]
    applyBusinessTypes(db, types.length ? types : ['general'])
    const tenantId = crypto.randomBytes(8).toString('hex')
    const salt = crypto.randomBytes(16).toString('hex')
    saveTenant(tenantId, { version: 1, db })
    reg.tenants[tenantId] = { name: company, createdAt: new Date().toISOString() }
    reg.accounts[email] = { tenantId, userId: 'u1', salt, hash: hashPw(b.password, salt) }
    const token = newSession(email)
    return { token, session: { userId: 'u1', email, tenantId }, db, version: 1 }
  },

  'POST /api/login': async (req) => {
    const b = await readBody(req)
    const email = cleanEmail(b.email)
    const key = `${req.socket.remoteAddress}|${email}`
    if (tooMany(key)) throw new HttpError(429, 'Too many attempts. Wait ten minutes and try again.')
    if (email === PLATFORM_EMAIL) {
      if (!safeEqual(hashPw(String(b.password || ''), reg.platform.salt), reg.platform.hash)) {
        noteFail(key)
        throw new HttpError(401, 'Wrong email or password.')
      }
      audit(`platform sign-in from ${req.socket.remoteAddress}`)
      return { platform: true, token: newSession(email, { platform: true }) }
    }
    const acc = reg.accounts[email]
    // hash even when the account is unknown so the timing does not reveal which emails exist
    const hash = hashPw(String(b.password || ''), acc?.salt || 'no-such-account')
    if (!acc || !safeEqual(hash, acc.hash)) {
      noteFail(key)
      throw new HttpError(401, 'Wrong email or password.')
    }
    const tenant = loadTenant(acc.tenantId)
    if (!tenant) throw new HttpError(401, 'This company no longer exists.')
    return { token: newSession(email), session: { userId: acc.userId, email, tenantId: acc.tenantId }, db: tenant.db, version: tenant.version }
  },

  'POST /api/logout': async (req) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    delete reg.sessions[sha(token)]
    saveReg()
    return { ok: true }
  },

  'GET /api/platform/companies': async (req) => {
    platformAuth(req)
    return {
      companies: Object.entries(reg.tenants).map(([id, t]) => {
        const db = loadTenant(id)?.db
        return {
          id, name: db?.company.name || t.name, createdAt: t.createdAt, trades: db?.businessTypes || [],
          counts: { products: db?.products.length || 0, invoices: db?.invoices.length || 0, shipments: db?.imports.length || 0 },
          users: (db?.users || []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: db.roles.find((r) => r.id === u.roleId)?.name || 'No role' })),
        }
      }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    }
  },

  /** Open a company's books as its owner. Every use is written to the audit log. */
  'POST /api/platform/open': async (req) => {
    platformAuth(req)
    const { tenantId } = await readBody(req)
    const tenant = loadTenant(tenantId)
    if (!tenant) throw bad('No such company.')
    const owner = tenant.db.users.find((u) => u.roleId === 'owner')
    if (!owner) throw bad('That company has no owner.')
    audit(`platform opened company ${tenantId} (${tenant.db.company.name}) as ${owner.email}`)
    const token = newSession(PLATFORM_EMAIL, { as: { tenantId, userId: owner.id }, exp: Date.now() + 4 * 3600000 })
    return { token, session: { userId: owner.id, email: owner.email, tenantId, viaPlatform: true }, db: tenant.db, version: tenant.version }
  },

  'POST /api/platform/password': async (req) => {
    platformAuth(req)
    const b = await readBody(req)
    const email = cleanEmail(b.email)
    const acc = reg.accounts[email]
    if (!acc) throw bad('No such user.')
    if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
    acc.salt = crypto.randomBytes(16).toString('hex')
    acc.hash = hashPw(b.password, acc.salt)
    for (const [k, s] of Object.entries(reg.sessions)) if (s.email === email) delete reg.sessions[k]
    saveReg()
    audit(`platform reset password for ${email}`)
    return { ok: true }
  },

  'GET /api/books': async (req, url) => {
    const ctx = auth(req)
    if (Number(url.searchParams.get('v')) === ctx.tenant.version) return { same: true, version: ctx.tenant.version }
    return { session: sessionInfo(ctx), db: ctx.tenant.db, version: ctx.tenant.version }
  },

  'PUT /api/books': async (req) => {
    const ctx = auth(req)
    const { db: cur, version } = ctx.tenant
    const b = await readBody(req)
    const next = b.db
    if (!next || next.v !== 1 || !Array.isArray(next.products) || !Array.isArray(next.invoices)) throw bad('Those are not valid books.')
    if (b.baseVersion !== version) throw new HttpError(409, 'Someone else changed the books.')
    const uid = ctx.acc.userId
    if (!cur.roles.some((r) => r.id === cur.users.find((u) => u.id === uid)?.roleId)) throw new HttpError(403, 'Your role was removed.')
    const canEditSomething = levelOf(cur, uid, 'settings') === 'edit' || Object.values(cur.roles.find((r) => r.id === cur.users.find((u) => u.id === uid).roleId).perms).includes('edit')
    if (!canEditSomething) throw new HttpError(403, 'Your role is view-only.')
    next.users = cur.users // users only change through /api/users
    if (levelOf(cur, uid, 'settings') !== 'edit') {
      // only an admin may change roles, company details and custom fields
      next.roles = cur.roles
      next.company = cur.company
      next.fieldDefs = cur.fieldDefs
      next.businessTypes = cur.businessTypes
    } else if (!next.roles?.some((r) => r.id === 'owner')) throw bad('The Owner role cannot be removed.')
    ctx.tenant.db = next
    ctx.tenant.version = version + 1
    saveTenant(ctx.acc.tenantId, ctx.tenant)
    return { version: ctx.tenant.version }
  },

  'POST /api/users': async (req) => {
    const ctx = auth(req)
    needAdmin(ctx)
    const b = await readBody(req)
    const email = cleanEmail(b.email)
    const name = String(b.name || '').trim()
    const { db } = ctx.tenant
    if (!name) throw bad('Enter the user’s name.')
    if (!validEmail(email)) throw bad('Enter a valid email address.')
    if (String(b.password || '').length < 8) throw bad('Use a password of at least 8 characters.')
    if (!db.roles.some((r) => r.id === b.roleId)) throw bad('Choose a role.')
    if (reg.accounts[email]) throw new HttpError(409, 'That email already has an account.')
    const id = 'u' + ++db.seq.id
    db.users.push({ id, name, email, roleId: b.roleId, employeeId: b.employeeId || '' })
    const salt = crypto.randomBytes(16).toString('hex')
    reg.accounts[email] = { tenantId: ctx.acc.tenantId, userId: id, salt, hash: hashPw(b.password, salt) }
    ctx.tenant.version++
    saveTenant(ctx.acc.tenantId, ctx.tenant)
    saveReg()
    return { db, version: ctx.tenant.version }
  },

  'PATCH /api/users': async (req) => {
    const ctx = auth(req)
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
      const acc = reg.accounts[user.email]
      acc.salt = crypto.randomBytes(16).toString('hex')
      acc.hash = hashPw(b.password, acc.salt)
      for (const [k, s] of Object.entries(reg.sessions)) if (s.email === user.email && k !== sha(ctx.token)) delete reg.sessions[k]
      saveReg()
    }
    ctx.tenant.version++
    saveTenant(ctx.acc.tenantId, ctx.tenant)
    return { db, version: ctx.tenant.version }
  },

  'DELETE /api/users': async (req, url) => {
    const ctx = auth(req)
    needAdmin(ctx)
    const id = url.searchParams.get('id')
    const { db } = ctx.tenant
    const user = db.users.find((u) => u.id === id)
    if (!user) throw bad('No such user.')
    if (id === ctx.acc.userId) throw bad('You cannot remove yourself.')
    if (user.roleId === 'owner' && db.users.filter((u) => u.roleId === 'owner').length === 1) throw bad('There must be at least one Owner.')
    db.users = db.users.filter((u) => u.id !== id)
    delete reg.accounts[user.email]
    for (const [k, s] of Object.entries(reg.sessions)) if (s.email === user.email) delete reg.sessions[k]
    ctx.tenant.version++
    saveTenant(ctx.acc.tenantId, ctx.tenant)
    saveReg()
    return { db, version: ctx.tenant.version }
  },
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' }
function serveStatic(url, res) {
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST)) file = DIST
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    return res.end('Run "npm run build" first, or use "npm run dev".')
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(file).pipe(res)
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return serveStatic(url, res)
  const handler = routes[`${req.method} ${url.pathname}`]
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (!handler) return send(404, { error: 'Not found.' })
  try {
    send(200, await handler(req, url))
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e)
    send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong on the server.' })
  }
}).listen(PORT, () => {
  console.log(`QynTrading server on http://localhost:${PORT}  (data in ${DATA})`)
  if (DEMO_ON) console.log(`Demo logins are ON: ${DEMO_USERS.map((u) => u[2]).join(', ')}  (password: ${DEMO_PASSWORD})`)
  console.log(`Platform owner sign-in: ${PLATFORM_EMAIL}  (password: ${process.env.PLATFORM_ADMIN_PASSWORD ? 'from PLATFORM_ADMIN_PASSWORD' : 'see ' + path.join(DATA, 'platform-admin.txt')})`)
})
