/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { applyBusinessTypes } from './presets.js'
import { localCall } from './localApi.js'
import { byId, importCalc } from './selectors.js'

/** 'local' keeps everything in this browser (frontend-only hosting). Build with VITE_BACKEND=server to use the real server. */
export const BACKEND = import.meta.env.VITE_BACKEND === 'server' ? 'server' : 'local'

const TOKEN_KEY = 'books-session'
const PLAT_KEY = 'books-platform'
const getToken = (key = TOKEN_KEY) => {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}
const setToken = (t, key = TOKEN_KEY) => {
  try {
    if (t) localStorage.setItem(key, t)
    else localStorage.removeItem(key)
  } catch {
    /* private window: the session lasts until the tab closes */
  }
}

async function call(method, path, body, token) {
  if (BACKEND === 'local') return localCall(method, path, body, token)
  let res
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Check your connection.'), { status: 0 })
  }
  const data = await res.json().catch(() => null)
  // a reply that is not from our server (for example the dev proxy failing) means the books server is down
  if (data === null) throw Object.assign(new Error(res.status >= 500 ? `The server failed (${res.status}). Check the deployment logs.` : 'The books server is not running. Start it with “npm run dev”, then try again.'), { status: 0 })
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status })
  return data
}

/** Set by the app shell: when the signed-in role can only view the current screen, changes are refused. */
export const access = { readonly: false }

const tick = (d) => ++d.seq.ts
const uid = (d, p) => p + ++d.seq.id

