import { useState } from 'react'
import {
  addDays, addMonths, expenseAccountCalc, expenseAccountTotals, expenseHeads, expenseRows, fdate, fmonth, FREQUENCIES, sum, thisMonth, tk, todayISO, type ISODate,
} from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { ClipButton } from '@/components/attachments/Attachments'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { AddExpenseSheet } from '@/features/cashbook/sheets/AddExpenseSheet'
import { Button, Card, cls, DataTable, Pill, Segmented, Stat, useSheets, SearchBox } from '@/ui'
import { AccountHeadSheet } from './sheets/AccountHeadSheet'
import { ExpenseAccountDetailSheet } from './sheets/ExpenseAccountDetailSheet'
import { ExpenseAccountSheet } from './sheets/ExpenseAccountSheet'
import { ExpenseEntrySheet } from './sheets/ExpenseEntrySheet'

type Tab = 'ledger' | 'regular' | 'heads'
type Range = 'month' | 'last' | 'year' | 'custom'

const rangeOf = (r: Range, custom: [ISODate, ISODate]): [ISODate, ISODate] => {
  const t = todayISO()
  if (r === 'month') return [t.slice(0, 7) + '-01', t]
  if (r === 'last') {
    const m = addMonths(thisMonth(), -1)
    return [m + '-01', addDays(thisMonth() + '-01', -1)]
  }
  if (r === 'year') return [t.slice(0, 4) + '-01-01', t]
  return custom
}

