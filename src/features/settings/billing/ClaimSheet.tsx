import { useState, type FormEvent } from 'react'
import type { BillingView } from '@shared/api/contract'
import { planById, type PayMethod, type PlanId } from '@shared/billing'
import { fmt, todayISO } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, Sheet, useSheetItem, useToast, type SheetComponent } from '@/ui'

type Manual = BillingView['manual']
const METHODS: { value: Exclude<PayMethod, 'online' | 'test'>; label: string }[] = [
  { value: 'bkash', label: 'bKash' }, { value: 'nagad', label: 'Nagad' }, { value: 'rocket', label: 'Rocket' }, { value: 'bank', label: 'Bank transfer or deposit' },
]

/** "I paid": the person sent the money by hand and gives the transaction ID, for the platform owner to check. */
export const ClaimSheet: SheetComponent<{ planId: PlanId; manual: Manual; onDone: (v: BillingView) => void }> = ({ planId, manual, onDone }) => {
  const { call } = useBooks()
  const { close } = useSheetItem()
  const toast = useToast()
  const [plan, setPlan] = useState<PlanId>(planId)
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('bkash')
  const [tranId, setTranId] = useState('')
  const [sender, setSender] = useState('')
  const [paidOn, setPaidOn] = useState(todayISO())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const p = planById(plan)!
  const payTo = method === 'bank' ? manual.bank : method === 'nagad' ? manual.nagad : method === 'bkash' ? manual.bkash : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (tranId.trim().length < 4) return setErr('Enter the transaction ID from the payment message or the bank slip.')
    setBusy(true)
    try {
      onDone(await call<BillingView>('POST', 'billing/claim', { plan, method, tranId: tranId.trim(), sender, paidOn, note }))
      toast('Sent. Your access is added once the payment is checked.')
      close()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="I paid by bKash or bank" crumb="Subscription" onSubmit={(e) => void submit(e)}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send for approval'}</Button></>}>
      <div className="note">Send <b>৳{fmt(p.price)}</b> for the {p.label.toLowerCase()} plan ({p.months} months), then enter the transaction ID here. The platform owner checks it and turns your plan on.</div>
      {(manual.bkash || manual.nagad || manual.bank) ? (
        <div className="pay-to">
          {manual.bkash && <div><span>bKash</span><b>{manual.bkash}</b></div>}
          {manual.nagad && <div><span>Nagad</span><b>{manual.nagad}</b></div>}
          {manual.bank && <div><span>Bank</span><b>{manual.bank}</b></div>}
        </div>
      ) : <p className="t-muted tight">Use the bKash, Nagad or bank account your software provider gave you.</p>}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">
        <Field label="Plan">
          <select className="in" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
            {(['quarterly', 'half-yearly', 'yearly'] as PlanId[]).map((id) => { const x = planById(id)!; return <option key={id} value={id}>{x.label} · ৳{fmt(x.price)}</option> })}
          </select>
        </Field>
        <Field label="Paid by">
          <select className="in" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </Field>
        <Field label="Transaction ID" hint={payTo ? `Sent to ${payTo}` : 'From the confirmation SMS, or the bank slip number'}><input className="in" value={tranId} onChange={(e) => setTranId(e.target.value)} placeholder="e.g. 9KD7X2ABCD" autoComplete="off" /></Field>
        <Field label={method === 'bank' ? 'Paid from account' : 'Sent from number'}><input className="in" value={sender} onChange={(e) => setSender(e.target.value)} placeholder={method === 'bank' ? 'Account name or number' : '01XXXXXXXXX'} /></Field>
        <Field label="Date paid"><input className="in" type="date" value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know" /></Field>
      </div>
    </Sheet>
  )
}
