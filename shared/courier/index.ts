/**
 * Courier booking, independent of where it runs: the API core calls it on the server (keys from the
 * server's environment or from Settings) or in the browser in frontend-only mode.
 *
 * Each courier is one adapter. The Steadfast, Pathao and RedX adapters follow each company's published
 * merchant API; check them with your own keys (and the courier's sandbox address) before going live.
 * To add another courier, write its adapter and list it in ADAPTERS and FIELDS.
 */
import type { CourierProvider } from '../domain/types'

/** Every credential a courier might need. Each adapter reads the ones it uses. */
export interface CourierKeys {
  provider: CourierProvider
  apiKey?: string
  secretKey?: string
  username?: string
  password?: string
  storeId?: string
  /** Override the courier's API address, e.g. its sandbox. */
  baseUrl?: string
  /** Test mode: simulate the courier instead of calling it. */
  test?: boolean
}
export type KeyName = Exclude<keyof CourierKeys, 'provider' | 'test'>

export interface BookRequest {
  /** Our reference, normally the invoice number. Couriers reject a repeat. */
  invoice: string
  name: string
  phone: string
  address: string
  /** Cash to collect on delivery; 0 for prepaid. */
  cod: number
  note: string
  /** Kilograms. */
  weight?: number
  /** Number of items in the parcel. */
  quantity?: number
  /** Pathao city and zone, or RedX area: the courier's own ids and the name shown to people. */
  cityId?: string
  zoneId?: string
  areaId?: string
  areaName?: string
}

export interface BookResult {
  consignmentId: string
  trackingCode: string
  trackingUrl: string
  status: string
  charge?: number
}

export interface Area {
  id: string
  name: string
}

export interface TrackResult {
  status: string
  trackingUrl: string
  events: { time: string; text: string }[]
}

type Fetch = typeof fetch

interface Adapter {
  label: string
  /** Which delivery areas the booking form asks for. */
  areas?: 'city-zone' | 'area'
  book(keys: CourierKeys, req: BookRequest, http: Fetch): Promise<BookResult>
  status(keys: CourierKeys, consignmentId: string, http: Fetch): Promise<string>
  track?(keys: CourierKeys, code: string, http: Fetch): Promise<TrackResult>
  listAreas?(keys: CourierKeys, parentId: string, http: Fetch): Promise<Area[]>
  balance?(keys: CourierKeys, http: Fetch): Promise<number>
  /** A cheap call that proves the keys work. */
  test?(keys: CourierKeys, http: Fetch): Promise<string>
}

export class CourierError extends Error {}

/** Bangladesh mobile numbers in the 11-digit form couriers expect: 01XXXXXXXXX. */
export function localPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('880') && d.length === 13) return '0' + d.slice(3)
  return d
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T
}

/* ---------- Demo ---------- */

/** A pretend courier for trying the flow: parcels move to "in transit" after a few minutes and "delivered" after an hour. */
const demo: Adapter = {
  label: 'Demo (no real courier)',
  async book(_k, req) {
    const id = `DEMO-${Date.now().toString(36).toUpperCase()}`
    return { consignmentId: id, trackingCode: `DM${req.invoice.replace(/\W/g, '')}`, trackingUrl: '', status: 'in_review', charge: 60 }
  },
  async status(_k, id) {
    const made = parseInt(id.replace('DEMO-', ''), 36)
    const mins = Number.isFinite(made) ? (Date.now() - made) / 60000 : 0
    return mins > 60 ? 'delivered' : mins > 3 ? 'in_transit' : 'in_review'
  },
  async track(k, code, http) {
    const status = await this.status(k, code, http)
    return { status, trackingUrl: '', events: [{ time: new Date().toISOString(), text: PARCEL_STATUS[status] || status }] }
  },
  async balance() {
    return 0
  },
  async test() {
    return 'Demo courier is always ready.'
  },
}

/* ---------- Steadfast (packzy) ---------- */

const sfBase = (k: CourierKeys) => k.baseUrl || 'https://portal.packzy.com/api/v1'
const sfHeaders = (k: CourierKeys) => ({ 'Api-Key': k.apiKey || '', 'Secret-Key': k.secretKey || '', 'Content-Type': 'application/json', Accept: 'application/json' })

