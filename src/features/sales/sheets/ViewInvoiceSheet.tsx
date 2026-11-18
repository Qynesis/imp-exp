import { byId, TRIP_STATUS, trips } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { BookCourierSheet } from '@/features/courier/BookCourierSheet'
import { ParcelDetailSheet } from '@/features/courier/ParcelDetailSheet'
import { TripDetailSheet } from '@/features/transport/sheets/TripDetailSheet'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Sheet, usePrint, useSheetItem, useSheets, type SheetComponent } from '@/ui'
import { InvoiceDoc } from '../InvoiceDoc'

export const ViewInvoiceSheet: SheetComponent<{ invoiceId: string }> = ({ invoiceId }) => {
  const { db } = useBooks()
  const print = usePrint()
  const { close } = useSheetItem()
  const sheets = useSheets()
  const inv = byId(db.invoices, invoiceId)
  if (!inv) return null
  const trip = trips(db).find((t) => t.invoiceId === inv.id && t.status !== 'cancelled')
  const parcel = (db.parcels || []).find((p) => p.invoiceId === inv.id && !p.status.startsWith('cancel'))
  return (
    <Sheet title={inv.id} crumb="Invoice" wide
      footer={
        <>
          <Button variant="secondary" onClick={close}>Close</Button>
          {inv.status === 'final' && (parcel
            ? <Button variant="secondary" icon="box" onClick={() => sheets.open(ParcelDetailSheet, { parcelId: parcel.id })}>Parcel {parcel.consignmentId}</Button>
            : <Button variant="secondary" icon="box" onClick={() => sheets.open(BookCourierSheet, { invoiceId: inv.id })}>Book courier</Button>)}
          {inv.status === 'final' && (trip
            ? <Button variant="secondary" icon="truck" onClick={() => sheets.open(TripDetailSheet, { tripId: trip.id })}>{trip.id} · {TRIP_STATUS[trip.status]}</Button>
            : <Button variant="secondary" icon="truck" onClick={() => sheets.open(TripSheet, { purpose: 'delivery', dealerId: inv.dealerId, invoiceId: inv.id })}>Arrange delivery</Button>)}
          <Button icon="print" onClick={() => print(<InvoiceDoc db={db} inv={inv} />)}>Print invoice</Button>
        </>
      }>
      <div className="invoice-wrap"><InvoiceDoc db={db} inv={inv} /></div>
    </Sheet>
  )
}
ViewInvoiceSheet.readOnlySafe = true
