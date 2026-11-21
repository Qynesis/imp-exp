import { useState } from 'react'
import { byId, fmt, invoiceDelivery, num, todayISO, type DeliveryVia } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { ScanBox } from '@/components/barcode/ScanBox'
import { useMessaging, vars } from '@/features/messages/useMessaging'
import { Button, Field, FormSheet, useForm, useToast } from '@/ui'

const VIA: Record<DeliveryVia, string> = { own: 'Our vehicle', courier: 'Courier', hired: 'Hired transport', pickup: 'Dealer collected it' }

/** Hand over all or part of an invoice. Stock leaves the warehouse now, line by line. */
export function DeliverSheet({ invoiceId, tripId, receivedBy = '' }: { invoiceId: string; tripId?: string; receivedBy?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const msg = useMessaging()
  const inv = byId(db.invoices, invoiceId)
  const d = inv ? invoiceDelivery(db, inv) : null
  const stockOf = (id: string) => byId(db.products, id)?.stock ?? 0
  // each line starts at what can go now: what is left on the bill, but no more than the warehouse holds
  const canGo = (l: { productId: string; remaining: number }) => Math.max(Math.min(l.remaining, stockOf(l.productId)), 0)
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries((d?.lines || []).map((l) => [l.productId, String(canGo(l))])))
  const [v, , bind] = useForm({ date: todayISO(), via: 'own' as DeliveryVia, receivedBy, note: '', notify: (msg.settings.auto.delivery || []).length > 0 ? 'yes' : 'no' })
  // the first scan starts the count from zero, so the scans say exactly what was loaded
  const [scanning, setScanning] = useState(false)
  if (!inv || !d) return null
  const dealer = byId(db.dealers, inv.dealerId)
  const going = d.lines.map((l) => ({ ...l, now: Math.min(num(qty[l.productId]), l.remaining) }))
  const total = going.reduce((s, l) => s + l.now, 0)
  return (
    <FormSheet title={`Deliver ${inv.id}`} crumb={dealer?.name || 'Delivery'} submit={total ? `Deliver ${fmt(total)} units` : 'Deliver'} wide
      note="Change the quantities to deliver part of the bill now; the rest stays pending here. Stock leaves the warehouse with this delivery."
      onSubmit={() => {
        for (const l of d.lines) {
          const n = num(qty[l.productId])
          if (n < 0) return 'Quantities cannot be below zero.'
          if (n > l.remaining) return `Only ${fmt(l.remaining)} ${l.unit} of ${l.name} is left to deliver.`
          const p = byId(db.products, l.productId)
          if (p && n > p.stock) return `Only ${fmt(p.stock)} ${l.unit} of ${l.name} in the warehouse.`
        }
        if (!total) return 'Enter what is going now.'
        const lines = going.filter((l) => l.now > 0).map((l) => ({ productId: l.productId, qty: l.now }))
        const refused = act('recordDelivery', { invoiceId: inv.id, date: v.date || todayISO(), lines, via: v.via, tripId, receivedBy: v.receivedBy.trim(), note: v.note.trim() })
        if (refused) return refused
        toast(total < d.remainingUnits ? `Part delivered: ${fmt(total)} of ${fmt(d.remainingUnits)} units` : `${inv.id} delivered in full`)
        if (v.notify === 'yes') void msg.auto('delivery', inv.dealerId, vars.delivery(db, inv, lines, v.receivedBy.trim()), inv.id)
      }}>
      <div className="field wide">
        <span className="field-label">What goes now</span>
        <div className="btn-row tight-row">
          <Button size="sm" variant="secondary" onClick={() => setQty(Object.fromEntries(d.lines.map((l) => [l.productId, String(canGo(l))])))}>Deliver all that can go</Button>
          <Button size="sm" variant="secondary" onClick={() => setQty(Object.fromEntries(d.lines.map((l) => [l.productId, '0'])))}>Clear</Button>
        </div>
        <ScanBox hint="Scan each pack or carton as it is loaded" onScan={(hit) => {
          const line = d.lines.find((l) => l.productId === hit.product.id)
          if (!line) return `${hit.product.name} is not on this bill`
          const base = scanning ? qty : Object.fromEntries(d.lines.map((l) => [l.productId, '0']))
          const next = num(base[line.productId]) + hit.qty
          if (next > line.remaining) return `Only ${fmt(line.remaining)} ${line.unit} of ${line.name} is left on the bill`
          setScanning(true)
          setQty({ ...base, [line.productId]: String(next) })
        }} />
        <div className="deliver-lines">
          {d.lines.map((l) => {
            const short = l.remaining > stockOf(l.productId)
            return (
              <div key={l.productId} className={'deliver-line' + (l.remaining ? '' : ' done')}>
                <span className="two-line">
                  <b>{l.name}</b>
                  <small className="t-muted">Billed {fmt(l.ordered)} · delivered {fmt(l.delivered)}{l.cancelled ? ` · closed ${fmt(l.cancelled)}` : ''} · <b>{fmt(l.remaining)} left</b> {l.unit}</small>
                  {l.remaining > 0 && <small className={short ? 't-warn' : 't-muted'}>{fmt(stockOf(l.productId))} {l.unit} in the warehouse{short ? ' · not enough for all of it' : ''}</small>}
                </span>
                {l.remaining ? (
                  <input className="in" inputMode="decimal" value={qty[l.productId] ?? ''} aria-label={`${l.name} to deliver`} onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value })} />
                ) : <span className="t-good deliver-done">Done</span>}
              </div>
            )
          })}
        </div>
        {total > 0 && total < d.remainingUnits && <small>Part delivery: {fmt(total)} of {fmt(d.remainingUnits)} units go now; {fmt(d.remainingUnits - total)} stay pending on this bill.</small>}
      </div>
      <Field label="Delivered on"><input type="date" {...bind('date')} /></Field>
      <Field label="How it went"><select {...bind('via')}>{Object.entries(VIA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Received by"><input {...bind('receivedBy')} placeholder={dealer?.owner || 'Name'} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="e.g. challan 214, 2 cartons short" /></Field>
      {msg.channels.length > 0 && (
        <Field label="Tell the dealer">
          <select {...bind('notify')}><option value="yes">Send a delivery message</option><option value="no">No message</option></select>
        </Field>
      )}
    </FormSheet>
  )
}