const steadfast: Adapter = {
  label: 'Steadfast Courier',
  async book(k, req, http) {
    const res = await http(`${sfBase(k)}/create_order`, {
      method: 'POST',
      headers: sfHeaders(k),
      body: JSON.stringify({
        invoice: req.invoice, recipient_name: req.name, recipient_phone: localPhone(req.phone), recipient_address: req.address,
        cod_amount: Math.round(req.cod), note: req.note,
      }),
    })
    const data = await json<{ status?: number; message?: string; errors?: Record<string, string[]>; consignment?: { consignment_id?: number | string; tracking_code?: string; status?: string } }>(res)
    if (!res.ok || data.status !== 200 || !data.consignment) {
      const detail = data.errors ? Object.values(data.errors).flat().join(' ') : data.message
      throw new CourierError(`Steadfast did not accept the parcel${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`)
    }
    const c = data.consignment
    return { consignmentId: String(c.consignment_id ?? ''), trackingCode: c.tracking_code || '', trackingUrl: c.tracking_code ? `https://steadfast.com.bd/t/${c.tracking_code}` : '', status: c.status || 'in_review' }
  },
  async status(k, id, http) {
    const res = await http(`${sfBase(k)}/status_by_cid/${encodeURIComponent(id)}`, { headers: sfHeaders(k) })
    const data = await json<{ delivery_status?: string }>(res)
    if (!res.ok || !data.delivery_status) throw new CourierError(`Steadfast did not return a status (HTTP ${res.status}).`)
    return data.delivery_status
  },
  async track(k, code, http) {
    // a tracking code (letters) or a consignment id (digits)
    const path = /^\d+$/.test(code) ? `status_by_cid/${code}` : `status_by_trackingcode/${encodeURIComponent(code)}`
    const res = await http(`${sfBase(k)}/${path}`, { headers: sfHeaders(k) })
    const data = await json<{ delivery_status?: string }>(res)
    if (!res.ok || !data.delivery_status) throw new CourierError('Steadfast has no parcel with that code.')
    return { status: data.delivery_status, trackingUrl: /^\d+$/.test(code) ? '' : `https://steadfast.com.bd/t/${code}`, events: [] }
  },
  async balance(k, http) {
    const res = await http(`${sfBase(k)}/get_balance`, { headers: sfHeaders(k) })
    const data = await json<{ current_balance?: number }>(res)
    if (!res.ok || data.current_balance == null) throw new CourierError(`Steadfast refused the keys (HTTP ${res.status}).`)
    return data.current_balance
  },
  async test(k, http) {
    return `Connected. Balance with Steadfast: Tk ${await this.balance!(k, http)}.`
  },
}

/* ---------- Pathao (Aladdin merchant API) ---------- */

const pBase = (k: CourierKeys) => k.baseUrl || 'https://api-hermes.pathao.com'
const tokens = new Map<string, { token: string; until: number }>()

