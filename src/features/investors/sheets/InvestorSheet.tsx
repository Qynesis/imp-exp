import { byId, num, tk, todayISO } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add an investor with the capital they bring, or change their details. */
export const InvestorSheet: SheetComponent<{ investorId?: string }> = ({ investorId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.investors || [], investorId)
  const [v, , bind, nbind] = useForm({ name: cur?.name || '', phone: cur?.phone || '', address: cur?.address || '', note: cur?.note || '', joined: cur?.joined || todayISO(), capital: '', method: 'Bank transfer' })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add investor'} crumb="Investors" submit={cur ? 'Save' : 'Add investor'}
      note={cur ? undefined : 'Capital brought in now comes into the cashbook. Ownership is each investor’s capital as a share of all investors’ capital.'}
      onSubmit={() => {
        const capital = num(v.capital)
        const why = act('saveInvestor', { investor: { id: cur?.id, name: v.name.trim(), phone: v.phone.trim(), address: v.address.trim(), note: v.note.trim(), joined: v.joined }, capital, method: v.method, date: v.joined })
        if (why) return why
        toast(cur ? 'Investor saved' : `${v.name.trim()} added${capital > 0 ? ` with ${tk(capital)} capital` : ''}`)
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="Full name" /></Field>
      <Field label="Mobile"><input {...bind('phone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Address" /></Field>
      <Field label="Joined on"><input type="date" {...bind('joined')} max={todayISO()} /></Field>
      {!cur && <Field label="Capital brought in (Tk)"><input {...nbind('capital')} placeholder="0" /></Field>}
      {!cur && <Field label="Received in"><MethodSelect {...bind('method')} /></Field>}
      <Field label="Note" wide><input {...bind('note')} placeholder="Agreement, NID, nominee…" /></Field>
    </FormSheet>
  )
}
