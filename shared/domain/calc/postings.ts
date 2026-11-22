/** Where each person works, transfers between workplaces, and who is posted where. */
import { todayISO } from '../format'
import type { Db, Employee, ISODate, PlaceKind, StaffTransfer, WorkPlace } from '../types'
import { byId, memo } from './common'

export const PLACE_KINDS: Record<PlaceKind, string> = { office: 'Office', warehouse: 'Warehouse', factory: 'Factory floor', region: 'Sales region', branch: 'Branch', other: 'Other' }

/** Live transfer orders for one person, oldest first. */
const ordersOf = (db: Db, employeeId: string) =>
  (db.staffTransfers || []).filter((t) => t.employeeId === employeeId && !t.cancelled).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at < b.at ? -1 : 1))

export interface Posting {
  place: WorkPlace | null
  /** Since when they work there (joining date for a first posting). */
  since: ISODate
  /** The transfer that put them there, if any. */
  order: StaffTransfer | null
  /** A transfer already ordered for a later date. */
  next: StaffTransfer | null
}

/** Where someone works on a day (today by default), and any transfer still to come. */
export const postingOf = (db: Db, e: Employee, day: ISODate = todayISO()): Posting => {
  const orders = ordersOf(db, e.id)
  const done = orders.filter((t) => t.date <= day)
  const order = done[done.length - 1] || null
  const placeId = order ? order.to : e.placeId
  return { place: byId(db.workplaces || [], placeId) || null, since: order ? order.date : e.joined, order, next: orders.find((t) => t.date > day) || null }
}

export interface TransferRow extends StaffTransfer {
  employee: Employee | undefined
  fromPlace: WorkPlace | undefined
  toPlace: WorkPlace | undefined
  /** Ordered for a later date, or already in effect. */
  upcoming: boolean
}

/** Every transfer order, newest first. */
export const transferRows = (db: Db, today: ISODate = todayISO()): TransferRow[] =>
  memo(db, 'transfers:' + today, () => [...(db.staffTransfers || [])]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.at < b.at ? 1 : -1))
    .map((t) => ({ ...t, employee: byId(db.employees, t.employeeId), fromPlace: byId(db.workplaces || [], t.from), toPlace: byId(db.workplaces || [], t.to), upcoming: !t.cancelled && t.date > today })))

export interface PlaceRow {
  place: WorkPlace
  /** People working there today. */
  people: Employee[]
  /** Transfers ordered into and out of it for later dates. */
  comingIn: StaffTransfer[]
  goingOut: StaffTransfer[]
  head: string
}

/** Each workplace with who works there now and who is about to move. */
export const placeRows = (db: Db, today: ISODate = todayISO()): PlaceRow[] =>
  memo(db, 'places:' + today, () => {
    const active = db.employees.filter((e) => e.status !== 'left')
    const now = new Map(active.map((e) => [e.id, postingOf(db, e, today)]))
    return (db.workplaces || []).map((place) => ({
      place,
      people: active.filter((e) => now.get(e.id)?.place?.id === place.id),
      comingIn: active.map((e) => now.get(e.id)?.next).filter((t): t is StaffTransfer => !!t && t.to === place.id),
      goingOut: active.map((e) => now.get(e.id)).filter((p) => p?.place?.id === place.id && p.next).map((p) => p!.next!),
      head: byId(db.employees, place.headId)?.name || place.headName || '',
    }))
  })

/** People with no workplace set yet. */
export const unposted = (db: Db, today: ISODate = todayISO()) => db.employees.filter((e) => e.status !== 'left' && !postingOf(db, e, today).place)
