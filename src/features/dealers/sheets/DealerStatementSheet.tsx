import { byId, dealerLedger, fdate, fshort, tk } from '@shared/domain'
import { CustomView } from '@/components/CustomFields'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { ViewInvoiceSheet } from '@/features/sales/sheets/ViewInvoiceSheet'
import { Button, Sheet, useSheetItem, useSheets, type SheetComponent } from '@/ui'
import { SendMessageSheet } from '@/features/messages/SendMessageSheet'
import { CollectSheet } from './CollectSheet'
import { DealerSheet } from './DealerSheet'

/** What a dealer owes, invoice by invoice, and their recent payments. Safe for view-only roles. */
export const DealerStatementSheet: SheetComponent<{ dealerId: string }> = ({ dealerId }) => {
  const { db } = useBooks()
  const sheets = useSheets()
  const { close } = useSheetItem()
  if (!byId(db.dealers, dealerId)) return null
  const led = dealerLedger(db, dealerId)
  const d = led.dealer
  const sales = byId(db.employees, d.salesId)
  return (
    <Sheet title={d.name} crumb="Dealer statement" wide
      footer={
        <>
          <Button icon="edit" variant="secondary" onClick={() => sheets.open(DealerSheet, { dealerId })}>Edit</Button>
          <Button icon="send" variant="secondary" disabled={!d.phone} onClick={() => sheets.open(SendMessageSheet, { contactKey: 'd:' + dealerId })}>Message</Button>
          <Button icon="plus" variant="secondary" onClick={() => { close(); go('sell/new/' + dealerId) }}>New sale</Button>
          <Button icon="wallet" disabled={led.due <= 0} onClick={() => sheets.open(CollectSheet, { dealerId })}>Collect</Button>
        </>
      }>
      <p className="t-muted tight">
        {[d.owner, d.phone, d.area].filter(Boolean).join(' · ') || 'No contact details yet'}
        <br />
        {d.terms === 'credit' ? `Credit · ${d.days} days · limit ${tk(d.limit)}` : 'Cash on delivery only'} · {sales ? `Sales: ${sales.name}` : 'Office sale'}
      </p>
      <div className="mini-stats">
        <div><span>Due now</span><b className={led.due > 0 ? 't-warn' : ''}>{tk(led.due)}</b></div>
        <div><span>Status</span><b className={led.overdue ? 't-warn' : ''}>{led.statusText}</b></div>
        {d.terms === 'credit' && <div><span>Credit left</span><b>{tk(Math.max(d.limit - led.due, 0))}</b></div>}
      </div>
      <div className="boxed-view"><CustomView entity="dealer" record={d} /></div>
      <h3 className="sheet-h">Unpaid invoices</h3>
      <div className="rows flush">
        {led.open.map((x) => (
          <button key={x.id} type="button" className="row click" disabled={x.id === 'opening'} onClick={() => sheets.open(ViewInvoiceSheet, { invoiceId: x.id })}>
            <span className="name">{x.label}</span>
            <span className="meta">{x.date ? fdate(x.date) : 'Before these books'}</span>
            <span className="amt">{tk(x.out)}</span>
          </button>
        ))}
        {!led.open.length && <div className="row"><span className="meta">Nothing unpaid.</span></div>}
      </div>
      <h3 className="sheet-h">Recent payments</h3>
      <div className="rows flush">
        {led.payments.slice(0, 6).map((p, i) => (
          <div key={i} className="row">
            <span className="name normal">{p.label}</span>
            <span className="meta">{fshort(p.date)}</span>
            <span className="amt t-good">{tk(p.amount)}</span>
          </div>
        ))}
        {!led.payments.length && <div className="row"><span className="meta">No payments yet.</span></div>}
      </div>
    </Sheet>
  )
}
DealerStatementSheet.readOnlySafe = true
