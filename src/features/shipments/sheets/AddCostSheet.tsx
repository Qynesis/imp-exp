import { byId, COST_GROUPS, costHeadsFor, defaultTrade, num, todayISO, type CostGroup } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** One cost of a shipment, from the heads that suit its transport mode and direction. */
export function AddCostSheet({ importId }: { importId: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const t = { ...defaultTrade(s?.direction || 'import'), ...s?.trade }
  const heads = costHeadsFor(t.mode, s?.direction || 'import').filter((h) => h.group !== 'duty')
  const [v, , bind, nbind] = useForm({ type: heads[0]?.name || 'Other', custom: '', amount: '', method: 'Bank transfer', date: todayISO(), note: '' })
  const groups = [...new Set(heads.map((h) => h.group))] as CostGroup[]
  const other = v.type === 'Other'
  return (
    <FormSheet title={`Add cost · ${importId}`} crumb="Import and export" submit="Add cost"
      note={s?.direction === 'export' ? 'Comes off the export margin.' : 'Counts in the landed cost. Duty and VAT are recorded from the Duty and tax tab, so claimable taxes stay apart.'}
      onSubmit={() => {
        const type = other ? v.custom.trim() || 'Other' : v.type
        const why = act('addImportCost', { importId, type, amount: num(v.amount), method: v.method, date: v.date, note: v.note, group: heads.find((h) => h.name === v.type)?.group })
        if (why) return why
        toast(`${type} added`)
      }}>
      <Field label="Cost">
        <select {...bind('type')}>
          {groups.map((g) => (
            <optgroup key={g} label={COST_GROUPS[g]}>
              {heads.filter((h) => h.group === g).map((h) => <option key={h.name}>{h.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      {other && <Field label="Name it"><input {...bind('custom')} placeholder="e.g. Survey fee" /></Field>}
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="Bill or receipt no." /></Field>
    </FormSheet>
  )
}
