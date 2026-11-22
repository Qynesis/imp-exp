import { useState } from 'react'
import { byId, foCalc, num, supplierLedger, tk, todayISO , type Attachment } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { AttachField } from '@/components/attachments/Attachments'
import { Field, FormSheet, useForm, useToast } from '@/ui'

interface Props {
  kind?: 'supplier' | 'factory'
  supplierId?: string
  purchaseId?: string
  orderId?: string
  crumb?: string
}

/** One payment form for suppliers and factories. Opened from suppliers, factory orders, cashbook and dashboard. */
export function PaySheet({ kind = 'supplier', supplierId, purchaseId, orderId, crumb }: Props) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({
    kind: kind as 'supplier' | 'factory',
    supplierId: supplierId || db.suppliers[0]?.id || '',
    purchaseId: purchaseId || '',
    orderId: orderId || db.factoryOrders[0]?.id || '',
    amount: '', method: 'Cash', date: todayISO(), note: '',
  })
  const led = v.kind === 'supplier' && byId(db.suppliers, v.supplierId) ? supplierLedger(db, v.supplierId) : null
  const order = v.kind === 'factory' ? byId(db.factoryOrders, v.orderId) : undefined
  const oc = order && foCalc(db, order)
  const note = led
    ? led.due > 0 ? `We owe ${led.supplier.name} ${tk(led.due)}.` : `${led.supplier.name} is settled. Nothing is due.`
    : oc && order ? `${oc.factory?.name} · ${order.id}: ${oc.balanceText}. Paying more than is billed is kept as an advance.` : null

  const [files, setFiles] = useState<Attachment[]>([])
  return (
    <FormSheet title={v.kind === 'supplier' ? 'Pay supplier' : 'Pay factory'} crumb={crumb || 'Make payment'} submit="Save payment" note={note}
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount paid.'
        if (v.kind === 'supplier') {
          if (!led) return 'Choose a supplier.'
          if (amount > led.due) return `That is more than the ${tk(led.due)} we owe this supplier.`
          act('paySupplier', { supplierId: v.supplierId, purchaseId: v.purchaseId, amount, method: v.method, date: v.date, note: v.note.trim() , attachments: files.length ? files : undefined })
        } else {
          if (!order) return 'Choose a factory order.'
          act('payFactory', { orderId: v.orderId, amount, method: v.method, date: v.date, note: v.note.trim() || `Payment for ${order.id}` , attachments: files.length ? files : undefined })
        }
        toast(`${tk(amount)} payment saved`)
      }}>
      <Field label="Pay to">
        <select {...bind('kind')}>
          <option value="supplier">Supplier</option>
          <option value="factory">Factory</option>
        </select>
      </Field>
      {v.kind === 'supplier' ? (
        <>
          <Field label="Supplier">
            <select {...bind('supplierId')}>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Against bill">
            <select {...bind('purchaseId')}>
              <option value="">Oldest bill first</option>
              {led?.bills.filter((b) => b.amount - b.paid > 0 && b.id !== 'opening').map((b) => <option key={b.id} value={b.id}>{b.billNo} · due {tk(b.amount - b.paid)}</option>)}
            </select>
          </Field>
        </>
      ) : (
        <Field label="Against order">
          <select {...bind('orderId')}>
            {db.factoryOrders.map((o) => <option key={o.id} value={o.id}>{o.id} · {byId(db.factories, o.factoryId)?.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note" wide={v.kind === 'factory'}><input {...bind('note')} placeholder="Optional" /></Field>
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}
