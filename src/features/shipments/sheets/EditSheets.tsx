import { activeProducts, byId, COST_GROUPS, fdate, groupOf, num, stepLabel, todayISO, UNITS, type CostGroup, type StepKey } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Goods, quantity, unit and HS code of a shipment — locked once stock has moved. */
export const ShipmentBasicsSheet: SheetComponent<{ importId: string }> = ({ importId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const [v, , bind, nbind] = useForm({ productId: s?.productId || '', productName: s?.productName || '', qty: s ? String(s.qty) : '', unit: s?.unit || 'pcs', hsCode: s?.customs?.hsCode || '' })
  if (!s) return null
  const moved = s.direction === 'export' ? !!s.steps.shipped?.date : !!s.steps.warehouse?.date
  const product = byId(db.products, v.productId)
  return (
    <FormSheet title={`Goods · ${s.id}`} crumb="Import and export" submit="Save"
      note={moved ? 'Stock has already moved for this shipment, so only the description and HS code can change.' : undefined}
      onSubmit={() => {
        const why = act('saveShipmentBasics', { importId, productId: v.productId, productName: v.productName, qty: num(v.qty), unit: v.unit, hsCode: v.hsCode })
        if (why) return why
        toast('Goods saved')
      }}>
      <Field label="Product">
        <select {...bind('productId')} disabled={moved}>
          {activeProducts(db).concat(product && !activeProducts(db).includes(product) ? [product] : []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Something not in the product list</option>
        </select>
      </Field>
      {!product && <Field label="Goods description"><input {...bind('productName')} /></Field>}
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} disabled={moved} /></Field>
      {!product && <Field label="Unit"><select {...bind('unit')} disabled={moved}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>}
      <Field label="HS code"><input {...bind('hsCode')} placeholder="e.g. 8517.13.00" /></Field>
    </FormSheet>
  )
}

/** Change one cost line: what, how much, when, how paid, and whether it is claimed back. */
export const EditCostSheet: SheetComponent<{ importId: string; costId: string }> = ({ importId, costId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const c = s?.costs.find((x) => x.id === costId)
  const [v, set, bind, nbind] = useForm({ type: c?.type || '', amount: c ? String(c.amount) : '', method: c?.method || 'Bank transfer', date: c?.date || todayISO(), note: c?.note || '', group: (c?.group || groupOf(c?.type || '')) as CostGroup, recoverable: !!c?.recoverable })
  if (!s || !c) return null
  return (
    <FormSheet title={`Edit cost · ${s.id}`} crumb="Import and export" submit="Save cost"
      note={c.refundedOn ? `This deposit was refunded on ${fdate(c.refundedOn)}.` : undefined}
      onSubmit={() => {
        const why = act('updateImportCost', { importId, costId, type: v.type, amount: num(v.amount), method: v.method, date: v.date, note: v.note, group: v.group, recoverable: v.recoverable })
        if (why) return why
        toast('Cost saved')
      }}>
      <Field label="Cost"><input {...bind('type')} /></Field>
      <Field label="Group"><select {...bind('group')}>{(Object.keys(COST_GROUPS) as CostGroup[]).map((g) => <option key={g} value={g}>{COST_GROUPS[g]}</option>)}</select></Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="Bill or receipt no." /></Field>
      <label className="check field wide">
        <input type="checkbox" checked={v.recoverable} onChange={(e) => set('recoverable', e.target.checked)} />
        <span>Claimed back (input VAT, advance tax or a refundable deposit) <small className="t-muted">— kept out of the landed cost</small></span>
      </label>
    </FormSheet>
  )
}

/** Correct a tracking update. */
export const EditTrackSheet: SheetComponent<{ importId: string; eventId: string }> = ({ importId, eventId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const e = s?.trade?.events.find((x) => x.id === eventId)
  const [v, , bind] = useForm({ date: e?.date || todayISO(), place: e?.place || '', text: e?.text || '' })
  if (!s || !e) return null
  return (
    <FormSheet title={`Edit update · ${s.id}`} crumb="Import and export" submit="Save" onSubmit={() => {
      const why = act('updateTrackEvent', { importId, eventId, date: v.date, place: v.place, text: v.text })
      if (why) return why
      toast('Update saved')
    }}>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Where"><input {...bind('place')} /></Field>
      <Field label="What happened" wide><input {...bind('text')} /></Field>
    </FormSheet>
  )
}

/** When a step happened, or when it is expected. */
export const StepDateSheet: SheetComponent<{ importId: string; step: StepKey }> = ({ importId, step }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const st = s?.steps[step]
  const [v, set, bind] = useForm({ date: st?.date || '', expected: st?.expected || '', undo: false, note: st?.note || '' })
  if (!s || !st) return null
  const stock = (s.direction === 'export' && step === 'shipped') || (s.direction !== 'export' && step === 'warehouse')
  return (
    <FormSheet title={stepLabel(step, s)} crumb={s.id} submit="Save"
      note={st.date && stock ? 'This step moved stock, so its date can change but it cannot be undone here.' : undefined}
      onSubmit={() => {
        const why = act('setStepDate', { importId, key: step, date: st.date && !v.undo ? v.date || st.date : undefined, expected: v.expected || undefined, note: st.date ? v.note : undefined })
        if (why) return why
        toast(v.undo ? 'Step set back to pending' : 'Dates saved')
      }}>
      {st.date && <Field label="Done on"><input type="date" max={todayISO()} {...bind('date')} disabled={v.undo} /></Field>}
      <Field label="Expected"><input type="date" {...bind('expected')} /></Field>
      {st.date && (
        <label className="field wide">
          <span className="field-label">Note{st.by ? <small className="t-muted"> · confirmed by {st.by}</small> : null}</span>
          <textarea className="in" rows={3} maxLength={500} value={v.note} disabled={v.undo} onChange={(e) => set('note', e.target.value)} placeholder="Anything to remember about this step" />
        </label>
      )}
      {st.date && !stock && (
        <label className="check field wide">
          <input type="checkbox" checked={v.undo} onChange={(e) => set('undo', e.target.checked)} />
          <span>Not done after all — set it back to pending</span>
        </label>
      )}
    </FormSheet>
  )
}
