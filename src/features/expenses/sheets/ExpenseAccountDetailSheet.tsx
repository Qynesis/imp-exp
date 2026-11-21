import { byId, expenseAccountCalc, fdate, FREQUENCIES, tk, type Attachment } from '@shared/domain'
import { ClipButton } from '@/components/attachments/Attachments'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Pill, Sheet, useConfirm, useSheets, useToast, type SheetComponent } from '@/ui'
import { ExpenseAccountSheet } from './ExpenseAccountSheet'
import { ExpenseEntrySheet } from './ExpenseEntrySheet'

interface Line {
  key: string
  date: string
  what: string
  charge: number
  paid: number
  balance: number
  entryId?: string
  files?: Attachment[]
}

/** One regular expense: every charge and payment in order, with the running balance. */
export const ExpenseAccountDetailSheet: SheetComponent<{ accountId: string }> = ({ accountId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const a = byId(db.expenseAccounts || [], accountId)
  if (!a) return null
  const c = expenseAccountCalc(db, a.id)
  const canEdit = !accessGuard.readonly
  const entries = (db.expenseEntries || []).filter((e) => e.accountId === a.id)
  const raw: Omit<Line, 'balance'>[] = [
    ...c.charges.map((x) => ({ key: 'c' + x.period + x.date, date: x.date, what: `${x.source === 'bill' ? 'Bill' : 'Charge'} · ${x.label}`, charge: x.amount, paid: 0, entryId: x.entryId })),
    ...entries.filter((e) => e.kind === 'payment').map((e) => ({ key: e.id, date: e.date, what: `Paid${e.method ? ` by ${e.method}` : ''}${e.note ? ` · ${e.note}` : ''}`, charge: 0, paid: e.amount, entryId: e.id, files: e.attachments || [] })),
    ...entries.filter((e) => e.kind === 'adjustment').map((e) => ({ key: e.id, date: e.date, what: `Correction · ${e.note}`, charge: e.amount, paid: 0, entryId: e.id })),
  ].sort((x, y) => (x.date === y.date ? (x.charge ? -1 : 1) : x.date < y.date ? -1 : 1))
  // running balance, oldest first, then newest at the top
  const lines: Line[] = raw.reduce<Line[]>((acc, l) => [...acc, { ...l, balance: Math.round(((acc[acc.length - 1]?.balance || 0) + l.charge - l.paid) * 100) / 100 }], []).reverse()
  const remove = async (id: string) => {
    if (await confirm({ title: 'Remove this entry?', confirmLabel: 'Remove', destructive: true })) if (!act('removeExpenseEntry', id)) toast('Entry removed')
  }
  return (
    <Sheet title={a.name} crumb={`Regular expense · ${a.head}`} wide
      footer={canEdit ? (
        <>
          <Button variant="secondary" icon="edit" onClick={() => sheets.open(ExpenseAccountSheet, { accountId: a.id })}>Edit</Button>
          <Button variant="secondary" onClick={() => { if (!act('saveExpenseAccount', { ...a, active: !a.active })) toast(a.active ? 'Stopped' : 'Started again') }}>{a.active ? 'Stop' : 'Start again'}</Button>
          <Button variant="secondary" icon="receipt" onClick={() => sheets.open(ExpenseEntrySheet, { accountId: a.id, kind: 'bill' })}>Add bill</Button>
          <Button icon="wallet" onClick={() => sheets.open(ExpenseEntrySheet, { accountId: a.id, kind: 'payment' })}>Pay</Button>
        </>
      ) : undefined}>
      <p className="t-muted tight">{a.frequency === 'variable' ? FREQUENCIES.variable : `${tk(a.amount)} · ${FREQUENCIES[a.frequency].toLowerCase()}`} · from {fdate(a.start)}{a.end ? ` to ${fdate(a.end)}` : ''}{a.party ? ` · ${a.party}` : ''} <PhoneLink phone={a.phone} label={a.party} /> {!a.active && <Pill tone="neutral">Stopped</Pill>}</p>
      <div className="mini-stats">
        <div><span>Charged so far</span><b>{tk(c.charged + c.adjusted)}</b><small className="t-muted">{c.charges.length} period{c.charges.length === 1 ? '' : 's'}</small></div>
        <div><span>Paid so far</span><b>{tk(c.paid)}</b><small className="t-muted">{c.payments.length} payment{c.payments.length === 1 ? '' : 's'}</small></div>
        <div><span>{c.balance > 0 ? 'Due now' : c.balance < 0 ? 'Paid ahead' : 'Balance'}</span><b className={c.balance > 0 ? 't-warn' : c.balance < 0 ? 't-good' : undefined}>{tk(Math.abs(c.balance))}</b></div>
      </div>
      <DataTable rows={lines} rowKey={(l) => l.key} pageSize={15} empty="Nothing charged or paid yet."
        columns={[
          { label: 'Date', primary: true, render: (l) => fdate(l.date) },
          { label: 'Entry', render: (l) => l.what },
          { label: 'Charge', align: 'right', render: (l) => (l.charge ? tk(l.charge) : '') },
          { label: 'Paid', align: 'right', render: (l) => (l.paid ? <b className="t-good">{tk(l.paid)}</b> : '') },
          { label: 'Balance', align: 'right', render: (l) => <span className={l.balance > 0 ? 't-warn' : l.balance < 0 ? 't-good' : 't-muted'}>{l.balance < 0 ? `${tk(-l.balance)} ahead` : tk(l.balance)}</span> },
          { label: '', align: 'right', render: (l) => (
            <span className="btn-row tight-row">
              {l.files && l.entryId && <ClipButton target="expenseEntry" id={l.entryId} files={l.files} title={`${a.name} payment`} />}
              {canEdit && l.entryId && <button type="button" className="icon-btn" aria-label="Remove entry" onClick={() => void remove(l.entryId!)}>×</button>}
            </span>
          ) },
        ]} />
      {a.note && <p className="t-muted">{a.note}</p>}
    </Sheet>
  )
}
ExpenseAccountDetailSheet.readOnlySafe = true
