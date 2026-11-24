/**
 * Subscriptions: a free trial, then a paid plan. Kept by the server per company (never in the books,
 * so nobody can extend their own access), and paid online through SSLCommerz (bKash, Nagad, cards)
 * or by sending money to the platform owner and pressing "I paid", which the owner then approves.
 */
export type PlanId = 'basic' | 'pro'
/** Plans sold before Basic and Pro. Old payments keep them, so receipts and history still read right. */
export type LegacyPlanId = 'quarterly' | 'half-yearly' | 'yearly'
export interface Plan {
  id: PlanId
  label: string
  /** Taka per month. */
  monthly: number
  /** One line on who it is for. */
  tagline: string
  features: string[]
  badge?: string
  popular?: boolean
}
export const PLANS: Plan[] = [
  {
    id: 'basic', label: 'Basic', monthly: 2900, tagline: 'For a trading or distribution business getting organised',
    features: ['Selling, invoices and dealers', 'Products, stock and warehouses', 'Suppliers, purchases and dues', 'Cashbook and reports', 'Staff logins with roles', 'Data backup and support'],
  },
  {
    id: 'pro', label: 'Pro', monthly: 5900, badge: 'Most popular', popular: true, tagline: 'For importers, exporters and manufacturers',
    features: ['Everything in Basic', 'Imports, exports, LC and customs', 'Factory orders and raw materials', 'Transport, courier and WhatsApp/SMS', 'Accounts, VAT, fixed assets and investors', 'AI assistant and priority support'],
  },
]
/** The largest companies: priced to fit, so they talk to us. */
export const ENTERPRISE = {
  label: 'Enterprise',
  tagline: 'For groups, many branches or special needs',
  features: ['Everything in Pro', 'Customised screens, reports and workflows', 'Several companies and branches', 'Your own server or domain', 'Data migration and staff training', 'A dedicated account manager'],
}
/** How many months can be paid at once. */
export const TERMS = [1, 3, 6, 12] as const
export const planById = (id: string): Plan | undefined => PLANS.find((p) => p.id === id)
export const planPrice = (p: Plan, months: number): number => p.monthly * months
const LEGACY: Record<LegacyPlanId, string> = { quarterly: 'Quarterly', 'half-yearly': 'Half-yearly', yearly: 'Yearly' }
/** A plan's name, including plans no longer sold. */
export const planLabel = (id: string): string => planById(id)?.label || LEGACY[id as LegacyPlanId] || id
export const termLabel = (months: number): string => (months === 1 ? '1 month' : months === 12 ? '12 months (1 year)' : `${months} months`)
export const DEFAULT_TRIAL_DAYS = 14

