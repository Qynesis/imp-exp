import { DUTY_COST_TYPE, num, SHIPMENT_COST_TYPES, todayISO } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function AddCostSheet({ importId }: { importId: string }) {
  const { act } = useBooks()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({ type: DUTY_COST_TYPE as string, amount: '', method: 'Cash', date: todayISO() })
  return (
    <FormSheet title={`Add cost · ${importId}`} crumb="Shipments" submit="Add cost" note="Every cost added here counts towards the landed cost of an import, or comes off the margin of an export."
      onSubmit={() => {
        if (num(v.amount) <= 0) return 'Enter the amount.'
        act('addImportCost', { importId, type: v.type, amount: num(v.amount), method: v.method, date: v.date })
        toast('Cost added to landed cost')
      }}>
      <Field label="Cost type">
        <select {...bind('type')}>{SHIPMENT_COST_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}
