import { useState } from 'react'
import {
  byId, fdate, num, TAX_KINDS, taxSettings, thisMonth, tk, todayISO, type Attachment, type ChangeArea, type LedgerAccount, type TaxKind,
} from '@shared/domain'
import { AttachField } from '@/components/attachments/Attachments'
import { MethodSelect } from '@/components/MethodSelect'
import { CHANGE_AREAS } from './areas'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, DataTable, Field, FormSheet, Sheet, useForm, useSheetItem, useToast, type SheetComponent } from '@/ui'

const useMe = () => {
  const { db, session } = useBooks()
  return db.users.find((u) => u.id === session.userId)?.name || ''
}

/** One account: the records behind its figure, and a link to the screen with the full detail. */
export const AccountDetailSheet: SheetComponent<{ account: LedgerAccount; period: string }> = ({ account, period }) => {
  const { close } = useSheetItem()
  return (
    <Sheet title={`${account.code} · ${account.name}`} crumb={period} wide
      footer={account.to ? <Button variant="secondary" onClick={() => { close(); go(account.to!) }}>Open the screen</Button> : undefined}>
      <div className="mini-stats"><div><span>Amount</span><b className={account.amount < 0 ? 't-warn' : undefined}>{tk(account.amount)}</b><small className="t-muted">{account.rows.length} record{account.rows.length === 1 ? '' : 's'}</small></div></div>
      <DataTable rows={account.rows} rowKey={(_, i) => i} pageSize={20} empty="Nothing in this account for the period."
        columns={[
          { label: 'Date', render: (r) => (r.date ? fdate(r.date) : '') },
          { label: 'Details', primary: true, render: (r) => r.details },
          { label: 'Amount', align: 'right', render: (r) => <b className="nowrap">{tk(r.amount)}</b> },
        ]} />
    </Sheet>
  )
}
AccountDetailSheet.readOnlySafe = true

