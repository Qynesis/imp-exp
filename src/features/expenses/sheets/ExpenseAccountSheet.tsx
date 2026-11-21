import { byId, expenseHeads, FREQUENCIES, num, todayISO, type ExpenseFrequency } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Open or change a regular expense: rent, electricity, internet, a guard's wage… */
export const ExpenseAccountSheet: SheetComponent<{ accountId?: string; head?: string }> = ({ accountId, head }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.expenseAccounts || [], accountId)
  const heads = expenseHeads(db)
  const [v, , bind, nbind] = useForm(() => ({
    name: cur?.name || '', head: cur?.head || head || 'Office', party: cur?.party || '', phone: cur?.phone || '',
    frequency: (cur?.frequency || 'monthly') as string, amount: cur ? String(cur.amount || '') : '', start: cur?.start || todayISO().slice(0, 8) + '01', end: cur?.end || '', note: cur?.note || '',
  }))
  const variable = v.frequency === 'variable'
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'New regular expense'} crumb="Expenses" submit={cur ? 'Save' : 'Open account'}
      note={cur ? undefined : 'A regular expense runs like an account: each period’s charge is added by itself, you pay it in one go or in parts, early (advance) or late (due), and the balance shows where it stands.'}
      onSubmit={() => {
        const why = act('saveExpenseAccount', {
          id: cur?.id, name: v.name.trim(), head: v.head, party: v.party.trim(), phone: v.phone.trim(), frequency: v.frequency as ExpenseFrequency,
          amount: variable ? 0 : num(v.amount), start: v.start, end: v.end || undefined, note: v.note.trim(), active: cur?.active ?? true,
        })
        if (why) return why
        toast(cur ? 'Saved' : `${v.name.trim()} opened`)
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. Warehouse rent, DESCO electricity" /></Field>
      <Field label="Expense head">
        <select {...bind('head')}>{heads.map((h) => <option key={h}>{h}</option>)}</select>
      </Field>
      <Field label="How often">
        <select {...bind('frequency')}>{Object.entries(FREQUENCIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      {!variable && <Field label="Amount each time (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>}
      <Field label="Starts on"><input type="date" {...bind('start')} /></Field>
      <Field label="Ends on" hint="Leave empty if it keeps going"><input type="date" {...bind('end')} /></Field>
      <Field label="Paid to"><input {...bind('party')} placeholder="Landlord, company or person" /></Field>
      <Field label="Their phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Agreement, meter number, advance terms…" /></Field>
    </FormSheet>
  )
}
