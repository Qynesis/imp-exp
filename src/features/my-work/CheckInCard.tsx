import { useState } from 'react'
import { atSite, attendanceMonth, DAY_STATUS, dayOf, fmt, hoursOf, lateBy, postingOf, thisMonth, todayISO, type Employee } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Card, Icon, Pill, useToast } from '@/ui'

/** Ask the phone where it is; gives up quietly after a few seconds or when the person says no. */
const whereAmI = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 })
})
const distText = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

/** Today's check-in and check-out for the signed-in person, and their month so far. */
export function CheckInCard({ e }: { e: Employee }) {
  const { db, attend } = useBooks()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [work, setWork] = useState('')
  const [output, setOutput] = useState('')
  const today = todayISO()
  const day = dayOf(db, e.id, today)
  const place = postingOf(db, e).place
  const late = day ? lateBy(day, place) : 0
  const month = attendanceMonth(db, thisMonth(), today).rows.find((r) => r.e.id === e.id)
  const last7 = month?.cells.filter((c) => c.date <= today).slice(-7) || []
  const onLeave = day?.status === 'leave'

  const checkIn = async () => {
    setBusy(true)
    try {
      const pos = place?.lat != null ? await whereAmI() : null
      await attend({ op: 'in', lat: pos?.lat, lng: pos?.lng })
      const s = pos ? atSite(place, pos.lat, pos.lng) : null
      toast(s ? (s.ok ? 'Checked in at your workplace' : `Checked in · ${distText(s.distance)} from your workplace`) : 'Checked in')
    } catch (x) {
      toast((x as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const checkOut = async () => {
    setBusy(true)
    try {
      await attend({ op: 'out', work, output: Number(output) || undefined })
      toast('Checked out. Have a good evening!')
      setWork('')
      setOutput('')
    } catch (x) {
      toast((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="checkin-card">
      <div className="checkin">
        <div className="checkin-now">
          <span className={'checkin-dot' + (day?.inAt && !day.outAt ? ' live' : '')} aria-hidden="true" />
          <div>
            <b>{onLeave ? 'On leave today' : !day?.inAt ? (day ? `Marked ${DAY_STATUS[day.status].toLowerCase()} by the office` : 'Not checked in yet') : day.outAt ? `Done for today · ${hoursOf(day) ?? '—'} h` : `At work since ${day.inAt}`}</b>
            <span className="t-muted">
              {day?.inAt ? `In ${day.inAt}${day.outAt ? ` · out ${day.outAt}` : ''}` : place?.startTime ? `Work starts at ${place.startTime}` : 'Tap check in when you arrive'}
              {late > 0 && <> · <span className="t-warn">{late} min late</span></>}
              {day?.distance != null && place?.lat != null && <> · {day.distance <= (place.radius || 200) ? 'at the workplace' : `${distText(day.distance)} away`}</>}
            </span>
          </div>
        </div>
        {!onLeave && !day?.inAt && <Button icon="check" disabled={busy} onClick={() => void checkIn()}>{busy ? 'Checking in…' : 'Check in'}</Button>}
        {day?.inAt && !day.outAt && (
          <div className="checkout-form">
            <input className="in" value={work} onChange={(x) => setWork(x.target.value)} placeholder="What did you do today?" aria-label="Work done today" />
            <input className="in" inputMode="numeric" value={output} onChange={(x) => setOutput(x.target.value)} placeholder="Pieces" aria-label="Pieces done" />
            <Button icon="logout" variant="secondary" disabled={busy} onClick={() => void checkOut()}>{busy ? 'Saving…' : 'Check out'}</Button>
          </div>
        )}
      </div>
      {month && (
        <div className="checkin-month">
          <span><b>{fmt(month.present)}</b> days present</span>
          <span><b className={month.late ? 't-warn' : undefined}>{month.late}</b> late</span>
          <span><b>{month.absent}</b> absent</span>
          <span><b>{fmt(month.hours)}</b> hours</span>
          <span className="checkin-week" aria-label="Last 7 days">
            {last7.map((c) => <i key={c.date} title={`${c.date} · ${c.day ? DAY_STATUS[c.day.status] : c.off ? 'Weekly off' : 'Not marked'}${c.day?.inAt ? ` · in ${c.day.inAt}` : ''}`} className={c.day ? `d-${c.day.status}` : c.off ? 'off' : ''} />)}
          </span>
        </div>
      )}
      {place?.lat != null && !day?.inAt && !onLeave && <p className="t-muted tight checkin-hint"><Icon name="pin" size={13} /> Your phone may ask to share its location, so the office can see you checked in at {place.name}.</p>}
      {day?.source === 'office' && day.editedBy && <p className="t-muted tight checkin-hint"><Pill tone="neutral">Corrected by {day.editedBy}</Pill></p>}
    </Card>
  )
}
