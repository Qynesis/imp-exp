import { byId, customsCalc, fdate, todayISO, type CustomsStage } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

const HINT: Partial<Record<CustomsStage, string>> = {
  docs: 'e.g. invoice, packing list, B/L and LC copy with the C&F agent',
  boe: 'e.g. Bill of Entry no. and date, lane',
  assess: 'e.g. assessed value, HS code accepted or changed',
  duty: 'e.g. challan no., bank, amount',
  exam: 'e.g. physical or scan, examiner, findings',
  release: 'e.g. release order no., out-pass, truck booked',
}

/** The confirmation popup for the next customs stage: the date and a note, then it is marked done. */
export const CustomsStageSheet: SheetComponent<{ importId: string; stage: CustomsStage }> = ({ importId, stage }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const [v, set, bind] = useForm({ date: todayISO(), note: '' })
  if (!s) return null
  const c = customsCalc(db, s)
  const i = c.stages.findIndex(([k]) => k === stage)
  const label = c.stages[i]?.[1] || 'Stage'
  const prev = c.stages.slice(0, i).reverse().find(([k]) => c.dates[k])
  const prevDate = prev ? c.dates[prev[0]] : undefined
  const after = c.stages[i + 1]
  return (
    <FormSheet title={`Confirm: ${label}`} crumb={`${s.id} · customs stage ${i + 1} of ${c.stages.length}`} submit="Confirm and mark done"
      note={<>
        <p className="tight">{stage === 'release' ? 'Customs releases the goods; the shipment’s “Customs cleared” step is marked with this date too.' : 'The date and your note are kept with the shipment’s customs record.'}</p>
        <small className="t-muted">
          {prev ? `Before this: ${prev[1]} on ${fdate(prevDate)}.` : 'This is the first stage.'}
          {after ? ` Next: ${after[1]}.` : ' This is the last stage.'}
        </small>
      </>}
      onSubmit={() => {
        if (!v.date) return 'Pick the date it happened.'
        if (v.date > todayISO()) return 'The date cannot be in the future.'
        if (prevDate && v.date < prevDate) return `It cannot be before ${prev?.[1]} on ${fdate(prevDate)}.`
        const why = act('markCustomsStage', { importId: s.id, key: stage, date: v.date, note: v.note, by: byId(db.users, session.userId)?.name || '' })
        if (why) return why
        toast(`${label} — done`)
      }}>
      <Field label="Happened on" hint={prevDate ? `Not before ${fdate(prevDate)}` : undefined}><input type="date" min={prevDate} max={todayISO()} {...bind('date')} /></Field>
      <label className="field wide">
        <span className="field-label">Note <small className="t-muted">optional</small></span>
        <textarea className="in" rows={3} maxLength={500} value={v.note} onChange={(e) => set('note', e.target.value)} placeholder={HINT[stage] || 'Anything to remember'} />
      </label>
    </FormSheet>
  )
}
