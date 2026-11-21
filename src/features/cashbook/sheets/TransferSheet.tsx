import { useState } from 'react'
import { ACCOUNTS, accountBalances, num, tk, todayISO , type Attachment } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { AttachField } from '@/components/attachments/Attachments'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Move money between our own accounts: deposit cash in the bank, take cash out, bank to bKash. */
export const TransferSheet: SheetComponent<object> = () => {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({ from: 'Cash', to: 'Bank', amount: '', note: '', date: todayISO() })
  const [files, setFiles] = useState<Attachment[]>([])
  const bal = (a: string) => accountBalances(db, v.date).find((r) => r.account === a)?.balance || 0
  return (
    <FormSheet title="Move money between accounts" crumb="Cashbook and dues" submit="Save transfer"
      note="The company’s total money does not change; only where it is kept."
      onSubmit={() => {
        const amount = num(v.amount)
        const why = act('addTransfer', { from: v.from, to: v.to, amount, note: v.note.trim(), date: v.date , attachments: files.length ? files : undefined })
        if (why) return why
        toast(`${tk(amount)} moved from ${v.from} to ${v.to}`)
      }}>
      <Field label="From" hint={`Has ${tk(bal(v.from))}`}><select {...bind('from')}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
      <Field label="To" hint={`Has ${tk(bal(v.to))}`}><select {...bind('to')}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Deposit slip, cheque number…" /></Field>
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}