/** Every change to the books. Each one takes a draft copy and edits it in place. */
const A = {
  replaceAll(d, next) {
    const keep = { users: d.users, roles: d.roles }
    for (const k of Object.keys(d)) delete d[k]
    Object.assign(d, next, keep)
  },
  saveCompany(d, p) { Object.assign(d.company, p) },

  saveRole(d, p) {
    const cur = p.id && byId(d.roles, p.id)
    if (cur) Object.assign(cur, { name: p.name, perms: p.perms })
    else d.roles.push({ id: uid(d, 'role'), name: p.name, perms: p.perms })
  },
  removeRole(d, id) { d.roles = d.roles.filter((r) => r.id !== id || r.system) },
  addField(d, p) { d.fieldDefs.push({ id: uid(d, 'cf'), ...p }) },
  removeField(d, id) { d.fieldDefs = d.fieldDefs.filter((f) => f.id !== id) },
  setBusinessTypes(d, types) {
    const added = types.filter((t) => !d.businessTypes.includes(t))
    d.businessTypes = types
    applyBusinessTypes(d, added)
  },

  addCategory(d, p) { d.categories.push({ id: uid(d, 'c'), name: p.name, parentId: p.parentId || null }) },
  saveProduct(d, p) {
    const cur = p.id && byId(d.products, p.id)
    if (cur) Object.assign(cur, p)
    else d.products.push({ ...p, id: uid(d, 'p') })
  },

  addFactory(d, p) { d.factories.push({ id: uid(d, 'f'), ...p }) },
  newFactoryOrder(d, p) {
    const o = {
      id: 'FO-' + d.seq.fo++, ts: tick(d), factoryId: p.factoryId, type: p.type, productId: p.productId, qty: p.qty, rate: p.rate,
      placed: p.placed, expected: p.expected, materials: p.materials, custom: p.custom || {}, receipts: [], bills: [], payments: [],
    }
    if (p.advance > 0) o.payments.push({ id: uid(d, 'fp'), ts: tick(d), date: p.placed, amount: p.advance, method: p.method, note: `Advance for ${o.id}` })
    for (const m of p.materials) byId(d.products, m.productId).stock -= m.given
    d.factoryOrders.unshift(o)
  },
  receiveShipment(d, p) {
    const o = byId(d.factoryOrders, p.orderId)
    o.receipts.push({ id: uid(d, 'fr'), ts: tick(d), date: p.date, challan: p.challan, qty: p.qty, damaged: p.damaged, note: p.note })
    const prod = byId(d.products, o.productId)
    if (prod) prod.stock += p.qty
  },
  factoryBill(d, p) {
    byId(d.factoryOrders, p.orderId).bills.push({ id: uid(d, 'fb'), ts: tick(d), date: p.date, billNo: p.billNo, amount: p.amount, receiptId: p.receiptId })
  },
  payFactory(d, p) {
    byId(d.factoryOrders, p.orderId).payments.push({ id: uid(d, 'fp'), ts: tick(d), date: p.date, amount: p.amount, method: p.method, note: p.note })
  },

  addSupplier(d, p) { d.suppliers.push({ id: uid(d, 's'), ...p }) },
  newPurchase(d, p) {
    const id = uid(d, 'pur')
    d.seq.pb++
    d.purchases.push({ id, billNo: p.billNo, ts: tick(d), supplierId: p.supplierId, date: p.date, productId: p.productId, qty: p.qty, rate: p.rate, terms: p.terms })
    const prod = byId(d.products, p.productId)
    prod.stock += p.qty
    prod.cost = p.rate
    if (p.paid > 0) d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: id, date: p.date, amount: p.paid, method: p.method, note: 'Paid on purchase' })
  },
  paySupplier(d, p) {
    d.supplierPayments.push({ id: uid(d, 'sp'), ts: tick(d), supplierId: p.supplierId, purchaseId: p.purchaseId || '', date: p.date, amount: p.amount, method: p.method, note: p.note })
  },

  newImport(d, p) {
    const exp = p.direction === 'export'
    const { startDate, expected, ...rest } = p
    const steps = exp
      ? { contract: { date: startDate }, ready: {}, customs: {}, shipped: { expected }, paid: {} }
      : { lc: { date: startDate }, shipped: {}, port: { expected }, customs: {}, warehouse: {} }
    const id = exp ? 'EXP-' + String(d.seq.exp++).padStart(3, '0') : 'IMP-' + String(d.seq.imp++).padStart(3, '0')
    d.imports.unshift({ id, ts: tick(d), costs: [], steps, ...rest })
  },
  addImportCost(d, p) {
    byId(d.imports, p.importId).costs.push({ id: uid(d, 'ic'), ts: tick(d), type: p.type, amount: p.amount, method: p.method, date: p.date })
  },
  markImportStep(d, p) {
    const imp = byId(d.imports, p.importId)
    imp.steps[p.key] = { date: p.date }
    const prod = imp.productId && byId(d.products, imp.productId)
    if (!prod) return
    if (imp.direction !== 'export' && p.key === 'warehouse') {
      prod.stock += imp.qty
      prod.cost = Math.round(importCalc(d, imp).perUnit * 100) / 100
    }
    if (imp.direction === 'export' && p.key === 'shipped') {
      imp.unitCost = prod.cost
      prod.stock -= imp.qty
    }
  },
  saveCustoms(d, p) {
    const imp = byId(d.imports, p.importId)
    imp.customs = { stages: {}, docs: {}, rates: {}, ...imp.customs, ...p.data }
  },
  toggleCustomsDoc(d, p) {
    const imp = byId(d.imports, p.importId)
    imp.customs = { stages: {}, docs: {}, rates: {}, ...imp.customs }
    imp.customs.docs[p.name] = !imp.customs.docs[p.name]
  },
  markCustomsStage(d, p) {
    const imp = byId(d.imports, p.importId)
    imp.customs = { stages: {}, docs: {}, rates: {}, ...imp.customs }
    imp.customs.stages[p.key] = p.date
    if (p.key === 'release' && !imp.steps.customs?.date) imp.steps.customs = { date: p.date }
  },

  saveDealer(d, p) {
    const cur = p.id && byId(d.dealers, p.id)
    if (cur) Object.assign(cur, p)
    else d.dealers.push({ ...p, id: uid(d, 'd') })
  },
  saveInvoice(d, { id, data, final }) {
    let inv = id && byId(d.invoices, id)
    if (!inv) {
      inv = { id: uid(d, 'DRAFT-'), status: 'draft' }
      d.invoices.push(inv)
    }
    Object.assign(inv, data, { ts: tick(d) })
    if (final) {
      inv.status = 'final'
      inv.id = (d.company.invoicePrefix || '') + d.seq.inv++
      for (const l of inv.lines) {
        const prod = byId(d.products, l.productId)
        l.name = prod.name
        l.unit = prod.unit
        l.cost = prod.cost
        prod.stock -= l.qty
      }
    }
  },
  collect(d, p) { d.collections.push({ id: uid(d, 'col'), ts: tick(d), ...p }) },

  addExpense(d, p) { d.expenses.push({ id: uid(d, 'ex'), ts: tick(d), ...p }) },
  addAdvance(d, p) { d.advances.push({ id: uid(d, 'ad'), ts: tick(d), ...p }) },
  saveEmployee(d, p) {
    const cur = p.id && byId(d.employees, p.id)
    if (cur) Object.assign(cur, p)
    else d.employees.push({ ...p, id: uid(d, 'e') })
  },
  payPayroll(d, p) { d.payroll.push({ id: uid(d, 'pr'), ts: tick(d), ...p }) },
}

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

