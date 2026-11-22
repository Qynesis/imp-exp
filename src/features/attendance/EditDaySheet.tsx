import { byId, DAY_STATUS, dayOf, fdate, hoursOf, lateBy, num, postingOf, todayISO, type DayStatus } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Correct one person's day: present, half, absent or leave, check-in and check-out, and the work done. */
export const EditDaySheet: SheetComponent<{ employeeId: string; date: string }> = ({ employeeId, date }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const e = byId(db.employees, employeeId)
  const day = dayOf(db, employeeId, date)
  const me = byId(db.users, session.userId)
  const [v, , bind] = useForm({
    status: (day?.status || '') as DayStatus | '', inAt: day?.inAt || '', outAt: day?.outAt || '', work: day?.work || '', output: day?.output ? String(day.output) : '', note: day?.note || '',
  })
  if (!e) return null
  const place = postingOf(db, e, date).place
  const preview = { inAt: v.inAt, outAt: v.outAt }
  const h = hoursOf(preview)
  const late = lateBy(preview, place)
  return (
    <FormSheet title={`${e.name} · ${fdate(date)}`} crumb="Attendance" submit={v.status ? 'Save day' : 'Clear day'}
      note={[
        day?.source === 'self' ? `Checked in by ${e.name.split(' ')[0]} at ${day.inAt}${day.distance != null ? `, ${day.distance} m from ${place?.name || 'the workplace'}` : ''}` : day ? 'Marked by the office' : 'Not marked yet',
        day?.editedBy ? `last changed by ${day.editedBy}` : '',
        day?.leaveId ? `from leave ${day.leaveId}` : '',
      ].filter(Boolean).join(' · ')}
      onSubmit={() => {
        if (date > todayISO()) return 'A future day cannot be marked.'
        const why = act('editWorkDay', { employeeId, date, status: v.status, inAt: v.inAt, outAt: v.outAt, work: v.work, output: num(v.output) || undefined, note: v.note, by: me?.name || '' })
        if (why) return why
        toast(v.status ? 'Attendance saved' : 'Day cleared')
      }}>
      <Field label="Status">
        <select {...bind('status')}>
          <option value="">Not marked</option>
          {(Object.keys(DAY_STATUS) as DayStatus[]).map((k) => <option key={k} value={k}>{DAY_STATUS[k]}</option>)}
        </select>
      </Field>
      <Field label="Workplace"><input className="in" value={place?.name || 'Not set'} disabled /></Field>
      <Field label="Check in" hint={late ? `${late} min late (starts ${place?.startTime})` : place?.startTime ? `Work starts ${place.startTime}` : undefined}><input type="time" {...bind('inAt')} /></Field>
      <Field label="Check out" hint={h != null ? `${h} hours` : undefined}><input type="time" {...bind('outAt')} /></Field>
      <Field label="Work done" wide><input {...bind('work')} placeholder="e.g. Loaded 2 trucks" /></Field>
      <Field label="Pieces done"><input {...bind('output')} inputMode="numeric" placeholder="0" /></Field>
      <Field label="Note (why it was changed)"><input {...bind('note')} placeholder="e.g. Forgot to check in, came 9am" /></Field>
    </FormSheet>
  )
}
