import { byId, fdate, fmt, shipmentCalc, siteStock, stepLabel, todayISO, type StepKey } from '@shared/domain'
import { stepMessage } from '../stepText'
import { SitePicker } from '@/components/SitePicker'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

const NOTE_HINT: Partial<Record<StepKey, string>> = {
  lc: 'e.g. LC no., bank, margin paid, amendment',
  contract: 'e.g. contract or PO no., buyer’s confirmation',
  ready: 'e.g. packed, inspected, cartons and pallets',
  shipped: 'e.g. vessel or flight, B/L or AWB no., container',
  port: 'e.g. berth, rotation no., free time ends',
  customs: 'e.g. Bill of Entry no., C&F agent, duty paid',
  warehouse: 'e.g. truck no., cartons counted, damage',
  paid: 'e.g. bank, amount and rate credited',
}

/** The confirmation popup for the next step of a shipment: when it happened and a note, then it is marked done. */
export const StepDoneSheet: SheetComponent<{ importId: string; step: StepKey }> = ({ importId, step }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const [v, set, bind] = useForm({ date: todayISO(), note: '', siteId: siteStock(db).mainId })
  if (!s) return null
  const c = shipmentCalc(db, s)
  const i = c.keys.indexOf(step)
  const prev = c.keys.slice(0, i).reverse().find((k) => s.steps[k]?.date)
  const prevDate = prev ? s.steps[prev]?.date : undefined
  const after = c.keys[i + 1]
  const into = !c.exp && step === 'warehouse'
  const me = byId(db.users, session.userId)
  return (
    <FormSheet title={`Confirm: ${stepLabel(step, s)}`} crumb={`${s.id} · step ${i + 1} of ${c.keys.length}`} submit="Confirm and mark done"
      note={<>
        <p className="tight">{stepMessage(s, c, step)}</p>
        <small className="t-muted">
          {prev ? `Before this: ${stepLabel(prev, s)} on ${fdate(prevDate)}.` : 'This is the first step.'}
          {after ? ` Next: ${stepLabel(after, s)}.` : ' This is the last step.'}
        </small>
      </>}
      onSubmit={() => {
        if (!v.date) return 'Pick the date it happened.'
        if (v.date > todayISO()) return 'The date cannot be in the future.'
        if (prevDate && v.date < prevDate) return `It cannot be before ${prev ? stepLabel(prev, s) : 'the last step'} on ${fdate(prevDate)}.`
        if (c.exp && step === 'shipped' && c.product && s.qty > c.product.stock) return `Only ${fmt(c.product.stock)} ${c.product.unit} of ${c.productName} in the warehouse.`
        const why = act('markImportStep', { importId: s.id, key: step, date: v.date, note: v.note, by: me?.name || '', siteId: into ? v.siteId || undefined : undefined })
        if (why) return why
        toast(`${stepLabel(step, s)} — done`)
      }}>
      <Field label="Happened on" hint={prevDate ? `Not before ${fdate(prevDate)}` : undefined}><input type="date" min={prevDate} max={todayISO()} {...bind('date')} /></Field>
      {into && <SitePicker db={db} bind={bind('siteId')} />}
      <label className="field wide">
        <span className="field-label">Note <small className="t-muted">optional</small></span>
        <textarea className="in" rows={3} maxLength={500} value={v.note} onChange={(e) => set('note', e.target.value)} placeholder={NOTE_HINT[step] || 'Anything to remember about this step'} />
      </label>
    </FormSheet>
  )
}
