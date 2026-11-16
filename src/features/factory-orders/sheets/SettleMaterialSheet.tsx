import { byId, fmt, foCalc, num, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

type Kind = 'returned' | 'wasted'

/** Material left at a factory: take it back into the warehouse, or write it off as wastage. */
export function SettleMaterialSheet({ orderId, productId }: { orderId: string; productId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const o = byId(db.factoryOrders, orderId)
  const m = o ? foCalc(db, o).materials.find((x) => x.productId === productId) : undefined
  const [v, set, bind, nbind] = useForm({ kind: 'returned' as Kind, qty: m ? String(m.left) : '', date: todayISO(), note: '' })
  if (!o || !m) return null
  const factory = byId(db.factories, o.factoryId)?.name || 'the factory'
  return (
    <FormSheet title={v.kind === 'returned' ? 'Take material back' : 'Write off material'} crumb={`${o.id} · ${m.name}`} submit={v.kind === 'returned' ? 'Take back' : 'Write off'}
      note={`${fmt(m.left)} ${m.unit} of ${m.name} is still at ${factory} (given ${fmt(m.given)}, used ${fmt(m.used)}${m.returned ? `, taken back ${fmt(m.returned)}` : ''}${m.wasted ? `, written off ${fmt(m.wasted)}` : ''}).`}
      onSubmit={() => {
        const qty = num(v.qty)
        if (qty <= 0) return 'Enter the quantity.'
        if (qty > m.left + 1e-9) return `Only ${fmt(m.left)} ${m.unit} is left at the factory.`
        act('settleFactoryMaterial', { orderId: o.id, productId, qty, kind: v.kind, date: v.date || todayISO(), note: v.note.trim() })
        toast(v.kind === 'returned' ? `${fmt(qty)} ${m.unit} back in the warehouse` : `${fmt(qty)} ${m.unit} written off`)
      }}>
      <div className="field wide">
        <Segmented<Kind> label="What happened" value={v.kind} onChange={(k) => set('kind', k)} options={[
          { value: 'returned', label: 'Brought back to warehouse' },
          { value: 'wasted', label: 'Wasted at factory' },
        ]} />
      </div>
      <Field label={`Quantity (${m.unit})`}><input {...nbind('qty')} placeholder="0" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder={v.kind === 'returned' ? 'e.g. challan R-14' : 'e.g. spilled during mixing'} /></Field>
    </FormSheet>
  )
}
