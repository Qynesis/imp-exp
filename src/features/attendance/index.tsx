import { useMemo, useState } from 'react'
import { addMonths, attendanceMonth, DAY_STATUS, fdate, fmonth, fmt, hoursOf, lateBy, postingOf, thisMonth, todayISO, type AttendanceRow, type DayStatus, type WorkDay } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Icon, Pill, SearchBox, Segmented, Stat, usePaged, useSheets } from '@/ui'
import { exportTable } from '@/ui/tableExport'
import { EditDaySheet } from './EditDaySheet'

type Tab = 'day' | 'month'
type Show = 'all' | 'in' | 'notin' | 'late' | 'away'
const TONE: Record<DayStatus, 'good' | 'info' | 'warn' | 'neutral'> = { present: 'good', half: 'info', absent: 'warn', leave: 'neutral' }
const LETTER: Record<DayStatus, string> = { present: 'P', half: 'H', absent: 'A', leave: 'L' }

/** #/attendance[/day|month]: who is in today and when they came, and the month for everyone. */
export default function AttendancePage({ params: [t] }: FeatureRouteProps) {
  const tab: Tab = t === 'month' ? 'month' : 'day'
  return (
    <>
      <PageHead title="Attendance" sub="Check-ins from staff phones, the office register and approved leave — in one place. Tap any day to correct it." />
      <Segmented<Tab> label="Attendance view" value={tab} onChange={(x) => go('attendance/' + x)} options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }]} />
      {tab === 'day' ? <DayView /> : <MonthView />}
    </>
  )
}

function DayView() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [date, setDate] = useState(todayISO())
  const [show, setShow] = useState<Show>('all')
  const [q, setQ] = useState('')
  const canEdit = !accessGuard.readonly
  const rows = useMemo(() => db.employees.filter((e) => e.status !== 'left' && e.joined <= date).map((e) => {
    const day = (db.attendance || []).find((a) => a.employeeId === e.id && a.date === date) || null
    const place = postingOf(db, e, date).place
    const away = !!(day?.distance != null && place?.lat != null && day.distance > (place.radius || 200))
    return { e, day, place, late: day ? lateBy(day, place) : 0, hours: day ? hoursOf(day) : null, away }
  }), [db, date])
  const n = q.trim().toLowerCase()
  const shown = rows.filter((r) => (show === 'all' || (show === 'in' && r.day && r.day.status !== 'absent' && r.day.status !== 'leave') || (show === 'notin' && !r.day) || (show === 'late' && r.late > 0) || (show === 'away' && r.away))
    && (!n || `${r.e.name} ${r.e.role} ${r.place?.name || ''}`.toLowerCase().includes(n)))
  const present = rows.filter((r) => r.day && (r.day.status === 'present' || r.day.status === 'half')).length
  const self = rows.filter((r) => r.day?.source === 'self').length
  return (
    <>
      <div className="stats">
        <Stat icon="check" label="At work" value={`${present} / ${rows.length}`} sub={`${self} checked in from their phone`} />
        <Stat icon="clock" label="Not marked yet" value={fmt(rows.filter((r) => !r.day).length)} tone={rows.some((r) => !r.day) && date === todayISO() ? 'warn' : undefined} />
        <Stat icon="alert" label="Late" value={fmt(rows.filter((r) => r.late > 0).length)} tone={rows.some((r) => r.late > 0) ? 'warn' : undefined} sub="After start time + grace" />
        <Stat icon="pin" label="Away from site" value={fmt(rows.filter((r) => r.away).length)} sub="Checked in elsewhere" />
      </div>
      <Card icon="calendar" title={date === todayISO() ? 'Today' : fdate(date)} sub="Tap a person to correct their day."
        action={<div className="tools-right">
          <Button size="sm" variant="secondary" icon="back" aria-label="Day before" onClick={() => setDate(new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10))}>Before</Button>
          <input className="in date-pick" type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" />
          <Button size="sm" variant="secondary" disabled={date >= todayISO()} onClick={() => setDate(new Date(Date.parse(date) + 864e5).toISOString().slice(0, 10))}>Next</Button>
        </div>}>
        <div className="card-body pt0 filter-bar">
          <Segmented<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'Everyone' }, { value: 'in', label: 'At work' }, { value: 'notin', label: 'Not marked' }, { value: 'late', label: 'Late' }, { value: 'away', label: 'Away' }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Name, job or workplace" label="Search people" />
        </div>
        <DataTable rows={shown} rowKey={(r) => r.e.id} exportName={`attendance-${date}`} onRow={canEdit ? (r) => sheets.open(EditDaySheet, { employeeId: r.e.id, date }) : undefined} empty="Nobody matches."
          columns={[
            { label: 'Person', primary: true, render: (r) => <span className="two-line"><b>{r.e.name}</b><small className="t-muted">{[r.e.role, r.place?.name].filter(Boolean).join(' · ')}</small></span> },
            { label: 'Status', render: (r) => (r.day ? <Pill tone={TONE[r.day.status]}>{DAY_STATUS[r.day.status]}</Pill> : <span className="t-muted">Not marked</span>), exportValue: (r) => (r.day ? DAY_STATUS[r.day.status] : 'Not marked') },
            { label: 'In', render: (r) => (r.day?.inAt ? <span className={r.late ? 't-warn strong' : undefined}>{r.day.inAt}{r.late ? ` · ${r.late}m late` : ''}</span> : '—'), exportValue: (r) => r.day?.inAt || '' },
            { label: 'Out', render: (r) => r.day?.outAt || '—', exportValue: (r) => r.day?.outAt || '' },
            { label: 'Hours', align: 'right', render: (r) => (r.hours != null ? fmt(r.hours) : '—'), exportValue: (r) => r.hours ?? '' },
            { label: 'Where', render: (r) => whereText(r.day, r.place?.lat != null, r.place?.radius), exportValue: (r) => whereText(r.day, r.place?.lat != null, r.place?.radius) },
            { label: 'Work done', render: (r) => <span className="t-muted">{r.day?.work || ''}</span>, exportValue: (r) => r.day?.work || '' },
            { label: 'By', render: (r) => <span className="t-muted">{r.day?.source === 'self' ? 'Self' : r.day?.leaveId ? 'Leave' : r.day ? r.day.editedBy || 'Office' : ''}</span> },
          ]} />
      </Card>
    </>
  )
}

