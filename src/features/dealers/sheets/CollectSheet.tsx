import { byId, dealerLedger, num, receivables, tk, todayISO } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Take money from a dealer against what they owe. */
export function CollectSheet({ dealerId }: { dealerId?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm(() => {
    const start = dealerId || receivables(db).rows[0]?.dealer.id || db.dealers[0]?.id || ''
    return { dealerId: start, invoiceId: '', amount: '', method: 'Cash', collectedBy: byId(db.dealers, start)?.salesId || '', date: todayISO() }
  })
  const led = byId(db.dealers, v.dealerId) ? dealerLedger(db, v.dealerId) : null
  return (
    <FormSheet title="Collect from dealer" crumb="Cashbook and dues" submit="Save collection"
      note={led ? `${led.dealer.name} owes ${tk(led.due)}. The amount is taken off the oldest invoice first unless you pick one.` : 'Add a dealer first.'}
      onSubmit={() => {
        const amount = num(v.amount)
        if (!led) return 'Choose a dealer.'
        if (amount <= 0) return 'Enter the amount collected.'
        if (amount > led.due) return `That is more than the ${tk(led.due)} this dealer owes.`
        act('collect', { dealerId: v.dealerId, invoiceId: v.invoiceId, amount, method: v.method, collectedBy: v.collectedBy, date: v.date })
        toast(`${tk(amount)} collected from ${led.dealer.name}`)
      }}>
      <Field label="Dealer">
        <select className="in" value={v.dealerId} onChange={(e) => {
          set('dealerId', e.target.value)
          set('invoiceId', '')
          set('collectedBy', byId(db.dealers, e.target.value)?.salesId || '')
        }}>
          {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Against invoice">
        <select {...bind('invoiceId')}>
          <option value="">Oldest due first</option>
          {led?.open.filter((x) => x.id !== 'opening').map((x) => <option key={x.id} value={x.id}>{x.label} · due {tk(x.out)}</option>)}
        </select>
      </Field>
      <Field label="Amount (Tk)" hint={led && led.due > 0 ? <button type="button" className="link" onClick={() => set('amount', String(led.due))}>Full due {tk(led.due)}</button> : undefined}>
        <input {...nbind('amount')} placeholder="0" />
      </Field>
      <Field label="Received by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Collected by">
        <select {...bind('collectedBy')}>
          <option value="">Office</option>
          {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}
