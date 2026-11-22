/** Check-in and check-out, lateness and hours, and the month at a glance for everyone. */
import type { Db, Employee, ISODate, MonthKey, WorkDay, WorkPlace } from '../types'
import { memo } from './common'
import { datesBetween, DAY_WEIGHT } from './payroll'
import { postingOf } from './postings'

/** Metres between two points on the earth. */
export const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371000
  const r = (x: number) => (x * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

const mins = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
/** Hours between check-in and check-out, to a quarter hour; null while not both known. */
export const hoursOf = (d: Pick<WorkDay, 'inAt' | 'outAt' | 'hours'>): number | null => {
  const a = mins(d.inAt)
  const b = mins(d.outAt)
  if (a == null || b == null) return d.hours ?? null
  return Math.round(((b >= a ? b - a : b + 1440 - a) / 60) * 4) / 4
}
/** Minutes late against the workplace's start time and grace; 0 when on time or not known. */
export const lateBy = (d: Pick<WorkDay, 'inAt'>, place: WorkPlace | null | undefined): number => {
  const a = mins(d.inAt)
  const start = mins(place?.startTime)
  if (a == null || start == null) return 0
  return Math.max(0, a - start - (place?.graceMin ?? 10))
}
/** Is a point at the workplace? null when the place has no location set. */
export const atSite = (place: WorkPlace | null | undefined, lat?: number, lng?: number): { ok: boolean; distance: number } | null => {
  if (!place || place.lat == null || place.lng == null || lat == null || lng == null) return null
  const distance = distanceM({ lat, lng }, { lat: place.lat, lng: place.lng })
  return { ok: distance <= (place.radius || 200), distance }
}

export const dayOf = (db: Db, employeeId: string, date: ISODate): WorkDay | undefined =>
  (db.attendance || []).find((a) => a.employeeId === employeeId && a.date === date)

export interface AttendanceCell { date: ISODate; day: WorkDay | null; late: number; hours: number | null; off: boolean }
export interface AttendanceRow {
  e: Employee
  cells: AttendanceCell[]
  present: number
  absent: number
  leave: number
  late: number
  hours: number
  unmarked: number
}

/** Everyone working in the month, one cell per day; Fridays are the weekly holiday. */
export const attendanceMonth = (db: Db, month: MonthKey, today: ISODate): { days: ISODate[]; rows: AttendanceRow[] } =>
  memo(db, `attMonth:${month}:${today}`, () => {
    const days = datesBetween(month + '-01', month + '-31').filter((d) => d.slice(0, 7) === month)
    const people = db.employees.filter((e) => e.joined.slice(0, 7) <= month && (e.status !== 'left' || (e.leftOn || '') >= month + '-01'))
    const byKey = new Map((db.attendance || []).filter((a) => a.date.slice(0, 7) === month).map((a) => [a.employeeId + a.date, a]))
    const rows = people.map((e) => {
      const cells = days.map((date) => {
        const day = byKey.get(e.id + date) || null
        const place = postingOf(db, e, date).place
        return { date, day, late: day ? lateBy(day, place) : 0, hours: day ? hoursOf(day) : null, off: new Date(date + 'T00:00:00Z').getUTCDay() === 5 }
      })
      const worked = cells.filter((c) => c.day)
      return {
        e, cells,
        present: worked.reduce((s, c) => s + DAY_WEIGHT[c.day!.status], 0),
        absent: worked.filter((c) => c.day!.status === 'absent').length,
        leave: worked.filter((c) => c.day!.status === 'leave').length,
        late: cells.filter((c) => c.late > 0).length,
        hours: worked.reduce((s, c) => s + (c.hours || 0), 0),
        unmarked: cells.filter((c) => !c.day && !c.off && c.date <= today && c.date >= e.joined).length,
      }
    })
    return { days, rows }
  })
