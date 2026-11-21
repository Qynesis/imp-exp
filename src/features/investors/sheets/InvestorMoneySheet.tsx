import { useState } from 'react'
import { byId, INVESTOR_TXN, investorRows, num, tk, todayISO, type InvestorTxnKind , type Attachment } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { AttachField } from '@/components/attachments/Attachments'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

type Kind = Exclude<InvestorTxnKind, 'share'>
const KINDS: Kind[] = ['invest', 'withdraw', 'payout', 'reinvest']

/** Capital in or back, profit paid, or profit kept in the business as more capital. */
export const InvestorMoneySheet: SheetComponent<{ investorId: string; kind?: Kind }> = ({ investorId, kind = 'invest' }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const row = investorRows(db).find((r) => r.investor.id === investorId)
  const [v, set, bind, nbind] = useForm({ kind: kind as string, amount: '', method: 'Cash', note: '', date: todayISO() })
  const [files, setFiles] = useState<Attachment[]>([])
  if (!row || !byId(db.investors || [], investorId)) return null
  const k = v.kind as Kind
  const max = k === 'withdraw' ? row.capital : k === 'payout' || k === 'reinvest' ? row.available : null
  return (
    <FormSheet title={INVESTOR_TXN[k]} crumb={row.investor.name} submit="Save"
      note={<>Capital now <b>{tk(row.capital)}</b> · profit waiting <b>{tk(row.available)}</b>. {k === 'reinvest' ? 'No money moves: their profit becomes capital and raises their ownership.' : k === 'invest' ? 'Comes into the cashbook.' : 'Goes out of the cashbook.'}</>}
      onSubmit={() => {
        const amount = num(v.amount)
        const why = act('investorMoney', { investorId, kind: k, amount, method: v.method, note: v.note.trim(), date: v.date , attachments: files.length ? files : undefined })
        if (why) return why
        toast(`${INVESTOR_TXN[k]}: ${tk(amount)}`)
      }}>
      <Field label="What">
        <select {...bind('kind')}>{KINDS.map((x) => <option key={x} value={x}>{INVESTOR_TXN[x]}</option>)}</select>
      </Field>
      <Field label="Amount (Tk)" hint={max != null ? <button type="button" className="link" onClick={() => set('amount', String(max))}>All: {tk(max)}</button> : undefined}><input {...nbind('amount')} placeholder="0" /></Field>
      {k !== 'reinvest' && <Field label={k === 'invest' ? 'Received in' : 'Paid from'}><MethodSelect {...bind('method')} /></Field>}
      <Field label="Date"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Cheque number, reason…" /></Field>
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}
