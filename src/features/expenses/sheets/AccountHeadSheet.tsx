import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add or rename an expense (or income) account head, e.g. Rent, Utilities, Bank charges. */
export const AccountHeadSheet: SheetComponent<{ headId?: string }> = ({ headId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.accountHeads || [], headId)
  const nextCode = String(6500 + (db.accountHeads || []).length * 10)
  const [v, , bind] = useForm({ name: cur?.name || '', code: cur?.code || nextCode, group: (cur?.group || 'expense') as string, note: cur?.note || '' })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'New account head'} crumb="Expenses" submit={cur ? 'Save' : 'Add head'}
      note="Heads group costs in the ledger, profit and loss, and the chart of accounts. Renaming one renames it on every expense too."
      onSubmit={() => {
        const why = act('saveAccountHead', { id: cur?.id, name: v.name, code: v.code.trim(), group: v.group as 'expense' | 'income', note: v.note.trim() })
        if (why) return why
        toast(cur ? 'Head saved' : `${v.name.trim()} added`)
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. Rent, Utilities, Bank charges" /></Field>
      <Field label="Account code" hint="For your accountant; any number"><input {...bind('code')} /></Field>
      <Field label="Type">
        <select {...bind('group')}><option value="expense">Expense</option><option value="income">Other income</option></select>
      </Field>
      <Field label="Note"><input {...bind('note')} placeholder="What goes here" /></Field>
    </FormSheet>
  )
}
