import { useState, type FormEvent } from 'react'
import { fdate, type CourierProvider } from '@shared/domain'
import { canTrack, courierLabel, type TrackResult } from '@shared/courier'
import { ApiError } from '@/core/api/client'
import { useBooks } from '@/core/store/context'
import { Button, Card, Field, Icon, Pill, useSheets } from '@/ui'
import { ParcelDetailSheet } from './ParcelDetailSheet'
import { parcelStatusText, parcelTone } from './parcelTone'
import { enabledCouriers, useCourier } from './useCourier'

/** Look up any parcel by tracking code or consignment number: ours first, then the courier. */
export function TrackPanel() {
  const { db } = useBooks()
  const sheets = useSheets()
  const { track } = useCourier()
  const couriers = enabledCouriers(db).filter(canTrack)
  const [provider, setProvider] = useState<CourierProvider>(couriers[0] || 'demo')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<TrackResult | null>(null)
  const [err, setErr] = useState('')
  const c = code.trim().toLowerCase()
  const ours = c ? (db.parcels || []).find((p) => [p.consignmentId, p.trackingCode, p.invoiceId, p.reference].some((x) => x && x.toLowerCase() === c)) : undefined

  const lookUp = async (e: FormEvent) => {
    e.preventDefault()
    setRes(null)
    setErr('')
    if (!c) return setErr('Enter a tracking code or consignment number.')
    setBusy(true)
    try {
      setRes(await track(ours?.provider && canTrack(ours.provider) ? ours.provider : provider, ours?.consignmentId || code.trim()))
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Could not reach the courier.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon="search" title="Track a parcel" sub="Any parcel, booked here or not: enter its tracking code or consignment number.">
      <form className="card-body pt0 form-grid" onSubmit={(e) => void lookUp(e)}>
        <Field label="Courier">
          <select className="in" value={provider} onChange={(e) => setProvider(e.target.value as CourierProvider)}>
            {couriers.map((p) => <option key={p} value={p}>{courierLabel(p)}</option>)}
          </select>
        </Field>
        <Field label="Tracking code or consignment number"><input className="in" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 12345678 or SF-ABC123" autoComplete="off" /></Field>
        <div className="field wide btn-row tight-row"><Button type="submit" icon="search" disabled={busy}>{busy ? 'Looking…' : 'Track'}</Button></div>
      </form>
      {ours && (
        <div className="card-body pt0">
          <button type="button" className="next-step click-strip" onClick={() => sheets.open(ParcelDetailSheet, { parcelId: ours.id })}>
            <span><Icon name="parcel" size={16} /> Ours: {ours.recipientName} · booked {fdate(ours.date)}{ours.invoiceId ? ` · ${ours.invoiceId}` : ''}</span>
            <Pill tone={parcelTone(ours.status)}>{parcelStatusText(ours.status)}</Pill>
          </button>
        </div>
      )}
      {err && <p className="card-body pt0 err">{err}</p>}
      {res && (
        <div className="card-body pt0">
          <div className="track-result">
            <div><span className="t-muted">Status now</span><Pill tone={parcelTone(res.status)}>{parcelStatusText(res.status)}</Pill></div>
            {res.trackingUrl && <a className="link" href={res.trackingUrl} target="_blank" rel="noopener noreferrer">Open the courier’s tracking page →</a>}
          </div>
          {res.events.length > 0 && (
            <div className="rows flush">
              {res.events.map((ev, i) => <div key={i} className="row"><span className="name normal">{ev.text}</span><span className="meta" /><span className="amt t-muted">{ev.time ? ev.time.replace('T', ' ').slice(0, 16) : ''}</span></div>)}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