/** Add a tax rate or change one. A change needs a reason, kept in the update notes. */
export const TaxRateSheet: SheetComponent<{ rateId?: string }> = ({ rateId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const me = useMe()
  const cur = byId(db.taxRates || [], rateId)
  const [v, , bind, nbind] = useForm({
    name: cur?.name || '', kind: (cur?.kind || 'vat') as string, rate: cur ? String(cur.rate) : '', appliesTo: (cur?.appliesTo || 'both') as string,
    active: cur ? (cur.active ? 'yes' : 'no') : 'yes', note: '', effective: todayISO(), rateNote: cur?.note || '',
  })
  return (
    <FormSheet title={cur ? `Change ${cur.name}` : 'New tax rate'} crumb="Accounts · Tax and VAT" submit={cur ? 'Save change' : 'Add rate'}
      note={cur ? 'Bills already made keep the rate they were made with. New bills use the new rate.' : undefined}
      onSubmit={() => {
        const why = act('saveTaxRate', {
          rate: { id: cur?.id, name: v.name.trim(), kind: v.kind as TaxKind, rate: num(v.rate), appliesTo: v.appliesTo as 'sales' | 'purchases' | 'both', active: v.active === 'yes', note: v.rateNote.trim() },
          note: v.note.trim(), by: me, effective: v.effective,
        })
        if (why) return why
        toast(cur ? 'Rate changed; note kept' : 'Rate added')
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. VAT 15%" /></Field>
      <Field label="Rate (%)"><input {...nbind('rate')} placeholder="15" /></Field>
      <Field label="Kind"><select {...bind('kind')}>{Object.entries(TAX_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Used on">
        <select {...bind('appliesTo')}><option value="both">Sales and purchases</option><option value="sales">Sales only</option><option value="purchases">Purchases only</option></select>
      </Field>
      <Field label="In use"><select {...bind('active')}><option value="yes">Yes</option><option value="no">No, switched off</option></select></Field>
      <Field label="Takes effect from"><input type="date" {...bind('effective')} /></Field>
      <Field label={cur ? 'Why it changed (kept in update notes)' : 'Note (optional)'} wide><input {...bind('note')} placeholder="e.g. NBR SRO 123, budget 2026-27" /></Field>
      <Field label="Description" wide><input {...bind('rateNote')} placeholder="Which goods or services it is for" /></Field>
    </FormSheet>
  )
}

/** VAT or tax paid to the government by challan or online. */
export const PayTaxSheet: SheetComponent<{ amount?: number; kind?: TaxKind }> = ({ amount, kind = 'vat' }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const [files, setFiles] = useState<Attachment[]>([])
  const [v, , bind, nbind] = useForm({ kind: kind as string, period: thisMonth(), amount: amount && amount > 0 ? String(amount) : '', method: 'Bank transfer', ref: '', note: '', date: todayISO() })
  return (
    <FormSheet title={`Pay ${taxSettings(db).taxName} / tax`} crumb="Accounts · Tax and VAT" submit="Save payment"
      onSubmit={() => {
        const why = act('payTax', { kind: v.kind as TaxKind, period: v.period, amount: num(v.amount), method: v.method, ref: v.ref.trim(), note: v.note.trim(), date: v.date, attachments: files.length ? files : undefined })
        if (why) return why
        toast(`${tk(num(v.amount))} tax payment saved`)
      }}>
      <Field label="Tax"><select {...bind('kind')}>{Object.entries(TAX_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="For the month"><input type="month" {...bind('period')} /></Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid from"><MethodSelect {...bind('method')} /></Field>
      <Field label="Challan / receipt no."><input {...bind('ref')} placeholder="e.g. A-challan number" /></Field>
      <Field label="Date paid"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Return period, office, anything to remember" /></Field>
      <AttachField value={files} onChange={setFiles} />
    </FormSheet>
  )
}

/** A dated note on something that changed: a new VAT rate, a cost increase, a new rule. */
export const ChangeNoteSheet: SheetComponent<{ area?: ChangeArea }> = ({ area = 'vat' }) => {
  const { act } = useBooks()
  const toast = useToast()
  const me = useMe()
  const [v, , bind] = useForm({ area: area as string, subject: '', from: '', to: '', note: '', effective: todayISO() })
  return (
    <FormSheet title="Add an update note" crumb="Accounts · Update notes" submit="Save note"
      onSubmit={() => {
        const why = act('addChangeNote', { area: v.area as ChangeArea, subject: v.subject.trim(), from: v.from.trim() || undefined, to: v.to.trim() || undefined, note: v.note.trim(), by: me, effective: v.effective })
        if (why) return why
        toast('Note saved')
      }}>
      <Field label="About"><select {...bind('area')}>{Object.entries(CHANGE_AREAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="What changed"><input {...bind('subject')} placeholder="e.g. VAT on mosquito coil" /></Field>
      <Field label="Was"><input {...bind('from')} placeholder="e.g. 7.5%" /></Field>
      <Field label="Now"><input {...bind('to')} placeholder="e.g. 10%" /></Field>
      <Field label="Takes effect"><input type="date" {...bind('effective')} /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Order number, reason, who decided" /></Field>
    </FormSheet>
  )
}

/** A new cost per unit with the reason. */
export const UpdateCostSheet: SheetComponent<{ productId: string }> = ({ productId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const me = useMe()
  const p = byId(db.products, productId)
  const [v, , bind, nbind] = useForm({ cost: p ? String(p.cost) : '', note: '', date: todayISO() })
  if (!p) return null
  const margin = p.price > 0 ? Math.round(((p.price - num(v.cost)) / p.price) * 1000) / 10 : null
  return (
    <FormSheet title={`Update cost: ${p.name}`} crumb="Accounts · Costing" submit="Save cost"
      note={<>Now {tk(p.cost)} per {p.unit}. Purchases, imports and factory lots also change the cost by themselves; use this for anything else, with the reason.</>}
      onSubmit={() => {
        const why = act('updateCost', { productId: p.id, cost: num(v.cost), note: v.note.trim(), by: me, date: v.date })
        if (why) return why
        toast('Cost updated; note kept')
      }}>
      <Field label={`New cost per ${p.unit} (Tk)`} hint={margin != null ? `Margin at today’s price ${tk(p.price)}: ${margin}%` : undefined}><input {...nbind('cost')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Why" wide><input {...bind('note')} placeholder="e.g. Freight rate went up, new supplier price" /></Field>
    </FormSheet>
  )
}
