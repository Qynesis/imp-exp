import { byId, num, todayISO, tk } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

type Answer = 'approved' | 'rejected'

/** What the factory said: approved (perhaps at a different rate or quantity) or rejected. */
export function AnswerEstimateSheet({ estimateId }: { estimateId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const e = byId(db.estimates || [], estimateId)
  const [v, set, bind, nbind] = useForm({ answer: 'approved' as Answer, date: todayISO(), qty: e ? String(e.qty) : '', rate: e ? String(e.rate) : '', note: '' })
  if (!e) return null
  const unit = byId(db.products, e.productId)?.unit || ''
  return (
    <FormSheet title="Factory's answer" crumb={`Estimate ${e.id}`} submit={v.answer === 'approved' ? 'Mark approved' : 'Mark rejected'}
      note={v.answer === 'approved' ? 'If the factory changed the quantity or price, put their figures here. Then confirm the order.' : undefined}
      onSubmit={() => {
        if (v.answer === 'approved' && (num(v.qty) <= 0 || num(v.rate) <= 0)) return 'Enter the approved quantity and rate.'
        act('setEstimateStatus', { id: e.id, status: v.answer, date: v.date || todayISO(), answer: v.note.trim(), qty: v.answer === 'approved' ? num(v.qty) : undefined, rate: v.answer === 'approved' ? num(v.rate) : undefined })
        toast(v.answer === 'approved' ? `${e.id} approved` : `${e.id} rejected`)
      }}>
      <div className="field wide">
        <Segmented<Answer> label="Answer" value={v.answer} onChange={(a) => set('answer', a)} options={[{ value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
      </div>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      {v.answer === 'approved' && (
        <>
          <Field label={`Approved quantity (${unit})`}><input {...nbind('qty')} /></Field>
          <Field label="Approved rate (Tk)" hint={num(v.qty) * num(v.rate) ? `Order value ${tk(num(v.qty) * num(v.rate))}` : undefined}><input {...nbind('rate')} /></Field>
        </>
      )}
      <Field label="What the factory said" wide><input {...bind('note')} placeholder={v.answer === 'approved' ? 'e.g. can deliver in 3 lots' : 'e.g. price too low, asked Tk 1,350'} /></Field>
    </FormSheet>
  )
}
