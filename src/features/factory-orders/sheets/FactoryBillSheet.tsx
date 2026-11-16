import { byId, fmt, foCalc, num, tk, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function FactoryBillSheet({ orderId }: { orderId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const o = byId(db.factoryOrders, orderId)
  const first = o?.receipts.find((r) => !o.bills.some((b) => b.receiptId === r.id))
  const [v, set, bind, nbind] = useForm({ billNo: '', date: todayISO(), receiptId: first?.id || '', amount: first && o ? String(first.qty * o.rate) : '' })
  if (!o) return null
  const c = foCalc(db, o)
  return (
    <FormSheet title={`Record factory bill · ${o.id}`} crumb="Factory order" submit="Save bill"
      note={c.balance > 0 ? `Balance now: factory owes us ${tk(c.balance)}. This bill will be taken off that advance first.` : c.balance < 0 ? `Balance now: we owe ${tk(-c.balance)}. This bill adds to it.` : 'Nothing is owed either way right now.'}
      onSubmit={() => {
        if (num(v.amount) <= 0) return 'Enter the bill amount.'
        act('factoryBill', { orderId, billNo: v.billNo.trim() || 'Bill', date: v.date, receiptId: v.receiptId, amount: num(v.amount) })
        toast('Factory bill recorded')
      }}>
      <Field label="Bill number"><input {...bind('billNo')} placeholder="e.g. INV-F-215" /></Field>
      <Field label="Bill date"><input type="date" {...bind('date')} /></Field>
      <Field label="Against shipment">
        <select className="in" value={v.receiptId} onChange={(e) => {
          const r = o.receipts.find((x) => x.id === e.target.value)
          set('receiptId', e.target.value)
          if (r) set('amount', String(r.qty * o.rate))
        }}>
          <option value="">Not tied to a shipment</option>
          {o.receipts.map((r) => <option key={r.id} value={r.id}>{r.challan || 'Shipment'} · {fmt(r.qty)} {c.unit}</option>)}
        </select>
      </Field>
      <Field label="Bill amount (Tk)" hint={`Rate ${tk(o.rate)} per unit`}><input {...nbind('amount')} placeholder="0" /></Field>
    </FormSheet>
  )
}