/** #/expenses: every cost in one place, one-time and regular, found in one click. */
export default function ExpensesPage({ params: [param = ''] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const tab: Tab = param === 'regular' || param === 'heads' ? param : 'ledger'
  const totals = expenseAccountTotals(db)
  const month = expenseRows(db, thisMonth() + '-01', todayISO())
  const byHead = new Map<string, number>()
  for (const r of month) byHead.set(r.head, (byHead.get(r.head) || 0) + r.amount)
  const top = [...byHead.entries()].sort((a, b) => b[1] - a[1])[0]
  return (
    <>
      <PageHead title="Expenses" sub="One-time costs and regular ones (rent, bills, wages), with what is due or paid ahead."
        actions={
          <>
            <Button variant="secondary" icon="plus" onClick={() => sheets.open(ExpenseAccountSheet, {})}>New regular expense</Button>
            <Button icon="plus" onClick={() => sheets.open(AddExpenseSheet, { head: 'Office' })}>Add expense</Button>
          </>
        } />
      <div className="stats">
        <Stat icon="wallet" label="Spent this month" value={tk(sum(month, (r) => r.amount))} sub={`${month.length} entr${month.length === 1 ? 'y' : 'ies'}, one-time and regular`} />
        <Stat icon="alert" label="Regular expenses due" value={tk(totals.due)} tone={totals.due > 0 ? 'warn' : undefined} href="#/expenses/regular" sub={`${totals.rows.filter((r) => r.balance > 0.5).length} account(s) owed`} />
        <Stat icon="arrowOut" label="Paid ahead (advance)" value={tk(totals.advance)} tone={totals.advance > 0 ? 'good' : undefined} href="#/expenses/regular" />
        <Stat icon="chart" label="Biggest head this month" value={top ? top[0] : '—'} sub={top ? tk(top[1]) : 'Nothing spent yet'} />
      </div>
      <Segmented<Tab> label="Expenses section" value={tab} onChange={(t) => go(t === 'ledger' ? 'expenses' : 'expenses/' + t)} options={[
        { value: 'ledger', label: 'Expense ledger' }, { value: 'regular', label: `Regular (${totals.rows.length})` }, { value: 'heads', label: 'Heads' },
      ]} />
      {tab === 'ledger' && <Ledger />}
      {tab === 'regular' && <Regular />}
      {tab === 'heads' && <Heads />}
    </>
  )
}

function Ledger() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [range, setRange] = useState<Range>('month')
  const [custom, setCustom] = useState<[ISODate, ISODate]>([thisMonth() + '-01', todayISO()])
  const [head, setHead] = useState('')
  const [kind, setKind] = useState<'all' | 'one-time' | 'regular'>('all')
  const [q, setQ] = useState('')
  const [from, to] = rangeOf(range, custom)
  const all = expenseRows(db, from, to)
  const heads = new Map<string, number>()
  for (const r of all) heads.set(r.head, (heads.get(r.head) || 0) + r.amount)
  const n = q.trim().toLowerCase()
  const rows = all.filter((r) => (!head || r.head === head) && (kind === 'all' || r.kind === kind) && (!n || `${r.details} ${r.head} ${r.method || ''}`.toLowerCase().includes(n)))
  const expenseById = new Map(db.expenses.map((e) => [e.id, e]))
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth(), -i))
  return (
    <div className="stack">
      <Card icon="receipt" title={head ? `${head}: every entry` : 'Every expense'} sub={`${fdate(from)} to ${fdate(to)} · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} · ${tk(sum(rows, (r) => r.amount))}`}
        action={<div className="tools-right"><Segmented<typeof kind> label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'one-time', label: 'One-time' }, { value: 'regular', label: 'Regular' }]} /><SearchBox value={q} onChange={setQ} placeholder="Details or head" label="Search expenses" /></div>}>
        <div className="card-body pt0 stack-sm">
          <div className="chips">
            {(['month', 'last', 'year', 'custom'] as Range[]).map((r) => (
              <button key={r} type="button" className={cls('chip sm', range === r && 'on')} onClick={() => setRange(r)}>{{ month: 'This month', last: 'Last month', year: 'This year', custom: 'Choose dates' }[r]}</button>
            ))}
            {range === 'custom' && (
              <span className="date-pair">
                <input className="in sm" type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} aria-label="From" />
                <input className="in sm" type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} aria-label="To" />
              </span>
            )}
          </div>
          <div className="chips head-chips">
            <button type="button" className={cls('chip', !head && 'on')} onClick={() => setHead('')}>All heads <b>{tk(sum(all, (r) => r.amount))}</b></button>
            {[...heads.entries()].sort((a, b) => b[1] - a[1]).map(([h, amt]) => (
              <button key={h} type="button" className={cls('chip', head === h && 'on')} onClick={() => setHead(head === h ? '' : h)}>{h} <b>{tk(amt)}</b></button>
            ))}
          </div>
        </div>
        <DataTable pageSize={25} rows={rows} rowKey={(r) => r.id} empty="No expenses in this period."
          onRow={(r) => { if (r.accountId) sheets.open(ExpenseAccountDetailSheet, { accountId: r.accountId }) }}
          columns={[
            { label: 'Date', render: (r) => <span className="nowrap">{fdate(r.date)}</span> },
            { label: 'Details', primary: true, render: (r) => <span className="two-line"><span>{r.details}</span><small><Pill tone={r.kind === 'regular' ? 'info' : 'neutral'}>{r.kind === 'regular' ? 'Regular' : 'One-time'}</Pill></small></span> },
            { label: 'Head', render: (r) => <button type="button" className="link" onClick={(e) => { e.stopPropagation(); setHead(r.head) }}>{r.head}</button> },
            { label: 'Paid by', render: (r) => <span className="t-muted">{r.method || 'Account'}</span> },
            { label: 'Amount', align: 'right', render: (r) => <b className="nowrap">{tk(r.amount)}</b> },
            { label: '', align: 'right', render: (r) => (r.kind === 'one-time' && expenseById.get(r.id) ? <ClipButton target="expense" id={r.id} files={expenseById.get(r.id)?.attachments || []} title={r.details} /> : '') },
          ]} />
      </Card>
      {head && (
        <Card icon="chart" title={`${head}: month by month`} sub="Last 12 months, one-time and regular together">
          <DataTable rows={months.map((m) => ({ m, amount: sum(expenseRows(db, m + '-01', m + '-31').filter((r) => r.head === head), (r) => r.amount) }))} rowKey={(x) => x.m} pageSize={12}
            columns={[
              { label: 'Month', primary: true, render: (x) => fmonth(x.m) },
              { label: 'Spent', align: 'right', render: (x) => (x.amount ? <b>{tk(x.amount)}</b> : <span className="t-muted">—</span>) },
            ]} />
        </Card>
      )}
    </div>
  )
}

