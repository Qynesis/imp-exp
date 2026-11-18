/**
 * Sample courier parcels for trying the Courier screen: every courier, every kind of outcome, some
 * tied to recent invoices and some to walk-in customers. Parcels still on the way carry a booking time
 * of a few minutes ago, so test mode moves them along while you watch.
 */
import { SIM_STEPS, simConsignment } from '../courier'
import { addDays } from './format'
import type { CourierProvider, Db, ISODate, Parcel } from './types'

type Fate = 'delivered' | 'partial' | 'returned' | 'cancelled' | 'moving'
interface Plan {
  provider: CourierProvider
  daysAgo: number
  fate: Fate
  /** For parcels on the way: how far along, as an index into the courier's steps. */
  step?: number
  who?: { name: string; phone: string; address: string; area: string }
  cod: number
  weight: number
}

const WALK_IN = [
  { name: 'Tanvir Ahmed (online order)', phone: '01711-583920', address: 'House 12, Road 7, Mirpur 10', area: 'Mirpur, Dhaka' },
  { name: 'Nasrin Akter', phone: '01822-104455', address: 'Flat 3B, Lake View, Dhanmondi 27', area: 'Dhanmondi, Dhaka' },
  { name: 'Rafiq Hardware', phone: '01913-662018', address: 'Shop 5, Zindabazar Main Road', area: 'Zindabazar, Sylhet' },
  { name: 'Shanta Enterprise', phone: '01556-781230', address: 'Holding 44, KDA Avenue', area: 'Sonadanga, Khulna' },
  { name: 'Karim Store', phone: '01675-220981', address: 'Sector 11, Uttara', area: 'Uttara, Dhaka' },
]

const PLANS: Plan[] = [
  { provider: 'steadfast', daysAgo: 0, fate: 'moving', step: 0, cod: 4250, weight: 2 },
  { provider: 'pathao', daysAgo: 0, fate: 'moving', step: 1, who: WALK_IN[0], cod: 1850, weight: 1 },
  { provider: 'redx', daysAgo: 1, fate: 'moving', step: 1, who: WALK_IN[1], cod: 2600, weight: 1.5 },
  { provider: 'steadfast', daysAgo: 1, fate: 'moving', step: 2, cod: 6800, weight: 4 },
  { provider: 'pathao', daysAgo: 2, fate: 'moving', step: 3, who: WALK_IN[4], cod: 0, weight: 3 },
  { provider: 'steadfast', daysAgo: 3, fate: 'delivered', cod: 5400, weight: 3 },
  { provider: 'redx', daysAgo: 4, fate: 'delivered', who: WALK_IN[2], cod: 3200, weight: 2 },
  { provider: 'pathao', daysAgo: 5, fate: 'returned', who: WALK_IN[3], cod: 2900, weight: 2 },
  { provider: 'steadfast', daysAgo: 6, fate: 'delivered', cod: 0, weight: 5 },
  { provider: 'manual', daysAgo: 7, fate: 'delivered', cod: 1500, weight: 1 },
  { provider: 'redx', daysAgo: 9, fate: 'partial', cod: 7200, weight: 6 },
  { provider: 'steadfast', daysAgo: 11, fate: 'cancelled', who: WALK_IN[0], cod: 990, weight: 1 },
  { provider: 'pathao', daysAgo: 14, fate: 'delivered', cod: 4100, weight: 2.5 },
  { provider: 'steadfast', daysAgo: 18, fate: 'delivered', cod: 8800, weight: 7 },
]

const FINAL: Record<Exclude<Fate, 'moving'>, Partial<Record<CourierProvider, string>>> = {
  delivered: { steadfast: 'delivered', pathao: 'delivered', redx: 'delivered', manual: 'delivered' },
  partial: { steadfast: 'partial_delivered', pathao: 'delivered', redx: 'delivered', manual: 'delivered' },
  returned: { steadfast: 'cancelled', pathao: 'return', redx: 'returned', manual: 'cancelled' },
  cancelled: { steadfast: 'cancelled', pathao: 'return', redx: 'returned', manual: 'cancelled' },
}

/** Parcels without ids; the caller numbers them. `today` keeps the dates in step with the books. */
export function sampleParcels(db: Db, today: ISODate, now = Date.now()): Omit<Parcel, 'id' | 'ts'>[] {
  const invoices = db.invoices.filter((i) => i.status === 'final').slice(-30).reverse()
  let next = 0
  return PLANS.map((plan, k): Omit<Parcel, 'id' | 'ts'> => {
    const date = addDays(today, -plan.daysAgo)
    // dealers' parcels come from their invoices; walk-in customers have none
    const inv = plan.who ? undefined : invoices[next++ % Math.max(invoices.length, 1)]
    const dealer = inv && db.dealers.find((d) => d.id === inv.dealerId)
    const steps = SIM_STEPS[plan.provider] || ['in_review', 'in_transit', 'delivered']
    // a parcel on the way is stamped a few minutes back so test mode keeps moving it; finished ones keep their real day
    const stampedAt = plan.fate === 'moving' ? now - [1, 5, 15, 40][plan.step ?? 0] * 60000 - k * 1000 : now - plan.daysAgo * 86400000 - k * 1000
    const c = simConsignment(plan.provider === 'manual' ? 'demo' : plan.provider, stampedAt)
    const status = plan.provider === 'manual' ? (plan.fate === 'moving' ? 'manual' : 'delivered') : plan.fate === 'moving' ? steps[plan.step ?? 0] : FINAL[plan.fate][plan.provider] || 'delivered'
    const reached = plan.fate === 'moving' ? steps.slice(0, (plan.step ?? 0) + 1) : plan.provider === 'manual' ? ['manual', status] : [...steps.slice(0, -1).slice(0, plan.fate === 'cancelled' ? 1 : undefined), status]
    const history = reached.map((s, i) => ({ date: addDays(date, Math.min(i, plan.daysAgo)), status: s }))
    // books with no sales yet send the dealer-style parcels to walk-in customers too
    const to = plan.who || (dealer ? { name: dealer.owner ? `${dealer.owner} (${dealer.name})` : dealer.name, phone: dealer.phone || '01700-000000', address: dealer.address || dealer.name, area: dealer.area } : WALK_IN[k % WALK_IN.length])
    const url = plan.provider === 'steadfast' ? `https://steadfast.com.bd/t/${c.tracking}` : plan.provider === 'pathao' ? `https://merchant.pathao.com/tracking?consignment_id=${c.id}` : plan.provider === 'redx' ? `https://redx.com.bd/track-parcel/?trackingId=${c.id}` : ''
    return {
      date, invoiceId: inv?.id || '', dealerId: inv?.dealerId || '', provider: plan.provider, consignmentId: plan.provider === 'manual' ? `SA-${700 + k}` : c.id,
      trackingCode: plan.provider === 'manual' ? '' : c.tracking, trackingUrl: url, status, cod: plan.cod, recipientName: to.name, phone: to.phone,
      address: [to.address, to.area].filter(Boolean).join(', '), note: inv ? inv.lines.map((l) => `${l.qty} ${l.unit || ''}`.trim()).join(', ') : 'Sample parcel',
      history, weight: plan.weight, areaName: to.area || undefined, charge: plan.provider === 'redx' ? 70 : plan.provider === 'pathao' ? 110 : plan.provider === 'manual' ? undefined : 60 + Math.max(Math.ceil(plan.weight - 1), 0) * 15,
      reference: inv?.id || `WEB-${1040 + k}`, test: true,
    }
  })
}
