import { useState } from 'react'
import { byId, fdate, tk, todayISO } from '@shared/domain'
import { courierLabel } from '@shared/courier'
import { PhoneLink } from '@/components/PhoneLink'
import { ApiError } from '@/core/api/client'
import { accessGuard, useBooks } from '@/core/store/context'
import { ViewInvoiceSheet } from '@/features/sales/sheets/ViewInvoiceSheet'
import { Button, Icon, Pill, Sheet, useSheets, useToast, type SheetComponent } from '@/ui'
import { isDone, parcelStatusText, parcelTone } from './parcelTone'
import { useCourier } from './useCourier'

/** One courier parcel: who it goes to, where it is, and its status history. */
export const ParcelDetailSheet: SheetComponent<{ parcelId: string }> = ({ parcelId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const { refresh } = useCourier()
  const [busy, setBusy] = useState(false)
  const p = byId(db.parcels || [], parcelId)
  if (!p) return null
  const canEdit = !accessGuard.readonly
  // a parcel booked by hand has no courier to ask, so its status is set here
  const setManual = (status: string) => {
    act('setParcelStatus', { id: p.id, status, date: todayISO() })
    toast(`${p.consignmentId}: ${parcelStatusText(status)}`)
  }
  const check = async () => {
    setBusy(true)
    try {
      toast(`${p.consignmentId}: ${parcelStatusText(await refresh(p.id))}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not reach the courier')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={`Parcel ${p.consignmentId}`} crumb={courierLabel(p.provider)} wide
      footer={
        <>
          {p.invoiceId && <Button variant="secondary" icon="receipt" onClick={() => sheets.open(ViewInvoiceSheet, { invoiceId: p.invoiceId })}>Invoice {p.invoiceId}</Button>}
          {p.trackingUrl && <Button variant="secondary" icon="route" onClick={() => window.open(p.trackingUrl, '_blank', 'noopener')}>Track</Button>}
          {p.provider === 'manual' && !isDone(p.status) && canEdit && (
            <>
              <Button variant="secondary" icon="undo" onClick={() => setManual('returned')}>Returned</Button>
              <Button icon="check" onClick={() => setManual('delivered')}>Mark delivered</Button>
            </>
          )}
          {p.provider !== 'manual' && !isDone(p.status) && <Button icon="restore" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check status'}</Button>}
        </>
      }>
      <p className="t-muted tight">Booked {fdate(p.date)} · <Pill tone={parcelTone(p.status)}>{parcelStatusText(p.status)}</Pill>{p.test && <> · <Pill tone="muted">Test parcel</Pill></>}</p>
      <div className="mini-stats">
        <div><span>Recipient</span><b className="small-b">{p.recipientName}</b><span className="phone-stack"><PhoneLink phone={p.phone} label={p.recipientName} /></span></div>
        <div><span>Cash to collect</span><b>{p.cod ? tk(p.cod) : 'None'}</b></div>
        <div><span>Tracking code</span><b className="small-b">{p.trackingCode || '—'}</b></div>
        {(p.charge || p.weight) && <div><span>Delivery charge</span><b>{p.charge ? tk(p.charge) : '—'}</b>{p.weight ? <small className="t-muted">{p.weight} kg</small> : null}</div>}
      </div>
      <p className="trip-load"><Icon name="pin" size={16} /> {p.address}{p.areaName ? ` · ${p.areaName}` : ''}</p>
      {p.note && <p className="trip-load"><Icon name="box" size={16} /> {p.note}</p>}
      <h3 className="sheet-h"><Icon name="route" size={17} />Status history</h3>
      <div className="rows flush">
        {[...p.history].reverse().map((h, i) => (
          <div key={i} className="row"><span className="name normal">{parcelStatusText(h.status)}</span><span className="meta" /><span className="amt">{fdate(h.date)}</span></div>
        ))}
      </div>
      {byId(db.dealers, p.dealerId) && <p className="t-muted">Dealer: {byId(db.dealers, p.dealerId)?.name}</p>}
    </Sheet>
  )
}
ParcelDetailSheet.readOnlySafe = true
