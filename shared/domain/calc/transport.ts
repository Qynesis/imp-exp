/**
 * Transport: own and rented vehicles, trips, what each costs, what we still owe hired transporters,
 * and which vehicle papers need renewing. Costs live in `db.expenses` under the Transport head,
 * so the cashbook and profit and loss already count them.
 */
import { TRANSPORT_HEAD } from '../catalog'
import { addDays, addMonths, daysBetween, fmonth, monShort, todayISO } from '../format'
import type { Db, Expense, ISODate, MonthKey, PaperKey, TransportCostKind, Trip, Vehicle } from '../types'
import { byId, memo, sum } from './common'
import { totalsBetween } from './sales'

export const vehicles = (db: Db): Vehicle[] => db.vehicles || []
export const activeVehicles = (db: Db): Vehicle[] => vehicles(db).filter((v) => !v.archived)
export const trips = (db: Db): Trip[] => db.trips || []

/** Every Transport expense, linked or not. */
export const transportExpenses = (db: Db): Expense[] => memo(db, 'transportExpenses', () => db.expenses.filter((e) => e.head === TRANSPORT_HEAD))

/** "Truck 1 · Chatta Metro-Ta 11-2345", or the hired vehicle. */
export function tripVehicleLabel(db: Db, t: Trip): string {
  const v = byId(vehicles(db), t.vehicleId)
  if (v) return [v.name, v.regNo].filter(Boolean).join(' · ')
  if (t.hire) return [t.hire.vehicleNo || 'Hired vehicle', t.hire.transporter].filter(Boolean).join(' · ')
  return 'No vehicle yet'
}

/** Whether the money for a cost went to an outside party: hire charges and monthly rent. */
const isHired = (db: Db, e: Expense) =>
  e.transport?.kind === 'Hire charge' || e.transport?.kind === 'Vehicle rent' || byId(vehicles(db), e.transport?.vehicleId)?.ownership === 'rented' || (!!e.transport?.tripId && !byId(vehicles(db), byId(trips(db), e.transport.tripId)?.vehicleId))

/**
 * Hire money paid per trip. Payments made against a trip go to it; payments made to the
 * transporter in general settle that transporter's oldest trips first.
 */
const hirePaidByTrip = (db: Db): Map<string, number> =>
  memo(db, 'hirePaid', () => {
    const paid = new Map<string, number>()
    const pool = new Map<string, number>()
    for (const e of transportExpenses(db)) {
      if (e.transport?.kind !== 'Hire charge') continue
      if (e.transport.tripId) paid.set(e.transport.tripId, (paid.get(e.transport.tripId) || 0) + e.amount)
      else if (e.transport.transporter) pool.set(e.transport.transporter, (pool.get(e.transport.transporter) || 0) + e.amount)
    }
    const hired = trips(db).filter((t) => t.hire && t.status !== 'cancelled').sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1))
    for (const t of hired) {
      const name = t.hire!.transporter
      const left = pool.get(name) || 0
      const need = Math.max(t.hire!.fare - (paid.get(t.id) || 0), 0)
      const take = Math.min(need, left)
      if (take > 0) {
        paid.set(t.id, (paid.get(t.id) || 0) + take)
        pool.set(name, left - take)
      }
    }
    return paid
  })

export interface TripCalc {
  costs: Expense[]
  cost: number
  hirePaid: number
  hireDue: number
  km: number | null
}

export const tripCalc = (db: Db, t: Trip): TripCalc =>
  memo(db, 'trip:' + t.id, () => {
    const costs = transportExpenses(db).filter((e) => e.transport?.tripId === t.id)
    const hirePaid = t.hire ? hirePaidByTrip(db).get(t.id) || 0 : 0
    // agreed hire counts in full, whether paid yet or not; other costs as spent
    const cost = sum(costs.filter((e) => e.transport?.kind !== 'Hire charge'), (e) => e.amount) + (t.hire ? Math.max(t.hire.fare, hirePaid) : 0)
    return { costs, cost, hirePaid, hireDue: t.hire && t.status !== 'cancelled' ? Math.max(t.hire.fare - hirePaid, 0) : 0, km: t.kmStart != null && t.kmEnd != null && t.kmEnd > t.kmStart ? t.kmEnd - t.kmStart : null }
  })

/* ---------- hired transporters ---------- */

export interface TransporterRow {
  name: string
  trips: number
  fare: number
  paid: number
  due: number
  /** Trips with money still owed, oldest first. */
  open: { trip: Trip; due: number }[]
  lastDate: ISODate | ''
}

