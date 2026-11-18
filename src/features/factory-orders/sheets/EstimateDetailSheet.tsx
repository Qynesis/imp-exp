import { byId, ESTIMATE_STATUS, fdate, fmt, todayISO, tk } from '@shared/domain'
import { shareOnWhatsApp } from '@/components/share'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Icon, Pill, Sheet, useConfirm, usePrint, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { ESTIMATE_TONE } from '../estimateTone'
import { EstimateDoc } from '../orderDocs'
import { estimateText } from '../orderText'
import { AnswerEstimateSheet } from './AnswerEstimateSheet'
import { NewFactoryOrderSheet } from './NewFactoryOrderSheet'

/** An estimate: what we propose, where it stands with the factory, and the way to an order. */
export const EstimateDetailSheet: SheetComponent<{ estimateId: string }> = ({ estimateId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const print = usePrint()
  const toast = useToast()
  const confirm = useConfirm()
  const { close } = useSheetItem()
  const e = byId(db.estimates || [], estimateId)
  if (!e) return null
  const f = byId(db.factories, e.factoryId)
  const p = byId(db.products, e.productId)
  const canEdit = !accessGuard.readonly
  const send = () => {
    shareOnWhatsApp(estimateText(db, e), f?.phone)
    if (e.status === 'draft' && canEdit) {
      act('setEstimateStatus', { id: e.id, status: 'sent', date: todayISO() })
      toast(`${e.id} marked as sent`)
    }
  }
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${e.id}?`, confirmLabel: 'Delete estimate', destructive: true }))) return
    act('removeEstimate', e.id)
    toast('Estimate deleted')
    close()
  }
  return (
    <Sheet title={`${p?.name || 'Estimate'} · ${f?.name || ''}`} crumb={`Estimate ${e.id}`} wide
      footer={
        <>
          <Button variant="secondary" icon="print" onClick={() => print(<EstimateDoc db={db} e={e} />)}>Print</Button>
          <Button variant="secondary" icon="send" onClick={send}>WhatsApp</Button>
          {canEdit && e.status !== 'ordered' && <Button variant="secondary" icon="edit" onClick={() => sheets.open(NewFactoryOrderSheet, { mode: 'estimate', estimateId: e.id })}>Edit</Button>}
          {canEdit && e.status === 'draft' && <Button variant="secondary" icon="check" onClick={() => { act('setEstimateStatus', { id: e.id, status: 'sent', date: todayISO() }); toast(`${e.id} marked as sent`) }}>Mark sent</Button>}
          {canEdit && (e.status === 'sent' || e.status === 'draft' || e.status === 'rejected') && <Button icon="check" onClick={() => sheets.open(AnswerEstimateSheet, { estimateId: e.id })}>Factory's answer</Button>}
          {canEdit && e.status === 'approved' && <Button icon="factory" onClick={() => sheets.open(NewFactoryOrderSheet, { estimateId: e.id })}>Confirm order</Button>}
          {e.status === 'ordered' && e.orderId && <Button icon="arrowRight" onClick={() => { close(); go('factory-orders/' + e.orderId) }}>Open order {e.orderId}</Button>}
        </>
      }>
      <p className="t-muted tight">{fdate(e.date)} · <Pill tone={ESTIMATE_TONE[e.status]}>{ESTIMATE_STATUS[e.status]}</Pill>{e.type === 1 ? ' · we supply raw materials' : ' · direct order'}</p>
      <div className="mini-stats">
        <div><span>Quantity</span><b>{fmt(e.qty)} {p?.unit}</b></div>
        <div><span>{e.type === 1 ? 'Making charge' : 'Rate'}</span><b>{tk(e.rate)}</b></div>
        <div><span>Estimated total</span><b>{tk(e.qty * e.rate)}</b></div>
        {e.wanted && <div><span>Wanted by</span><b>{fdate(e.wanted)}</b></div>}
      </div>
      <h3 className="sheet-h"><Icon name="route" size={17} />Progress</h3>
      <div className="rows flush">
        <div className="row"><span className="name normal">Prepared</span><span className="meta" /><span className="amt">{fdate(e.date)}</span></div>
        <div className="row"><span className="name normal">Sent to {f?.name || 'factory'}</span><span className="meta">{f?.phone || ''}</span><span className="amt">{e.sentOn ? fdate(e.sentOn) : <span className="t-muted">Not yet</span>}</span></div>
        <div className="row"><span className="name normal">Factory's answer</span><span className="meta">{e.answer || ''}</span><span className="amt">{e.answeredOn ? <Pill tone={e.status === 'rejected' ? 'warn' : 'good'}>{e.status === 'rejected' ? 'Rejected' : 'Approved'} {fdate(e.answeredOn)}</Pill> : <span className="t-muted">Waiting</span>}</span></div>
        <div className="row"><span className="name normal">Order confirmed</span><span className="meta" /><span className="amt">{e.orderId || <span className="t-muted">Not yet</span>}</span></div>
      </div>
      {e.materials.length > 0 && (
        <>
          <h3 className="sheet-h"><Icon name="layers" size={17} />Raw materials we will hand over</h3>
          <div className="rows flush">
            {e.materials.map((m) => <div key={m.productId} className="row"><span className="name normal">{byId(db.products, m.productId)?.name}</span><span className="meta" /><span className="amt">{fmt(m.given)} {byId(db.products, m.productId)?.unit}</span></div>)}
          </div>
        </>
      )}
      {e.note && <p className="t-muted">{e.note}</p>}
      {e.validUntil && <p className="t-muted">Price valid until {fdate(e.validUntil)}.</p>}
      {canEdit && e.status !== 'ordered' && <p className="sheet-aside"><button type="button" className="link t-warn" onClick={() => void remove()}>Delete this estimate</button></p>}
    </Sheet>
  )
}
EstimateDetailSheet.readOnlySafe = true