/** How someone paid. online: through the payment gateway (it tells us bKash, Nagad or card). test: simulated, nothing charged. */
export type PayMethod = 'online' | 'bkash' | 'nagad' | 'rocket' | 'bank' | 'test'
export const PAY_METHODS: Record<PayMethod, string> = { online: 'Online', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank transfer', test: 'Test payment' }
/** started: an online checkout the person has not finished. pending: an "I paid" claim waiting for approval. */
export type PaymentStatus = 'started' | 'pending' | 'paid' | 'rejected' | 'failed' | 'cancelled'

export interface BillingPayment {
  /** Our receipt number, e.g. SUB-4F2A-3. */
  id: string
  /** Gateway transaction id we made (online) or the sender's transaction id (manual). */
  tranId: string
  /** When it was made, ISO date and time. */
  at: string
  plan: PlanId | LegacyPlanId
  months: number
  amount: number
  method: PayMethod
  /** What the gateway said the money came from: "bKash", "VISA"… */
  channel?: string
  /** Manual payments: the number or account it came from, and the date the person says they paid. */
  sender?: string
  paidOn?: string
  note?: string
  status: PaymentStatus
  decidedAt?: string
  /** Why the platform owner rejected it, or why the gateway failed. */
  reason?: string
  /** Who pressed "I paid". */
  by?: string
}

export interface BillingRecord {
  trialEnds: string
  /** Paid access ends; null while still on the trial. */
  paidUntil: string | null
  /** The last plan paid for. 'free' never ends (the demo company, or set by the platform owner). */
  plan: PlanId | LegacyPlanId | 'trial' | 'free'
  payments: BillingPayment[]
  seq: number
}

export type BillingStatus = 'trial' | 'active' | 'expired' | 'free'
export interface BillingSummary {
  status: BillingStatus
  plan: PlanId | LegacyPlanId | 'trial' | 'free'
  /** Access ends; null for free. */
  until: string | null
  /** Whole days left, 0 when ended. */
  daysLeft: number
  /** Payments waiting for the platform owner. */
  pending: number
}

export const STATUS_LABEL: Record<BillingStatus, string> = { trial: 'Trial', active: 'Active', expired: 'Ended', free: 'Free' }

const DAY = 86400000

export const newBilling = (now: number, trialDays = DEFAULT_TRIAL_DAYS): BillingRecord => ({
  trialEnds: new Date(now + trialDays * DAY).toISOString(),
  paidUntil: null,
  plan: 'trial',
  payments: [],
  seq: 0,
})

export function summarize(rec: BillingRecord, now: number): BillingSummary {
  const pending = rec.payments.filter((p) => p.status === 'pending').length
  if (rec.plan === 'free') return { status: 'free', plan: 'free', until: null, daysLeft: 0, pending }
  const until = rec.paidUntil && rec.paidUntil > rec.trialEnds ? rec.paidUntil : rec.trialEnds
  const left = Date.parse(until) - now
  const onTrial = !rec.paidUntil || rec.paidUntil <= rec.trialEnds
  return {
    status: left <= 0 ? 'expired' : onTrial ? 'trial' : 'active',
    plan: rec.plan,
    until,
    daysLeft: left > 0 ? Math.ceil(left / DAY) : 0,
    pending,
  }
}

/** Add a plan's months, counted from when the current access ends (unused trial days are kept). */
export function extendBy(rec: BillingRecord, months: number, now: number): void {
  const cur = summarize(rec, now)
  const from = new Date(cur.until && Date.parse(cur.until) > now ? cur.until : new Date(now).toISOString())
  const end = new Date(from)
  end.setMonth(end.getMonth() + months)
  rec.paidUntil = end.toISOString()
}

/** Mark a payment paid and give the access it bought. Paying twice for the same payment does nothing. */
export function markPaid(rec: BillingRecord, p: BillingPayment, now: number, channel?: string): void {
  if (p.status === 'paid') return
  p.status = 'paid'
  p.decidedAt = new Date(now).toISOString()
  if (channel) p.channel = channel
  rec.plan = p.plan
  extendBy(rec, p.months, now)
}

/* ---------- SSLCommerz (bKash, Nagad, Rocket, cards and net banking in one checkout) ---------- */
export interface GatewayKeys {
  storeId?: string
  storePassword?: string
  sandbox?: boolean
}
type Fetch = typeof fetch
export class GatewayError extends Error {}

const sslBase = (k: GatewayKeys) => (k.sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com')
export const gatewayReady = (k: GatewayKeys | undefined): k is Required<GatewayKeys> => !!k?.storeId && !!k.storePassword

/** Start a checkout. Returns the page to send the person to. */
export async function startCheckout(
  k: GatewayKeys,
  p: { tranId: string; amount: number; plan: string; returnUrl: string; company: string; email: string; phone: string },
  http: Fetch = fetch,
): Promise<string> {
  if (!gatewayReady(k)) throw new GatewayError('Online payment is not set up on this server.')
  const form = new URLSearchParams({
    store_id: k.storeId, store_passwd: k.storePassword, total_amount: p.amount.toFixed(2), currency: 'BDT', tran_id: p.tranId,
    success_url: p.returnUrl, fail_url: p.returnUrl, cancel_url: p.returnUrl, ipn_url: p.returnUrl + '?ipn=1',
    cus_name: p.company || 'Customer', cus_email: p.email || 'customer@example.com', cus_phone: p.phone || '01700000000',
    cus_add1: 'Bangladesh', cus_city: 'Dhaka', cus_country: 'Bangladesh', shipping_method: 'NO', num_of_item: '1',
    product_name: `Subscription: ${p.plan}`, product_category: 'Software', product_profile: 'non-physical-goods',
  })
  let res: Response
  try {
    res = await http(`${sslBase(k)}/gwprocess/v4/api.php`, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) })
  } catch {
    throw new GatewayError('Could not reach the payment gateway. Try again in a minute.')
  }
  const data = (await res.json().catch(() => null)) as { status?: string; GatewayPageURL?: string; failedreason?: string } | null
  if (!data || data.status !== 'SUCCESS' || !data.GatewayPageURL) throw new GatewayError(data?.failedreason || 'The payment gateway refused the checkout.')
  return data.GatewayPageURL
}

/** Ask the gateway whether a payment really went through. Never trust what the browser posts back. */
export async function validatePayment(k: GatewayKeys, valId: string, http: Fetch = fetch): Promise<{ ok: boolean; tranId: string; amount: number; channel: string }> {
  if (!gatewayReady(k)) throw new GatewayError('Online payment is not set up on this server.')
  const q = new URLSearchParams({ val_id: valId, store_id: k.storeId, store_passwd: k.storePassword, format: 'json' })
  let res: Response
  try {
    res = await http(`${sslBase(k)}/validator/api/validationserverAPI.php?${q}`, { signal: AbortSignal.timeout(15000) })
  } catch {
    throw new GatewayError('Could not reach the payment gateway to check the payment.')
  }
  const data = (await res.json().catch(() => null)) as { status?: string; tran_id?: string; amount?: string; currency?: string; card_issuer?: string; card_type?: string } | null
  const ok = !!data && (data.status === 'VALID' || data.status === 'VALIDATED') && (data.currency || 'BDT') === 'BDT'
  return { ok, tranId: data?.tran_id || '', amount: Number(data?.amount) || 0, channel: data?.card_type || data?.card_issuer || '' }
}