/** Everyone we hire trucks from per trip, with what is still owed. */
export const transporters = (db: Db): TransporterRow[] =>
  memo(db, 'transporters', () => {
    const m = new Map<string, TransporterRow>()
    const row = (name: string) => {
      let r = m.get(name)
      if (!r) m.set(name, (r = { name, trips: 0, fare: 0, paid: 0, due: 0, open: [], lastDate: '' }))
      return r
    }
    for (const t of trips(db)) {
      if (!t.hire || t.status === 'cancelled') continue
      const r = row(t.hire.transporter || 'Unnamed transporter')
      const c = tripCalc(db, t)
      r.trips++
      r.fare += t.hire.fare
      if (c.hireDue > 0) r.open.push({ trip: t, due: c.hireDue })
      if (t.date > r.lastDate) r.lastDate = t.date
    }
    // payments not tied to one trip still count against the transporter
    for (const e of transportExpenses(db)) if (e.transport?.kind === 'Hire charge' && e.transport.transporter) row(e.transport.transporter).paid += e.amount
    for (const r of m.values()) {
      r.open.sort((a, b) => (a.trip.date < b.trip.date ? -1 : 1))
      r.due = Math.max(r.fare - r.paid, 0)
    }
    return [...m.values()].sort((a, b) => b.due - a.due || (a.lastDate < b.lastDate ? 1 : -1))
  })

/* ---------- vehicles ---------- */

export interface VehicleStats {
  cost: number
  byKind: { kind: TransportCostKind; amount: number }[]
  trips: number
  km: number
  perKm: number | null
  lastOdometer: number | null
}

export function vehicleStats(db: Db, vehicleId: string, from: ISODate, to: ISODate): VehicleStats {
  return memo(db, `vehicle:${vehicleId}:${from}:${to}`, () => {
    const exp = transportExpenses(db).filter((e) => e.transport?.vehicleId === vehicleId && e.date >= from && e.date <= to)
    const kinds = new Map<TransportCostKind, number>()
    for (const e of exp) kinds.set(e.transport!.kind, (kinds.get(e.transport!.kind) || 0) + e.amount)
    const ts = trips(db).filter((t) => t.vehicleId === vehicleId && t.status !== 'cancelled' && t.date >= from && t.date <= to)
    const km = sum(ts, (t) => tripCalc(db, t).km || 0)
    const cost = sum(exp, (e) => e.amount)
    const odo = transportExpenses(db).filter((e) => e.transport?.vehicleId === vehicleId && e.transport.odometer).map((e) => e.transport!.odometer as number)
    const tripOdo = trips(db).filter((t) => t.vehicleId === vehicleId && t.kmEnd).map((t) => t.kmEnd as number)
    const all = [...odo, ...tripOdo]
    return {
      cost, trips: ts.length, km, perKm: km > 0 ? cost / km : null, lastOdometer: all.length ? Math.max(...all) : null,
      byKind: [...kinds.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount),
    }
  })
}

export type PaperState = 'expired' | 'soon' | 'ok' | 'missing'
export const PAPER_WARN_DAYS = 30

export function paperState(date: ISODate | undefined): { state: PaperState; days: number | null } {
  if (!date) return { state: 'missing', days: null }
  const days = daysBetween(todayISO(), date)
  return { state: days < 0 ? 'expired' : days <= PAPER_WARN_DAYS ? 'soon' : 'ok', days }
}

export interface PaperAlert {
  vehicle: Vehicle
  paper: PaperKey
  date: ISODate
  state: 'expired' | 'soon'
  days: number
}

/** Papers of active vehicles that have run out or run out within a month, most urgent first. */
export const paperAlerts = (db: Db): PaperAlert[] =>
  memo(db, 'paperAlerts', () =>
    activeVehicles(db)
      .flatMap((v) =>
        (Object.entries(v.papers) as [PaperKey, ISODate | undefined][]).flatMap(([paper, date]) => {
          const s = paperState(date)
          return date && (s.state === 'expired' || s.state === 'soon') ? [{ vehicle: v, paper, date, state: s.state, days: s.days as number }] : []
        }),
      )
      .sort((a, b) => a.days - b.days),
  )

/* ---------- money over time ---------- */

export interface TransportTotals {
  total: number
  own: number
  hired: number
  trips: number
  byKind: { kind: string; amount: number }[]
  /** Transport cost as a share of sales in the same days. */
  ofSales: number | null
}