function Regular() {
  const { db } = useBooks()
  const sheets = useSheets()
  const rows = (db.expenseAccounts || []).map((a) => expenseAccountCalc(db, a.id)).sort((x, y) => Number(y.account.active) - Number(x.account.active) || y.balance - x.balance)
  const canEdit = !accessGuard.readonly
  return (
    <Card icon="calendar" title="Regular expenses" sub="Rent, electricity, internet, wages… Charges add up each period; pay in full, in parts, early or late."
      action={<Button size="sm" icon="plus" onClick={() => sheets.open(ExpenseAccountSheet, {})}>New</Button>}>
      <DataTable rows={rows} rowKey={(r) => r.account.id} onRow={(r) => sheets.open(ExpenseAccountDetailSheet, { accountId: r.account.id })}
        empty="No regular expenses yet. Open one for rent, electricity or anything that repeats."
        columns={[
          { label: 'Expense', primary: true, render: (r) => <span className="two-line"><b>{r.account.name}</b><small className="t-muted">{r.account.head}{r.account.party ? ` · ${r.account.party}` : ''}{r.account.active ? '' : ' · stopped'}</small></span> },
          { label: 'Schedule', render: (r) => <span className="t-muted">{r.account.frequency === 'variable' ? 'Bills vary' : `${tk(r.account.amount)} ${FREQUENCIES[r.account.frequency].toLowerCase()}`}</span> },
          { label: 'Charged', align: 'right', render: (r) => tk(r.charged + r.adjusted) },
          { label: 'Paid', align: 'right', render: (r) => tk(r.paid) },
          { label: 'Balance', align: 'right', render: (r) => <Pill tone={r.balance > 0.5 ? 'warn' : r.balance < -0.5 ? 'good' : 'neutral'}>{r.balance > 0.5 ? `Due ${tk(r.balance)}` : r.balance < -0.5 ? `Advance ${tk(-r.balance)}` : 'Settled'}</Pill> },
          { label: '', align: 'right', render: (r) => (canEdit ? (
            <span className="btn-row tight-row" onClick={(e) => e.stopPropagation()}>
              {r.account.frequency === 'variable' && <Button size="sm" variant="secondary" onClick={() => sheets.open(ExpenseEntrySheet, { accountId: r.account.id, kind: 'bill' })}>Bill</Button>}
              <Button size="sm" onClick={() => sheets.open(ExpenseEntrySheet, { accountId: r.account.id, kind: 'payment' })}>Pay</Button>
            </span>
          ) : '') },
        ]} />
    </Card>
  )
}

function Heads() {
  const { db } = useBooks()
  const sheets = useSheets()
  const from = thisMonth() + '-01'
  const rows = expenseRows(db, from, todayISO())
  const own = db.accountHeads || []
  const heads = expenseHeads(db).map((h) => ({ h, own: own.find((x) => x.name === h), month: sum(rows.filter((r) => r.head === h), (r) => r.amount), regular: (db.expenseAccounts || []).filter((a) => a.head === h).length }))
  return (
    <Card icon="layers" title="Expense heads" sub="Group costs the way your accountant wants. Click a head to see every entry."
      action={<Button size="sm" icon="plus" onClick={() => sheets.open(AccountHeadSheet, {})}>Add head</Button>}>
      <DataTable rows={heads} rowKey={(x) => x.h}
        columns={[
          { label: 'Code', render: (x) => <span className="mono">{x.own?.code || 'built-in'}</span> },
          { label: 'Head', primary: true, render: (x) => <span className="two-line"><b>{x.h}</b>{x.own?.note && <small className="t-muted">{x.own.note}</small>}</span> },
          { label: 'Regular accounts', align: 'right', render: (x) => x.regular || '' },
          { label: 'This month', align: 'right', render: (x) => (x.month ? <b>{tk(x.month)}</b> : <span className="t-muted">—</span>) },
          { label: '', align: 'right', render: (x) => (x.own ? <Button size="sm" variant="ghost" onClick={() => sheets.open(AccountHeadSheet, { headId: x.own!.id })}>Edit</Button> : '') },
        ]} />
    </Card>
  )
}
