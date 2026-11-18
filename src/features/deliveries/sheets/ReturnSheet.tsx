import { useState } from 'react'
import { byId, fmt, fshort, invoiceDelivery, num, tk, todayISO, type ReturnCondition } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'
import { RETURN_REASONS } from '../returnReasons'

/** Goods coming back from a dealer, against one of their invoices. */
export function ReturnSheet({ invoiceId, dealerId }: { invoiceId?: string; dealerId?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind] = useForm({
    dealerId: dealerId || byId(db.invoices, invoiceId)?.dealerId || db.dealers[0]?.id || '', invoiceId: invoiceId || '',
    condition: 'restock' as ReturnCondition, reason: RETURN_REASONS[0], note: '', date: todayISO(), credit: '', creditTouched: '',
  })
  const [qty, setQty] = useState<Record<string, string>>({})
  const invoices = db.invoices.filter((i) => i.status === 'final' && i.dealerId === v.dealerId).slice(-30).reverse()
  const inv = byId(db.invoices, v.invoiceId)
  const lines = inv ? invoiceDelivery(db, inv).lines.filter((l) => l.returnable > 0) : []
  const value = lines.reduce((s, l) => s + Math.min(num(qty[l.productId]), l.returnable) * l.price, 0)
  // credit follows the goods' value until someone types their own figure
  const credit = v.creditTouched ? num(v.credit) : value
  return (
    <FormSheet title="Record a return" crumb="Delivery" submit="Save return" wide
      note="Goods in good condition go back into stock. The credit comes off what the dealer owes; set it to 0 if you replace the goods instead."
      onSubmit={() => {
        if (!inv) return 'Pick the invoice the goods came from.'
        for (const l of lines) if (num(qty[l.productId]) > l.returnable) return `Only ${fmt(l.returnable)} ${l.unit} of ${l.name} can come back on this invoice.`
        const back = lines.filter((l) => num(qty[l.productId]) > 0).map((l) => ({ productId: l.productId, qty: num(qty[l.productId]), price: l.price }))
        if (!back.length) return 'Enter how much came back.'
        if (!v.reason) return 'Say why the goods came back.'
        act('recordReturn', { date: v.date || todayISO(), invoiceId: inv.id, dealerId: inv.dealerId, lines: back, condition: v.condition, credit: Math.max(credit, 0), reason: v.reason, note: v.note.trim() })
        toast(`Return saved${credit > 0 ? ` · ${tk(credit)} credited` : ''}`)
      }}>
      <Field label="Dealer">
        <select className="in" value={v.dealerId} onChange={(e) => { set('dealerId', e.target.value); set('invoiceId', ''); setQty({}) }}>
          {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice">
        <select className="in" value={v.invoiceId} onChange={(e) => { set('invoiceId', e.target.value); setQty({}) }}>
          <option value="">Pick the invoice</option>
          {invoices.map((i) => <option key={i.id} value={i.id}>{i.id} · {fshort(i.date)}</option>)}
        </select>
      </Field>
      {inv && (
        <div className="field wide">
          <span className="field-label">What came back</span>
          {lines.length ? (
            <div className="deliver-lines">
              {lines.map((l) => (
                <div key={l.productId} className="deliver-line">
                  <span className="two-line"><b>{l.name}</b><small className="t-muted">Delivered {fmt(l.delivered)} · returned before {fmt(l.returned)} · up to <b>{fmt(l.returnable)}</b> {l.unit} at {tk(l.price)}</small></span>
                  <input className="in" inputMode="decimal" value={qty[l.productId] ?? ''} placeholder="0" aria-label={`${l.name} returned`} onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value })} />
                </div>
              ))}
            </div>
          ) : <small>Nothing from this invoice has been delivered yet, so nothing can come back.</small>}
        </div>
      )}
      <div className="field">
        <span className="field-label">Condition</span>
        <Segmented<ReturnCondition> label="Condition" value={v.condition} onChange={(c) => set('condition', c)} options={[{ value: 'restock', label: 'Good, back to stock' }, { value: 'damaged', label: 'Damaged, not sellable' }]} />
      </div>
      <Field label="Reason"><select {...bind('reason')}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Credit to the dealer (Tk)" hint={`Goods value ${tk(value)}`}>
        <input className="in" inputMode="decimal" value={v.creditTouched ? v.credit : value ? String(Math.round(value)) : ''} placeholder="0"
          onChange={(e) => { set('credit', e.target.value); set('creditTouched', '1') }} />
      </Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="e.g. 3 cartons crushed at the bottom of the stack" /></Field>
    </FormSheet>
  )
}