export function transportBetween(db: Db, from: ISODate, to: ISODate): TransportTotals {
  return memo(db, `transport:${from}:${to}`, () => {
    const exp = transportExpenses(db).filter((e) => e.date >= from && e.date <= to)
    const hired = sum(exp.filter((e) => isHired(db, e)), (e) => e.amount)
    // hire charges agreed but not yet paid are still a cost of the period
    const unpaidHire = sum(trips(db).filter((t) => t.hire && t.status !== 'cancelled' && t.date >= from && t.date <= to), (t) => tripCalc(db, t).hireDue)
    const total = sum(exp, (e) => e.amount) + unpaidHire
    const kinds = new Map<string, number>()
    for (const e of exp) kinds.set(e.transport?.kind || 'Other transport', (kinds.get(e.transport?.kind || 'Other transport') || 0) + e.amount)
    if (unpaidHire) kinds.set('Hire charge', (kinds.get('Hire charge') || 0) + unpaidHire)
    const sales = totalsBetween(db, from, to).sales
    return {
      total, own: total - hired - unpaidHire, hired: hired + unpaidHire,
      trips: trips(db).filter((t) => t.status !== 'cancelled' && t.date >= from && t.date <= to).length,
      byKind: [...kinds.entries()].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => b.amount - a.amount),
      ofSales: sales > 0 ? total / sales : null,
    }
  })
}

export const monthRange = (m: MonthKey): [ISODate, ISODate] => [`${m}-01`, addDays(`${addMonths(m, 1)}-01`, -1)]

/** The last twelve months of transport cost, for the chart. */
export const transportMonths = (db: Db, end: MonthKey = todayISO().slice(0, 7)) =>
  Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(end, i - 11)
    const [from, to] = monthRange(m)
    return { key: m, short: monShort(m), long: fmonth(m), ...transportBetween(db, from, to) }
  })

/* ---------- servicing ---------- */

export interface ServiceDue {
  vehicle: Vehicle
  lastDate: ISODate | ''
  lastKm: number | null
  dueDate: ISODate | ''
  dueKm: number | null
  /** Days to the due date (negative when late); null without a day schedule. */
  daysLeft: number | null
  /** Km to the due reading (negative when over); null without a km schedule or odometer. */
  kmLeft: number | null
  state: 'late' | 'soon' | 'ok'
}

/** When each vehicle with a service schedule is next due, from its last Servicing cost. */
export function serviceDue(db: Db, v: Vehicle): ServiceDue | null {
  if (!v.serviceKm && !v.serviceDays) return null
  return memo(db, 'service:' + v.id, () => {
    const services = transportExpenses(db).filter((e) => e.transport?.vehicleId === v.id && e.transport.kind === 'Servicing').sort((a, b) => (a.date < b.date ? -1 : 1))
    const last = services[services.length - 1]
    const lastDate = last?.date || ''
    const lastKm = last?.transport?.odometer ?? null
    const now = vehicleStats(db, v.id, '0000-01-01', '9999-12-31').lastOdometer
    const dueDate = v.serviceDays && lastDate ? addDays(lastDate, v.serviceDays) : ''
    const dueKm = v.serviceKm && lastKm != null ? lastKm + v.serviceKm : null
    const daysLeft = dueDate ? daysBetween(todayISO(), dueDate) : null
    const kmLeft = dueKm != null && now != null ? dueKm - now : null
    const late = (daysLeft != null && daysLeft < 0) || (kmLeft != null && kmLeft < 0) || !lastDate
    const soon = (daysLeft != null && daysLeft <= 7) || (kmLeft != null && kmLeft <= 500)
    return { vehicle: v, lastDate, lastKm, dueDate, dueKm, daysLeft, kmLeft, state: late ? 'late' : soon ? 'soon' : 'ok' }
  })
}

/** Vehicles whose service is late or due within a week or 500 km. */
export const servicesDue = (db: Db): ServiceDue[] =>
  memo(db, 'servicesDue', () => activeVehicles(db).map((v) => serviceDue(db, v)).filter((s): s is ServiceDue => !!s && s.state !== 'ok'))

/** The trip a vehicle is on today, if any: planned for today or still on the way. */
export const busyWith = (db: Db, vehicleId: string): Trip | undefined =>
  trips(db).find((t) => t.vehicleId === vehicleId && (t.status === 'on-the-way' || (t.status === 'planned' && t.date === todayISO())))

/** Driver's name and phone for a vehicle, or for the hired vehicle on a trip. */
export function driverOf(db: Db, t: { vehicleId: string; hire?: Trip['hire'] }): { name: string; phone: string; vehiclePhone: string } {
  if (t.hire) return { name: t.hire.driver, phone: t.hire.phone, vehiclePhone: '' }
  const v = byId(vehicles(db), t.vehicleId)
  return { name: byId(db.employees, v?.driverId)?.name || v?.driverName || '', phone: v?.driverPhone || byId(db.employees, v?.driverId)?.phone || '', vehiclePhone: v?.phone || '' }
}
