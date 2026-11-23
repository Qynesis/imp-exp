/**
 * Employees' written reports: who may read and review them, and the lists each person sees.
 * The office (anyone with "Employee reports" access) sees all; a line manager sees their team's;
 * everyone sees their own.
 */
import { addDays, todayISO } from '../format'
import { levelFor } from '../permissions'
import type { Db, ISODate, ReportKind, ReportStatus, WorkReport } from '../types'
import { byId } from './common'

export const REPORT_KINDS: Record<ReportKind, string> = { daily: 'Daily report', weekly: 'Weekly report', monthly: 'Monthly report', incident: 'Incident report', other: 'Other report' }
export const REPORT_STATUS: Record<ReportStatus, string> = { submitted: 'Waiting for review', reviewed: 'Seen by manager', approved: 'Approved', changes: 'Changes asked', withdrawn: 'Withdrawn' }
export const REPORT_TONE: Record<ReportStatus, 'warn' | 'info' | 'good' | 'neutral' | 'muted'> = { submitted: 'warn', reviewed: 'info', approved: 'good', changes: 'neutral', withdrawn: 'muted' }

/** The period a new report of this kind usually covers, ending today. */
export const reportPeriod = (kind: ReportKind, today: ISODate = todayISO()): { from: ISODate; to: ISODate } => {
  if (kind === 'weekly') return { from: addDays(today, -6), to: today }
  if (kind === 'monthly') return { from: today.slice(0, 8) + '01', to: today }
  return { from: today, to: today }
}

const employeeOf = (db: Db, userId: string) => db.users.find((u) => u.id === userId)?.employeeId || ''

/** People who report to this employee (directly). */
export const teamOf = (db: Db, managerEmployeeId: string) => (managerEmployeeId ? db.employees.filter((e) => e.managerId === managerEmployeeId && e.status !== 'left') : [])

export interface ReportAccess { read: boolean; review: boolean; own: boolean; manager: boolean }
/** What this user may do with this report. */
export function reportAccess(db: Db, userId: string, r: Pick<WorkReport, 'employeeId'>): ReportAccess {
  const me = employeeOf(db, userId)
  const own = !!me && me === r.employeeId
  const manager = !!me && byId(db.employees, r.employeeId)?.managerId === me
  const level = levelFor(db, userId, 'staff-reports')
  return { own, manager, read: own || manager || level !== 'none', review: !own && (manager || level === 'edit') }
}

/** Reports this user may read, newest first; waiting ones first when they can review. */
export function reportsFor(db: Db, userId: string, opts: { scope?: 'mine' | 'team' | 'all' } = {}): WorkReport[] {
  const list = (db.workReports || []).filter((r) => {
    const a = reportAccess(db, userId, r)
    if (!a.read) return false
    if (opts.scope === 'mine') return a.own
    if (opts.scope === 'team') return a.manager
    return true
  })
  return list.sort((a, b) => (a.status === 'submitted') !== (b.status === 'submitted') ? (a.status === 'submitted' ? -1 : 1) : a.submittedAt < b.submittedAt ? 1 : -1)
}
