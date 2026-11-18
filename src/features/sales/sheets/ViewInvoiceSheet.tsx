import { byId, fmt, invoiceDelivery, TRIP_STATUS, trips } from '@shared/domain'
import { accessGuard, useBooks } from '@/core/store/context'
import { BookCourierSheet } from '@/features/courier/BookCourierSheet'
import { ParcelDetailSheet } from '@/features/courier/ParcelDetailSheet'
import { DeliverSheet } from '@/features/deliveries/sheets/DeliverSheet'
import { ReturnSheet } from '@/features/deliveries/sheets/ReturnSheet'
import { useMessaging, vars } from '@/features/messages/useMessaging'
import { TripDetailSheet } from '@/features/transport/sheets/TripDetailSheet'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Icon, Pill, Sheet, usePrint, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { InvoiceDoc } from '../InvoiceDoc'

/** A bill: print or send it, see what has been delivered or returned, and deliver the rest. */
export const ViewInvoiceSheet: SheetComponent<{ invoiceId: string }> = ({ invoiceId }) => {
  const { db } = useBooks()
  const print = usePrint()
  const toast = useToast()
  const msg = useMessaging()
  const { close } = useSheetItem()
  const sheets = useSheets()
  const inv = byId(db.invoices, invoiceId)
  if (!inv) return null
  const canEdit = !accessGuard.readonly
  const final = inv.status === 'final'
  const trip = trips(db).find((t) => t.invoiceId === inv.id && t.status !== 'cancelled')
  const parcel = (db.parcels || []).find((p) => p.invoiceId === inv.id && !p.status.startsWith('cancel'))
  const dl = final ? invoiceDelivery(db, inv) : null
  const send = async (channel: 'whatsapp' | 'sms') => toast((await msg.send('invoice', channel, inv.dealerId, msg.render('invoice', vars.invoice(db, inv)), inv.id)).text)
  return (
    <Sheet title={inv.id} crumb="Invoice" wide
      footer={
        <>
          <Button variant="secondary" onClick={close}>Close</Button>
          {final && msg.channels.includes('whatsapp') && <Button variant="secondary" icon="send" onClick={() => void send('whatsapp')}>WhatsApp</Button>}
          {final && msg.channels.includes('sms') && <Button variant="secondary" icon="send" onClick={() => void send('sms')}>SMS</Button>}
          {final && dl && dl.remainingUnits > 0 && (parcel
            ? <Button variant="secondary" icon="parcel" onClick={() => sheets.open(ParcelDetailSheet, { parcelId: parcel.id })}>Parcel {parcel.consignmentId}</Button>
            : <Button variant="secondary" icon="parcel" onClick={() => sheets.open(BookCourierSheet, { invoiceId: inv.id })}>Book courier</Button>)}
          {final && dl && dl.remainingUnits > 0 && (trip
            ? <Button variant="secondary" icon="truck" onClick={() => sheets.open(TripDetailSheet, { tripId: trip.id })}>{trip.id} · {TRIP_STATUS[trip.status]}</Button>
            : <Button variant="secondary" icon="truck" onClick={() => sheets.open(TripSheet, { purpose: 'delivery', dealerId: inv.dealerId, invoiceId: inv.id })}>Arrange trip</Button>)}
          <Button variant="secondary" icon="print" onClick={() => print(<InvoiceDoc db={db} inv={inv} />)}>Print</Button>
          {final && dl && dl.remainingUnits > 0 && canEdit && <Button icon="check" onClick={() => sheets.open(DeliverSheet, { invoiceId: inv.id })}>Deliver</Button>}
        </>
      }>
      {dl && (
        <div className="delivery-box">
          <div className="delivery-head">
            <b><Icon name="truck" size={16} /> Delivery</b>
            <Pill tone={dl.status === 'delivered' ? 'good' : dl.status === 'partial' ? 'info' : 'warn'}>{dl.status === 'delivered' ? 'Delivered in full' : dl.status === 'partial' ? 'Part delivered' : 'Waiting for delivery'}</Pill>
            {canEdit && dl.lines.some((l) => l.returnable > 0) && <button type="button" className="link" onClick={() => sheets.open(ReturnSheet, { invoiceId: inv.id })}>Record a return</button>}
          </div>
          <div className="rows flush">
            {dl.lines.map((l) => (
              <div key={l.productId} className="row">
                <span className="name normal">{l.name}</span>
                <span className="meta">{fmt(l.delivered)} of {fmt(l.ordered)} delivered{l.returned ? ` · ${fmt(l.returned)} returned` : ''}</span>
                <span className={l.remaining ? 'amt t-warn' : 'amt t-good'}>{l.remaining ? `${fmt(l.remaining)} ${l.unit} to go` : 'Done'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="invoice-wrap"><InvoiceDoc db={db} inv={inv} /></div>
    </Sheet>
  )
}
ViewInvoiceSheet.readOnlySafe = true