async function pathaoToken(k: CourierKeys, http: Fetch): Promise<string> {
  const key = `${pBase(k)}|${k.apiKey}|${k.username}`
  const hit = tokens.get(key)
  if (hit && hit.until > Date.now()) return hit.token
  const res = await http(`${pBase(k)}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: k.apiKey, client_secret: k.secretKey, username: k.username, password: k.password, grant_type: 'password' }),
  })
  const data = await json<{ access_token?: string; expires_in?: number; message?: string }>(res)
  if (!res.ok || !data.access_token) throw new CourierError(`Pathao refused the login${data.message ? `: ${data.message}` : ` (HTTP ${res.status})`}.`)
  tokens.set(key, { token: data.access_token, until: Date.now() + Math.max((data.expires_in || 3600) - 300, 60) * 1000 })
  return data.access_token
}
const pHeaders = async (k: CourierKeys, http: Fetch) => ({ Authorization: `Bearer ${await pathaoToken(k, http)}`, 'Content-Type': 'application/json', Accept: 'application/json' })

const pathao: Adapter = {
  label: 'Pathao Courier',
  areas: 'city-zone',
  async book(k, req, http) {
    if (!k.storeId) throw new CourierError('Add your Pathao store id under Couriers.')
    if (!req.cityId || !req.zoneId) throw new CourierError('Pick the city and zone for Pathao.')
    const res = await http(`${pBase(k)}/aladdin/api/v1/orders`, {
      method: 'POST',
      headers: await pHeaders(k, http),
      body: JSON.stringify({
        store_id: Number(k.storeId), merchant_order_id: req.invoice, recipient_name: req.name, recipient_phone: localPhone(req.phone), recipient_address: req.address,
        recipient_city: Number(req.cityId), recipient_zone: Number(req.zoneId), delivery_type: 48, item_type: 2, special_instruction: req.note,
        item_quantity: req.quantity || 1, item_weight: req.weight || 0.5, amount_to_collect: Math.round(req.cod), item_description: req.note,
      }),
    })
    const data = await json<{ message?: string; errors?: Record<string, string[]>; data?: { consignment_id?: string; order_status?: string; delivery_fee?: number } }>(res)
    if (!res.ok || !data.data?.consignment_id) {
      const detail = data.errors ? Object.values(data.errors).flat().join(' ') : data.message
      throw new CourierError(`Pathao did not accept the parcel${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`)
    }
    const id = data.data.consignment_id
    return { consignmentId: id, trackingCode: id, trackingUrl: `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(id)}`, status: (data.data.order_status || 'Pending').toLowerCase(), charge: data.data.delivery_fee }
  },
  async status(k, id, http) {
    const res = await http(`${pBase(k)}/aladdin/api/v1/orders/${encodeURIComponent(id)}/info`, { headers: await pHeaders(k, http) })
    const data = await json<{ data?: { order_status?: string; order_status_slug?: string } }>(res)
    const s = data.data?.order_status_slug || data.data?.order_status
    if (!res.ok || !s) throw new CourierError(`Pathao did not return a status (HTTP ${res.status}).`)
    return s.toLowerCase().replace(/[\s-]+/g, '_')
  },
  async track(k, code, http) {
    const status = await this.status(k, code, http)
    return { status, trackingUrl: `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(code)}`, events: [] }
  },
  async listAreas(k, parentId, http) {
    const url = parentId ? `${pBase(k)}/aladdin/api/v1/cities/${encodeURIComponent(parentId)}/zone-list` : `${pBase(k)}/aladdin/api/v1/city-list`
    const res = await http(url, { headers: await pHeaders(k, http) })
    const data = await json<{ data?: { data?: { city_id?: number; city_name?: string; zone_id?: number; zone_name?: string }[] } }>(res)
    if (!res.ok || !data.data?.data) throw new CourierError(`Pathao did not send the ${parentId ? 'zones' : 'cities'} (HTTP ${res.status}).`)
    return data.data.data.map((x) => ({ id: String(x.zone_id ?? x.city_id), name: String(x.zone_name ?? x.city_name) }))
  },
  async test(k, http) {
    await pathaoToken(k, http)
    return 'Connected to Pathao.'
  },
}

/* ---------- RedX (open API) ---------- */

const rBase = (k: CourierKeys) => k.baseUrl || 'https://openapi.redx.com.bd/v1.0.0-beta'
const rHeaders = (k: CourierKeys) => ({ 'API-ACCESS-TOKEN': `Bearer ${k.apiKey || ''}`, 'Content-Type': 'application/json', Accept: 'application/json' })
const rTrackUrl = (id: string) => `https://redx.com.bd/track-parcel/?trackingId=${encodeURIComponent(id)}`

const redx: Adapter = {
  label: 'RedX',
  areas: 'area',
  async book(k, req, http) {
    if (!req.areaId) throw new CourierError('Pick the RedX delivery area.')
    const res = await http(`${rBase(k)}/parcel`, {
      method: 'POST',
      headers: rHeaders(k),
      body: JSON.stringify({
        customer_name: req.name, customer_phone: localPhone(req.phone), delivery_area: req.areaName || '', delivery_area_id: Number(req.areaId), customer_address: req.address,
        merchant_invoice_id: req.invoice, cash_collection_amount: String(Math.round(req.cod)), parcel_weight: Math.round((req.weight || 0.5) * 1000), instruction: req.note, value: Math.round(req.cod),
      }),
    })
    const data = await json<{ tracking_id?: string; message?: string }>(res)
    if (!res.ok || !data.tracking_id) throw new CourierError(`RedX did not accept the parcel${data.message ? `: ${data.message}` : ` (HTTP ${res.status})`}.`)
    return { consignmentId: data.tracking_id, trackingCode: data.tracking_id, trackingUrl: rTrackUrl(data.tracking_id), status: 'pickup-pending' }
  },
  async status(k, id, http) {
    const res = await http(`${rBase(k)}/parcel/info/${encodeURIComponent(id)}`, { headers: rHeaders(k) })
    const data = await json<{ parcel?: { status?: string } }>(res)
    if (!res.ok || !data.parcel?.status) throw new CourierError(`RedX did not return a status (HTTP ${res.status}).`)
    return data.parcel.status
  },
  async track(k, code, http) {
    const res = await http(`${rBase(k)}/parcel/track/${encodeURIComponent(code)}`, { headers: rHeaders(k) })
    const data = await json<{ tracking?: { message_en?: string; time?: string }[] }>(res)
    if (!res.ok || !data.tracking) throw new CourierError('RedX has no parcel with that tracking id.')
    const events = data.tracking.map((t) => ({ time: t.time || '', text: t.message_en || '' }))
    return { status: await this.status(k, code, http).catch(() => events[0]?.text || 'unknown'), trackingUrl: rTrackUrl(code), events }
  },
  async listAreas(k, _parent, http) {
    const res = await http(`${rBase(k)}/areas`, { headers: rHeaders(k) })
    const data = await json<{ areas?: { id?: number; name?: string; district_name?: string }[] }>(res)
    if (!res.ok || !data.areas) throw new CourierError(`RedX did not send its areas (HTTP ${res.status}).`)
    return data.areas.map((a) => ({ id: String(a.id), name: a.district_name ? `${a.name}, ${a.district_name}` : String(a.name) }))
  },
  async test(k, http) {
    const n = (await this.listAreas!(k, '', http)).length
    return `Connected to RedX (${n} delivery areas).`
  },
}

const ADAPTERS: Partial<Record<CourierProvider, Adapter>> = { steadfast, pathao, redx, demo }

/* ---------- test mode: each courier simulated, no keys and no network ---------- */

/** Each courier's own status words, in the order a parcel moves through them. */
export const SIM_STEPS: Partial<Record<CourierProvider, string[]>> = {
  steadfast: ['in_review', 'pending', 'in_transit', 'delivered'],
  pathao: ['pickup_requested', 'picked', 'in_transit_to_delivery_hub', 'assigned_for_delivery', 'delivered'],
  redx: ['pickup-pending', 'ready-for-delivery', 'delivery-in-progress', 'delivered'],
}
/** Minutes after booking at which a simulated parcel reaches each step. */
const SIM_AT = [0, 2, 10, 30, 60]

/** A consignment id in the courier's own style, carrying the booking time so status can follow from it. */
export function simConsignment(p: CourierProvider, at: number): { id: string; tracking: string } {
  const t = at.toString(36).toUpperCase()
  if (p === 'steadfast') return { id: String(at).slice(-9), tracking: t.slice(-8) }
  if (p === 'pathao') return { id: `DT${t}`, tracking: `DT${t}` }
  if (p === 'redx') return { id: `21A${t}`, tracking: `21A${t}` }
  return { id: `DEMO-${t}`, tracking: `DM${t}` }
}
function simBookedAt(p: CourierProvider, id: string): number {
  if (p === 'steadfast') return Number(id) || 0
  const n = parseInt(id.replace(/^(DT|21A|DEMO-)/, ''), 36)
  return Number.isFinite(n) ? n : 0
}
/** Where a simulated parcel booked at `at` is now. Steadfast ids keep only the last 9 digits, so they are re-anchored to now. */
export function simStatus(p: CourierProvider, id: string, now = Date.now()): string {
  const steps = SIM_STEPS[p] || ['in_review', 'in_transit', 'delivered']
  let at = simBookedAt(p, id)
  if (p === 'steadfast') at = now - ((now % 1e9) - at + 1e9) % 1e9
  const mins = (now - at) / 60000
  let i = 0
  SIM_AT.forEach((m, k) => mins >= m && (i = k))
  return steps[Math.min(i, steps.length - 1)]
}

const SIM_CITIES: Area[] = [{ id: '1', name: 'Dhaka' }, { id: '2', name: 'Chattogram' }, { id: '3', name: 'Sylhet' }, { id: '4', name: 'Khulna' }]
const SIM_ZONES: Record<string, Area[]> = {
  '1': [{ id: '101', name: 'Mirpur' }, { id: '102', name: 'Dhanmondi' }, { id: '103', name: 'Uttara' }, { id: '104', name: 'Motijheel' }],
  '2': [{ id: '201', name: 'Agrabad' }, { id: '202', name: 'Halishahar' }, { id: '203', name: 'Chawkbazar' }, { id: '204', name: 'Hathazari' }, { id: '205', name: 'Patiya' }],
  '3': [{ id: '301', name: 'Zindabazar' }, { id: '302', name: 'Amberkhana' }],
  '4': [{ id: '401', name: 'Sonadanga' }, { id: '402', name: 'Khalishpur' }],
}
const SIM_AREAS: Area[] = Object.entries(SIM_ZONES).flatMap(([c, zs]) => zs.map((z) => ({ id: z.id, name: `${z.name}, ${SIM_CITIES.find((x) => x.id === c)?.name}` })))

function simulated(p: CourierProvider): Adapter {
  const real = ADAPTERS[p]
  const label = `${real?.label || p} (test mode)`
  const trackUrl = (code: string) => (p === 'steadfast' ? `https://steadfast.com.bd/t/${code}` : p === 'pathao' ? `https://merchant.pathao.com/tracking?consignment_id=${code}` : p === 'redx' ? `https://redx.com.bd/track-parcel/?trackingId=${code}` : '')
  return {
    label,
    areas: real?.areas,
    async book(_k, req) {
      if (p === 'pathao' && (!req.cityId || !req.zoneId)) throw new CourierError('Pick the city and zone for Pathao.')
      if (p === 'redx' && !req.areaId) throw new CourierError('Pick the RedX delivery area.')
      const c = simConsignment(p, Date.now())
      const charge = p === 'redx' ? 70 : p === 'pathao' ? (req.cityId === '1' ? 60 : 110) : 60 + Math.max(Math.ceil((req.weight || 1) - 1), 0) * 15
      return { consignmentId: c.id, trackingCode: c.tracking, trackingUrl: trackUrl(c.tracking), status: (SIM_STEPS[p] || ['in_review'])[0], charge }
    },
    async status(_k, id) {
      return simStatus(p, id)
    },
    async track(_k, code) {
      const steps = SIM_STEPS[p] || ['in_review', 'in_transit', 'delivered']
      const now = simStatus(p, code)
      const reached = steps.slice(0, steps.indexOf(now) + 1)
      return { status: now, trackingUrl: trackUrl(code), events: reached.map((s, i) => ({ time: new Date(Date.now() - (reached.length - i) * 600000).toISOString(), text: PARCEL_STATUS[s] || s })).reverse() }
    },
    async listAreas(_k, parentId) {
      return p === 'pathao' ? (parentId ? SIM_ZONES[parentId] || [] : SIM_CITIES) : p === 'redx' ? SIM_AREAS : []
    },
    async balance() {
      return 12450
    },
    async test() {
      return `Test mode: ${real?.label || p} is simulated, no keys needed. Balance Tk 12,450 (pretend).`
    },
  }
}

/** The credentials each courier asks for, in the order the settings form shows them. */
export const FIELDS: Record<CourierProvider, { key: KeyName; label: string; secret?: boolean; hint?: string }[]> = {
  steadfast: [
    { key: 'apiKey', label: 'API key' },
    { key: 'secretKey', label: 'Secret key', secret: true },
    { key: 'baseUrl', label: 'API address', hint: 'Empty for https://portal.packzy.com/api/v1' },
  ],
  pathao: [
    { key: 'apiKey', label: 'Client id' },
    { key: 'secretKey', label: 'Client secret', secret: true },
    { key: 'username', label: 'Merchant email' },
    { key: 'password', label: 'Merchant password', secret: true },
    { key: 'storeId', label: 'Store id', hint: 'From Pathao merchant panel, Stores' },
    { key: 'baseUrl', label: 'API address', hint: 'Empty for https://api-hermes.pathao.com; sandbox https://courier-api-sandbox.pathao.com' },
  ],
  redx: [
    { key: 'apiKey', label: 'API access token', secret: true },
    { key: 'baseUrl', label: 'API address', hint: 'Empty for https://openapi.redx.com.bd/v1.0.0-beta; sandbox https://sandbox.redx.com.bd/v1.0.0-beta' },
  ],
  manual: [],
  demo: [],
}

export const COURIER_PROVIDERS: CourierProvider[] = ['steadfast', 'pathao', 'redx', 'manual', 'demo']
export const courierLabel = (p: CourierProvider): string => (p === 'manual' ? 'Manual (we book ourselves)' : ADAPTERS[p]?.label || p)
/** Couriers that need keys before they can book. */
export const needsKeys = (p: CourierProvider): boolean => FIELDS[p].some((f) => f.key !== 'baseUrl')
/** Whether the booking form must ask for a delivery area, and which kind. */
export const areaKind = (p: CourierProvider): Adapter['areas'] => ADAPTERS[p]?.areas
export const canTrack = (p: CourierProvider): boolean => !!ADAPTERS[p]?.track
export const hasBalance = (p: CourierProvider): boolean => !!ADAPTERS[p]?.balance && p !== 'demo'

/** Courier status codes in plain words. */
export const PARCEL_STATUS: Record<string, string> = {
  in_review: 'Booked, waiting for pickup', pending: 'Picked up', in_transit: 'In transit', hold: 'On hold', delivered: 'Delivered',
  partial_delivered: 'Partly delivered', delivered_approval_pending: 'Delivered, confirming', partial_delivered_approval_pending: 'Partly delivered, confirming',
  cancelled: 'Cancelled', cancelled_approval_pending: 'Cancelling', unknown: 'Unknown', unknown_approval_pending: 'Unknown', manual: 'Booked by hand',
  'pickup-pending': 'Booked, waiting for pickup', 'ready-for-delivery': 'Ready for delivery', 'delivery-in-progress': 'Out for delivery',
  'agent-hold': 'On hold', 'agent-returning': 'Returning', returned: 'Returned', 'agent-area-change': 'Area changed',
  pickup_requested: 'Booked, waiting for pickup', pickup_failed: 'Pickup failed', picked: 'Picked up', at_the_sorting_hub: 'At sorting hub',
  in_transit_to_delivery_hub: 'In transit', received_at_last_mile_hub: 'At delivery hub', assigned_for_delivery: 'Out for delivery', return: 'Returned', paid_return: 'Returned',
}

/** Test mode swaps every courier for its simulation; the demo courier is always simulated. */
function adapter(p: CourierProvider, test = false): Adapter {
  if (test && p !== 'manual') return simulated(p)
  const a = ADAPTERS[p]
  if (!a) throw new CourierError('This courier has no automatic booking. Record the consignment by hand.')
  return a
}

function wrap(e: unknown): never {
  if (e instanceof CourierError) throw e
  // a browser blocks most courier APIs (no CORS); the server has no such limit
  throw new CourierError('Could not reach the courier. If the app runs in the browser only, couriers usually refuse direct calls: run it with the server so bookings go through it.')
}
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    return wrap(e)
  }
}
function ready(keys: CourierKeys) {
  if (keys.test) return
  const missing = FIELDS[keys.provider].filter((f) => f.key !== 'baseUrl' && !keys[f.key])
  if (missing.length) throw new CourierError(`${courierLabel(keys.provider)} is not set up: add ${missing.map((m) => m.label.toLowerCase()).join(', ')} under Courier, Couriers.`)
}