const whereText = (d: WorkDay | null, placeKnown: boolean, radius?: number) => {
  if (!d || d.source !== 'self') return d ? 'Office register' : ''
  if (d.distance == null) return placeKnown ? 'Location not shared' : 'Phone'
  return d.distance <= (radius || 200) ? 'At the workplace' : `${d.distance < 1000 ? `${d.distance} m` : `${(d.distance / 1000).toFixed(1)} km`} away`
}

function MonthView() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [month, setMonth] = useState(thisMonth())
  const [q, setQ] = useState('')
  const today = todayISO()
  const canEdit = !accessGuard.readonly
  const { days, rows } = attendanceMonth(db, month, today)
  const n = q.trim().toLowerCase()
  const shown = rows.filter((r) => !n || `${r.e.name} ${r.e.role}`.toLowerCase().includes(n))
  const { rows: page, pager } = usePaged(shown, 25, (kind) => exportTable(kind, `attendance-${month}`,
    ['Name', 'Job', ...days.map((d) => d.slice(8)), 'Present', 'Absent', 'Leave', 'Late', 'Hours'],
    shown.map((r) => [r.e.name, r.e.role, ...r.cells.map((c) => (c.day ? LETTER[c.day.status] + (c.day.inAt ? ` ${c.day.inAt}` : '') : c.off ? 'Off' : '')), r.present, r.absent, r.leave, r.late, r.hours])))
  return (
    <Card icon="calendar" title={fmonth(month)} sub="P present · H half day · A absent · L leave · a dot means late. Tap a day to correct it."
      action={<div className="tools-right">
        <Button size="sm" variant="secondary" icon="back" onClick={() => setMonth(addMonths(month, -1))}>{fmonth(addMonths(month, -1)).slice(0, 3)}</Button>
        <input className="in date-pick" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
        <Button size="sm" variant="secondary" disabled={month >= thisMonth()} onClick={() => setMonth(addMonths(month, 1))}>{fmonth(addMonths(month, 1)).slice(0, 3)}</Button>
      </div>}>
      <div className="card-body pt0 filter-bar"><SearchBox value={q} onChange={setQ} placeholder="Name or job" label="Search people" /></div>
      <div className="att-wrap">
        <table className="att-grid">
          <thead>
            <tr>
              <th className="att-name">Person</th>
              {days.map((d) => <th key={d} className={cls(new Date(d + 'T00:00:00Z').getUTCDay() === 5 && 'off', d === today && 'today')}>{Number(d.slice(8))}</th>)}
              <th>P</th><th>A</th><th>L</th><th>Late</th>
            </tr>
          </thead>
          <tbody>
            {page.map((r: AttendanceRow) => (
              <tr key={r.e.id}>
                <th className="att-name"><b>{r.e.name}</b><small className="t-muted">{r.e.role}</small></th>
                {r.cells.map((c) => {
                  const future = c.date > today || c.date < r.e.joined
                  return (
                    <td key={c.date} className={cls(c.off && 'off', c.date === today && 'today')}>
                      {!future && (
                        <button type="button" disabled={!canEdit} className={cls('att-cell', c.day && `d-${c.day.status}`, c.late > 0 && 'late')}
                          title={`${r.e.name} · ${fdate(c.date)} · ${c.day ? DAY_STATUS[c.day.status] : c.off ? 'Weekly off' : 'Not marked'}${c.day?.inAt ? ` · in ${c.day.inAt}` : ''}${c.day?.outAt ? ` · out ${c.day.outAt}` : ''}${c.late ? ` · ${c.late} min late` : ''}`}
                          onClick={() => sheets.open(EditDaySheet, { employeeId: r.e.id, date: c.date })}>
                          {c.day ? LETTER[c.day.status] : ''}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="att-sum">{fmt(r.present)}</td>
                <td className={cls('att-sum', r.absent > 0 && 't-warn')}>{r.absent}</td>
                <td className="att-sum">{r.leave}</td>
                <td className={cls('att-sum', r.late > 0 && 't-warn')}>{r.late}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="t-muted card-body">Nobody matches.</p>}
      {pager}
      <p className="t-muted tight card-body pt0"><Icon name="clock" size={13} /> Unmarked working days this month: {rows.reduce((s, r) => s + r.unmarked, 0)}. Fridays are shaded as the weekly holiday.</p>
    </Card>
  )
}
