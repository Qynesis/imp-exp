import { byId, fmt, materialsFor, num, recipeInfo, tk, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Make a batch in our own workshop: the recipe's materials leave stock and the finished goods come in. */
export function ProduceSheet({ productId }: { productId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const p = byId(db.products, productId)
  const [v, , bind, nbind] = useForm({ qty: '', extra: '', date: todayISO(), note: '' })
  if (!p) return null
  const info = recipeInfo(db, p)
  const qty = num(v.qty)
  const need = materialsFor(p, qty)
  const materialCost = need.reduce((s, m) => s + m.given * (byId(db.products, m.productId)?.cost || 0), 0)
  const unitCost = qty > 0 ? (materialCost + num(v.extra)) / qty : 0
  return (
    <FormSheet title="Make in our workshop" crumb={p.name} submit="Record batch"
      note={info.rows.length ? `With the stock on hand you can make up to ${fmt(info.canMake)} ${p.unit}${info.limitedBy ? `; ${info.limitedBy} runs out first` : ''}.` : 'This product has no recipe yet. Add one with Edit first.'}
      onSubmit={() => {
        if (!info.rows.length) return 'Add a recipe to the product first.'
        if (qty <= 0) return 'Enter how many you made.'
        for (const m of need) {
          const mat = byId(db.products, m.productId)
          if (!mat || m.given > mat.stock + 1e-9) return `Not enough ${mat?.name || 'material'}: need ${fmt(m.given)}, have ${fmt(mat?.stock)} ${mat?.unit || ''}.`
        }
        act('produce', { productId: p.id, qty, materials: need, extraCost: num(v.extra), date: v.date || todayISO(), note: v.note.trim() })
        toast(`${fmt(qty)} ${p.unit} of ${p.name} added to stock`)
      }}>
      <Field label={`Quantity made (${p.unit})`}><input {...nbind('qty')} placeholder="e.g. 20" /></Field>
      <Field label="Labour and other making cost (Tk)" hint="For the whole batch. Pay wages through the cashbook as usual."><input {...nbind('extra')} placeholder="0" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="e.g. batch 14" /></Field>
      {qty > 0 && (
        <div className="field wide">
          <span className="field-label">Materials this batch uses</span>
          <div className="rows flush">
            {need.map((m) => {
              const mat = byId(db.products, m.productId)
              const short = !mat || m.given > mat.stock + 1e-9
              return (
                <div key={m.productId} className="row">
                  <span className="name normal">{mat?.name || 'Removed material'}</span>
                  <span className={'meta' + (short ? ' t-warn' : '')}>{fmt(mat?.stock)} {mat?.unit} in stock</span>
                  <span className={'amt' + (short ? ' t-warn' : '')}>{fmt(m.given)} {mat?.unit}</span>
                </div>
              )
            })}
          </div>
          <small>New cost per {p.unit.replace(/s$/, '')}: {tk(unitCost)} (materials {tk(materialCost)} + making {tk(num(v.extra))}, divided by {fmt(qty)}).</small>
        </div>
      )}
    </FormSheet>
  )
}