export const bookParcel = (k: CourierKeys, req: BookRequest, http: Fetch = fetch) => guarded(() => (ready(k), adapter(k.provider, k.test).book(k, req, http)))
export const parcelStatus = (k: CourierKeys, id: string, http: Fetch = fetch) => guarded(() => (ready(k), adapter(k.provider, k.test).status(k, id, http)))
export const trackParcel = (k: CourierKeys, code: string, http: Fetch = fetch) =>
  guarded(async () => {
    ready(k)
    const a = adapter(k.provider, k.test)
    if (!a.track) throw new CourierError(`${a.label} has no tracking lookup.`)
    return a.track(k, code, http)
  })
export const courierAreas = (k: CourierKeys, parentId: string, http: Fetch = fetch) =>
  guarded(async () => {
    ready(k)
    const a = adapter(k.provider, k.test)
    return a.listAreas ? a.listAreas(k, parentId, http) : []
  })
export const courierBalance = (k: CourierKeys, http: Fetch = fetch) =>
  guarded(async () => {
    ready(k)
    const a = adapter(k.provider, k.test)
    if (!a.balance) throw new CourierError(`${a.label} does not report a balance.`)
    return a.balance(k, http)
  })
export const testCourier = (k: CourierKeys, http: Fetch = fetch) =>
  guarded(async () => {
    ready(k)
    const a = adapter(k.provider, k.test)
    return a.test ? a.test(k, http) : 'Saved.'
  })
