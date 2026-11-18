import { byId, fdate, todayISO, tk, type QuoteStatus } from '@shared/domain'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { useMessaging, vars } from '@/features/messages/useMessaging'
import { Button, Pill, Sheet, useConfirm, usePrint, useSheetItem, useToast, type SheetComponent } from '@/ui'
import { InvoiceDoc } from '../InvoiceDoc'
import { QUOTE_TONE, QUOTE_TEXT } from '../quoteStatus'

/** A dealer estimate: send it, record the answer, and turn it into the bill once approved. */
export const QuoteSheet: SheetComponent<{ quoteId: string }> = ({ quoteId }) => {
  const { db, act } = useBooks()
  const print = usePrint()
  const toast = useToast()
  const confirm = useConfirm()
  const msg = useMessaging()
  const { close } = useSheetItem()
  const q = byId(db.quotes || [], quoteId)
  if (!q) return null
  const canEdit = !accessGuard.readonly
  const dealer = byId(db.dealers, q.dealerId)
  const doc = { ...q, id: q.id, status: 'draft' as const, received: 0 }
  const setStatus = (status: Exclude<QuoteStatus, 'draft' | 'invoiced'>) => {
    act('setQuoteStatus', { id: q.id, status, date: todayISO() })
    toast(`${q.id}: ${QUOTE_TEXT[status].toLowerCase()}`)
  }
  const send = async (channel: 'whatsapp' | 'sms') => {
    const r = await msg.send('estimate', channel, q.dealerId, msg.render('estimate', vars.quote(db, q)), q.id)
    toast(r.text)
    if (r.ok && q.status === 'draft') setStatus('sent')
  }
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${q.id}?`, confirmLabel: 'Delete estimate', destructive: true }))) return
    act('removeQuote', q.id)
    close()
  }
  return (
    <Sheet title={`${q.id} · ${dealer?.name || ''}`} crumb="Estimate" wide
      footer={
        <>
          <Button variant="secondary" icon="print" onClick={() => print(<InvoiceDoc db={db} inv={doc} estimate={{ validUntil: q.validUntil, note: q.note }} />)}>Print</Button>
          {msg.channels.includes('whatsapp') && <Button variant="secondary" icon="send" onClick={() => void send('whatsapp')}>WhatsApp</Button>}
          {msg.channels.includes('sms') && <Button variant="secondary" icon="send" onClick={() => void send('sms')}>SMS</Button>}
          {canEdit && q.status !== 'invoiced' && q.status !== 'approved' && <Button variant="secondary" icon="check" onClick={() => setStatus('approved')}>Approved</Button>}
          {canEdit && (q.status === 'sent' || q.status === 'draft') && <Button variant="secondary" icon="close" onClick={() => setStatus('rejected')}>Rejected</Button>}
          {canEdit && q.status !== 'invoiced' && <Button icon="receipt" onClick={() => { close(); go('sell/quote/' + q.id) }}>{q.status === 'approved' ? 'Make the bill' : 'Edit or bill'}</Button>}
          {q.status === 'invoiced' && q.invoiceId && <Button variant="secondary" icon="receipt" onClick={() => { close(); go('sell') }}>Billed as {q.invoiceId}</Button>}
        </>
      }>
      <p className="t-muted tight">{fdate(q.date)} · <Pill tone={QUOTE_TONE[q.status]}>{QUOTE_TEXT[q.status]}</Pill>{q.sentOn ? ` · sent ${fdate(q.sentOn)}` : ''}{q.answeredOn ? ` · answered ${fdate(q.answeredOn)}` : ''}{q.validUntil ? ` · valid until ${fdate(q.validUntil)}` : ''}</p>
      <div className="invoice-wrap"><InvoiceDoc db={db} inv={doc} estimate={{ validUntil: q.validUntil, note: q.note }} /></div>
      <p className="t-muted">Estimated total {tk(q.lines.reduce((s, l) => s + l.qty * l.price, 0) - q.discount)}. Nothing leaves stock and nothing is owed until the bill is made.</p>
      {canEdit && q.status !== 'invoiced' && <p className="sheet-aside"><button type="button" className="link t-warn" onClick={() => void remove()}>Delete this estimate</button></p>}
    </Sheet>
  )
}
QuoteSheet.readOnlySafe = true