/**
 * Holds the signed-in session and this company's books.
 * Changes apply on screen at once and are saved to the server in the background.
 */
export function StoreProvider({ children }) {
  const [st, setSt] = useState({ phase: getToken() ? 'loading' : getToken(PLAT_KEY) ? 'platform' : 'signedOut', db: null, session: null })
  const [sync, setSync] = useState('saved') // saved | saving | offline
  const [notice, setNotice] = useState('')
  const ref = useRef({ token: getToken(), version: 0, db: null, dirty: false, busy: false, timer: 0 })

  const enter = useCallback((r) => {
    Object.assign(ref.current, { token: r.token ?? ref.current.token, version: r.version, db: r.db, dirty: false })
    if (r.token) setToken(r.token)
    setSt((s) => ({ phase: 'ready', db: r.db, session: r.session || s.session }))
  }, [])
  const leave = useCallback(() => {
    setToken('')
    Object.assign(ref.current, { token: '', version: 0, db: null, dirty: false })
    setSt({ phase: getToken(PLAT_KEY) ? 'platform' : 'signedOut', db: null, session: null })
  }, [])

  const pull = useCallback(async (force) => {
    const r = ref.current
    if (!r.token || r.busy || (r.dirty && !force)) return
    try {
      const res = await call('GET', `books?v=${force ? 0 : r.version}`, null, r.token)
      if (!res.same) enter(res)
      setSync('saved')
    } catch (e) {
      if (e.status === 401) leave()
      else if (e.status === 0) setSync('offline')
    }
  }, [enter, leave])

  const pushRef = useRef(() => {})
  const push = useCallback(async () => {
    const r = ref.current
    if (r.busy || !r.dirty || !r.token) return
    r.busy = true
    r.dirty = false
    setSync('saving')
    try {
      const res = await call('PUT', 'books', { db: r.db, baseVersion: r.version }, r.token)
      r.version = res.version
      r.busy = false
      if (r.dirty) pushRef.current()
      else setSync('saved')
    } catch (e) {
      r.busy = false
      if (e.status === 401) return leave()
      if (e.status === 0) {
        r.dirty = true
        setSync('offline')
        r.timer = setTimeout(() => pushRef.current(), 4000)
        return
      }
      // someone else saved first, or the change was not allowed: take the server's copy
      setNotice(e.status === 409 ? 'Someone else just changed the books. Reloaded the latest, please redo your last change.' : e.message)
      pull(true)
    }
  }, [leave, pull])

  useEffect(() => {
    pushRef.current = push
  }, [push])

  const act = useCallback((name, payload) => {
    if (access.readonly) {
      setNotice('Your role can only view this screen.')
      return
    }
    setSt((s) => {
      const draft = structuredClone(s.db)
      A[name](draft, payload)
      ref.current.db = draft
      return { ...s, db: draft }
    })
    ref.current.dirty = true
    clearTimeout(ref.current.timer)
    ref.current.timer = setTimeout(push, 350)
  }, [push])

  useEffect(() => {
    if (ref.current.token) pull(true)
    const id = setInterval(() => pull(false), 15000)
    const onFocus = () => pull(false)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [pull])

  const api = useMemo(() => ({
    signIn: async (path, body) => {
      const res = await call('POST', path, body)
      if (!res.platform) return enter(res)
      setToken(res.token, PLAT_KEY)
      setSt({ phase: 'platform', db: null, session: null })
    },
    signOut: async () => {
      call('POST', 'logout', null, ref.current.token).catch(() => {})
      leave()
    },
    status: () => call('GET', 'status'),
    /** platform owner: list companies, open one, reset a password, leave */
    platform: (method, path, body) => call(method, 'platform/' + path, body, getToken(PLAT_KEY)),
    openCompany: async (tenantId) => enter(await call('POST', 'platform/open', { tenantId }, getToken(PLAT_KEY))),
    platformSignOut: () => {
      call('POST', 'logout', null, getToken(PLAT_KEY)).catch(() => {})
      setToken('', PLAT_KEY)
      setSt({ phase: 'signedOut', db: null, session: null })
    },
    /** user management goes through the server because it owns the passwords */
    users: async (method, body, query = '') => enter(await call(method, 'users' + query, body, ref.current.token)),
  }), [enter, leave])

  const value = useMemo(() => ({ ...st, act, sync, notice, clearNotice: () => setNotice(''), ...api }), [st, act, sync, notice, api])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
