import { useState } from 'react'
import {
  ACCOUNT_GROUPS, addDays, addMonths, chartOfAccounts, COUNTRIES, countryByCode, fdate, fmonth, isAdmin, sum, TAX_KINDS, taxReport, taxSettings, thisMonth, tk, todayISO,
  type AccountGroup, type ChangeArea, type ISODate, type MoneyGrouping,
} from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { ClipButton } from '@/components/attachments/Attachments'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Field, Pill, Segmented, Stat, useConfirm, useSheets, useToast, SearchBox } from '@/ui'
import { CHANGE_AREAS } from './areas'
import { AccountDetailSheet, ChangeNoteSheet, PayTaxSheet, TaxRateSheet, UpdateCostSheet } from './sheets'

type Tab = 'chart' | 'tax' | 'notes' | 'costing'
type Range = 'month' | 'last' | 'year' | 'all' | 'custom'

const rangeOf = (r: Range, custom: [ISODate, ISODate]): [ISODate, ISODate] => {
  const t = todayISO()
  if (r === 'month') return [t.slice(0, 7) + '-01', t]
  if (r === 'last') return [addMonths(thisMonth(), -1) + '-01', addDays(thisMonth() + '-01', -1)]
  if (r === 'year') return [t.slice(0, 4) + '-01-01', t]
  if (r === 'all') return ['2000-01-01', t]
  return custom
}
const RANGES: Record<Range, string> = { month: 'This month', last: 'Last month', year: 'This year', all: 'All time', custom: 'Choose dates' }

function PeriodPicker({ range, setRange, custom, setCustom }: { range: Range; setRange: (r: Range) => void; custom: [ISODate, ISODate]; setCustom: (c: [ISODate, ISODate]) => void }) {
  return (
    <div className="chips">
      {(Object.keys(RANGES) as Range[]).map((r) => <button key={r} type="button" className={cls('chip sm', range === r && 'on')} onClick={() => setRange(r)}>{RANGES[r]}</button>)}
      {range === 'custom' && (
        <span className="date-pair">
          <input className="in sm" type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} aria-label="From" />
          <input className="in sm" type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} aria-label="To" />
        </span>
      )}
    </div>
  )
}

/** #/accounts: chart of accounts, tax and VAT, update notes and costing. */
export default function AccountsPage({ params: [param = ''] }: FeatureRouteProps) {
  const tab: Tab = (['tax', 'notes', 'costing'] as const).includes(param as 'tax') ? (param as Tab) : 'chart'
  const [range, setRange] = useState<Range>('month')
  const [custom, setCustom] = useState<[ISODate, ISODate]>([thisMonth() + '-01', todayISO()])
  const [from, to] = rangeOf(range, custom)
  return (
    <>
      <PageHead title="Accounts" sub="Every account and cost in one place, with VAT and tax for your country and a note on every change." />
      <Segmented<Tab> label="Accounts section" value={tab} onChange={(t) => go(t === 'chart' ? 'accounts' : 'accounts/' + t)} options={[
        { value: 'chart', label: 'Chart of accounts' }, { value: 'tax', label: 'Tax and VAT' }, { value: 'notes', label: 'Update notes' }, { value: 'costing', label: 'Costing' },
      ]} />
      {(tab === 'chart' || tab === 'tax') && <PeriodPicker range={range} setRange={setRange} custom={custom} setCustom={setCustom} />}
      {tab === 'chart' && <Chart from={from} to={to} label={range === 'custom' ? `${fdate(from)} to ${fdate(to)}` : RANGES[range]} />}
      {tab === 'tax' && <Tax from={from} to={to} />}
      {tab === 'notes' && <Notes />}
      {tab === 'costing' && <Costing />}
    </>
  )
}

function Chart({ from, to, label }: { from: ISODate; to: ISODate; label: string }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const all = chartOfAccounts(db, from, to)
  const tot = (g: AccountGroup) => sum(all.filter((a) => a.group === g), (a) => a.amount)
  const profit = tot('income') - tot('cost') - tot('expense')
  const shown = all.filter((a) => !q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="stack">
      <div className="stats">
        <Stat icon="building" label="Assets" value={tk(tot('asset'))} sub="Owned, as of the end date" />
        <Stat icon="arrowOut" label="Liabilities" value={tk(tot('liability'))} tone={tot('liability') > 0 ? 'warn' : undefined} sub="Owed, as of the end date" />
        <Stat icon="trend" label={profit < 0 ? 'Loss in the period' : 'Profit in the period'} value={tk(Math.abs(profit))} tone={profit < 0 ? 'warn' : 'good'} sub={`Income ${tk(tot('income'))} − costs and expenses`} />
        <Stat icon="layers" label="Costing (into stock)" value={tk(tot('costing'))} sub="Bought, imported and made" />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Find an account by name or code" label="Find an account" />
      {(Object.keys(ACCOUNT_GROUPS) as AccountGroup[]).map((g) => {
        const rows = shown.filter((a) => a.group === g)
        if (!rows.length) return null
        return (
          <Card key={g} title={`${ACCOUNT_GROUPS[g].code} · ${ACCOUNT_GROUPS[g].label}`} sub={ACCOUNT_GROUPS[g].note} action={<b>{tk(sum(rows, (a) => a.amount))}</b>}>
            <DataTable rows={rows} rowKey={(a) => a.code + a.name} onRow={(a) => sheets.open(AccountDetailSheet, { account: a, period: label })}
              columns={[
                { label: 'Code', render: (a) => <span className="mono">{a.code}</span> },
                { label: 'Account', primary: true, render: (a) => a.name },
                { label: 'Records', align: 'right', render: (a) => <span className="t-muted">{a.rows.length || ''}</span> },
                { label: 'Amount', align: 'right', render: (a) => <b className={cls('nowrap', a.amount < 0 && 't-warn', !a.amount && 't-muted')}>{tk(a.amount)}</b> },
              ]} />
          </Card>
        )
      })}
    </div>
  )
}

function Tax({ from, to }: { from: ISODate; to: ISODate }) {
  const { db, act, session } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const t = taxSettings(db)
  const r = taxReport(db, from, to)
  const admin = isAdmin(db, session.userId)
  const canEdit = !accessGuard.readonly
  const me = db.users.find((u) => u.id === session.userId)?.name || ''
  const rates = db.taxRates || []
  const [country, setCountry] = useState(t.country)
  const [cur, setCur] = useState({ code: t.currency.code, symbol: t.currency.symbol, grouping: t.currency.grouping as MoneyGrouping })
  const [taxNo, setTaxNo] = useState(t.taxNo)
  const preset = countryByCode(country)
  const saveCountry = async () => {
    const changing = country !== t.country
    const replace = changing || !rates.length ? await confirm({ title: `Use ${preset.name}’s tax rates?`, message: `${preset.hint} Your current rates are kept but switched off.`, confirmLabel: 'Load rates' }) : false
    const why = act('setCountry', { country, currency: cur, replaceRates: replace, note: changing ? `Switched to ${preset.name}` : 'Currency updated', by: me })
    if (!why) act('saveTaxSettings', { taxNo: taxNo.trim(), salesDefault: replace ? (db.company.tax?.salesDefault || []) : t.salesDefault, pricesIncludeTax: t.pricesIncludeTax })
    if (!why) toast('Country, currency and tax number saved')
  }
  const toggleDefault = (id: string) => act('saveTaxSettings', { taxNo: t.taxNo, salesDefault: t.salesDefault.includes(id) ? t.salesDefault.filter((x) => x !== id) : [...t.salesDefault, id], pricesIncludeTax: t.pricesIncludeTax })
  return (
    <div className="stack">
      <div className="stats">
        <Stat icon="receipt" label={`${t.taxName} charged on sales`} value={tk(r.outputTotal)} sub={`${r.output.length} bill line${r.output.length === 1 ? '' : 's'}`} />
        <Stat icon="arrowIn" label={`${t.taxName} paid on purchases and imports`} value={tk(r.inputTotal)} sub="Can be set off" />
        <Stat icon="wallet" label="Paid to the government" value={tk(r.paidTotal)} sub={`${r.paid.length} payment${r.paid.length === 1 ? '' : 's'}`} />
        <Stat icon="alert" label={r.balance >= 0 ? `${t.taxName} still to pay (all time)` : `${t.taxName} to carry forward`} value={tk(Math.abs(r.balance))} tone={r.balance > 0 ? 'warn' : 'good'} sub={`This period: net ${tk(r.net)}`} />
      </div>
      <div className="grid2">
        <Card icon="settings" title="Country, currency and tax number" sub={preset.hint}>
          <div className="card-body pt0 form-grid">
            <Field label="Country">
              <select className="in" value={country} disabled={!admin} onChange={(e) => { setCountry(e.target.value); const c = countryByCode(e.target.value).currency; setCur({ code: c.code, symbol: c.symbol, grouping: c.grouping }) }}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={`${preset.taxNoLabel} (printed on bills)`}><input className="in" value={taxNo} disabled={!admin} onChange={(e) => setTaxNo(e.target.value)} placeholder="Registration number" /></Field>
            <Field label="Currency code"><input className="in" value={cur.code} disabled={!admin} onChange={(e) => setCur({ ...cur, code: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
            <Field label="Symbol"><input className="in" value={cur.symbol} disabled={!admin} onChange={(e) => setCur({ ...cur, symbol: e.target.value.slice(0, 4) })} /></Field>
            <Field label="Number grouping">
              <select className="in" value={cur.grouping} disabled={!admin} onChange={(e) => setCur({ ...cur, grouping: e.target.value as MoneyGrouping })}>
                <option value="lakh">1,20,000 (lakh, crore)</option><option value="western">120,000 (thousand, million)</option>
              </select>
            </Field>
            {admin ? <Button onClick={() => void saveCountry()}>Save</Button> : <p className="t-muted">Only an admin can change these.</p>}
          </div>
        </Card>
        <Card icon="receipt" title={`${t.taxName} by rate in this period`}>
          <DataTable rows={r.byName} rowKey={(x) => x.name} empty="No VAT or tax in this period."
            columns={[
              { label: 'Rate', primary: true, render: (x) => x.name },
              { label: 'On sales', align: 'right', render: (x) => tk(x.output) },
              { label: 'On purchases', align: 'right', render: (x) => tk(x.input) },
            ]} />
          {canEdit && <div className="card-body"><Button icon="wallet" onClick={() => sheets.open(PayTaxSheet, { amount: Math.max(r.balance, 0) })}>Pay {t.taxName} / tax</Button></div>}
        </Card>
      </div>
      <Card icon="layers" title="Tax rates" sub="Tick the ones added to every new sale bill. Changing a rate asks for a note, kept under Update notes."
        action={canEdit ? <Button size="sm" icon="plus" onClick={() => sheets.open(TaxRateSheet, {})}>Add rate</Button> : undefined}>
        <DataTable rows={[...rates].sort((a, b) => Number(b.active) - Number(a.active))} rowKey={(x) => x.id} onRow={canEdit ? (x) => sheets.open(TaxRateSheet, { rateId: x.id }) : undefined}
          empty="No tax rates yet. Pick your country above and save to load its usual rates."
          columns={[
            { label: 'Name', primary: true, render: (x) => <span className="two-line"><b>{x.name}</b>{x.note && <small className="t-muted">{x.note}</small>}</span> },
            { label: 'Kind', render: (x) => TAX_KINDS[x.kind] },
            { label: 'Rate', align: 'right', render: (x) => <b>{x.rate}%</b> },
            { label: 'Used on', render: (x) => ({ both: 'Sales and purchases', sales: 'Sales', purchases: 'Purchases' })[x.appliesTo] },
            { label: 'On new bills', render: (x) => (x.active && x.appliesTo !== 'purchases' ? <label className="check" onClick={(e) => e.stopPropagation()}><input type="checkbox" disabled={!canEdit} checked={t.salesDefault.includes(x.id)} onChange={() => toggleDefault(x.id)} /> Default</label> : '') },
            { label: 'Status', align: 'right', render: (x) => <Pill tone={x.active ? 'good' : 'neutral'}>{x.active ? 'In use' : 'Off'}</Pill> },
          ]} />
        {canEdit && (
          <div className="card-body">
            <label className="check"><input type="checkbox" checked={t.pricesIncludeTax} onChange={(e) => act('saveTaxSettings', { taxNo: t.taxNo, salesDefault: t.salesDefault, pricesIncludeTax: e.target.checked })} /> Our prices already include {t.taxName} (it is taken out of the price on bills, not added on top)</label>
          </div>
        )}
      </Card>
      <div className="grid2">
        <Card icon="receipt" title={`${t.taxName} on sales`} sub={`${fdate(from)} to ${fdate(to)}`}>
          <DataTable rows={r.output} rowKey={(x, i) => x.ref + i} pageSize={10} empty="No VAT on sales in this period."
            columns={[
              { label: 'Date', render: (x) => fdate(x.date) },
              { label: 'Bill', primary: true, render: (x) => `${x.ref} · ${x.name}` },
              { label: 'Amount', align: 'right', render: (x) => tk(x.amount) },
            ]} />
        </Card>
        <Card icon="arrowIn" title={`${t.taxName} on purchases and imports`} sub={r.advanceTotal ? `Advance income tax (AIT) in the period: ${tk(r.advanceTotal)}` : undefined}>
          <DataTable rows={r.input} rowKey={(x, i) => x.ref + i} pageSize={10} empty="No VAT on purchases or imports in this period."
            columns={[
              { label: 'Date', render: (x) => fdate(x.date) },
              { label: 'From', primary: true, render: (x) => x.details },
              { label: 'Amount', align: 'right', render: (x) => tk(x.amount) },
            ]} />
        </Card>
      </div>
      <Card icon="wallet" title="Payments to the government" sub={`${fdate(from)} to ${fdate(to)}`}>
        <DataTable rows={r.paid} rowKey={(x) => x.id} empty="No tax paid in this period."
          columns={[
            { label: 'Date', render: (x) => fdate(x.date) },
            { label: 'For', primary: true, render: (x) => `${TAX_KINDS[x.kind]} · ${fmonth(x.period)}${x.ref ? ` · ${x.ref}` : ''}` },
            { label: 'Amount', align: 'right', render: (x) => <b>{tk(x.amount)}</b> },
            { label: '', align: 'right', render: (x) => (
              <span className="btn-row tight-row">
                <ClipButton target="taxPayment" id={x.id} files={(db.taxPayments || []).find((p) => p.id === x.id)?.attachments || []} title={`Tax payment ${x.ref}`} />
                {canEdit && <button type="button" className="icon-btn" aria-label="Remove payment" onClick={() => void confirm({ title: 'Remove this tax payment?', destructive: true, confirmLabel: 'Remove' }).then((ok) => { if (ok && !act('removeTaxPayment', x.id)) toast('Removed') })}>×</button>}
              </span>
            ) },
          ]} />
      </Card>
    </div>
  )
}

function Notes() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const confirm = useConfirm()
  const [area, setArea] = useState<ChangeArea | ''>('')
  const notes = [...(db.changeNotes || [])].filter((n) => !area || n.area === area).sort((a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1))
  const canEdit = !accessGuard.readonly
  return (
    <Card icon="receipt" title="Update notes" sub="Every change to VAT, tax, costs, regular expenses or currency, with the reason and who made it. Rate and cost changes are noted by themselves."
      action={canEdit ? <Button size="sm" icon="plus" onClick={() => sheets.open(ChangeNoteSheet, { area: area || 'vat' })}>Add note</Button> : undefined}>
      <div className="card-body pt0 chips">
        <button type="button" className={cls('chip sm', !area && 'on')} onClick={() => setArea('')}>All ({(db.changeNotes || []).length})</button>
        {(Object.keys(CHANGE_AREAS) as ChangeArea[]).map((a) => {
          const n = (db.changeNotes || []).filter((x) => x.area === a).length
          return n ? <button key={a} type="button" className={cls('chip sm', area === a && 'on')} onClick={() => setArea(a)}>{CHANGE_AREAS[a]} ({n})</button> : null
        })}
      </div>
      <DataTable rows={notes} rowKey={(n) => n.id} pageSize={20} empty="No notes yet. They appear here when a rate or cost changes."
        columns={[
          { label: 'Date', render: (n) => <span className="two-line"><span className="nowrap">{fdate(n.date)}</span>{n.effective && n.effective !== n.date && <small className="t-muted">from {fdate(n.effective)}</small>}</span> },
          { label: 'Change', primary: true, render: (n) => <span className="two-line"><b>{n.subject}</b><small className="t-muted">{n.note}</small></span> },
          { label: 'Was → now', render: (n) => (n.from || n.to ? <span className="nowrap">{n.from || '—'} → <b>{n.to || '—'}</b></span> : '') },
          { label: 'About', render: (n) => <Pill tone={n.area === 'vat' || n.area === 'tax' ? 'info' : n.area === 'costing' ? 'warn' : 'neutral'}>{CHANGE_AREAS[n.area]}</Pill> },
          { label: 'By', render: (n) => <span className="t-muted">{n.by}</span> },
          { label: '', align: 'right', render: (n) => (canEdit ? <button type="button" className="icon-btn" aria-label="Remove note" onClick={() => void confirm({ title: 'Remove this note?', destructive: true, confirmLabel: 'Remove' }).then((ok) => { if (ok) act('removeChangeNote', n.id) })}>×</button> : '') },
        ]} />
    </Card>
  )
}

function Costing() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const canEdit = !accessGuard.readonly
  const lastNote = (name: string) => [...(db.changeNotes || [])].filter((n) => n.area === 'costing' && n.subject.startsWith(name + ':')).pop()
  const rows = db.products.filter((p) => !p.archived && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <Card icon="layers" title="Cost per unit" sub="What each item costs us, its price and margin, and the last reason the cost changed. Tap a row to update a cost with a note."
      action={<SearchBox value={q} onChange={setQ} placeholder="Search" label="Search items" />}>
      <DataTable rows={rows} rowKey={(p) => p.id} pageSize={25} onRow={canEdit ? (p) => sheets.open(UpdateCostSheet, { productId: p.id }) : undefined}
        columns={[
          { label: 'Item', primary: true, render: (p) => <span className="two-line"><b>{p.name}</b><small className="t-muted">{p.kind === 'finished' ? 'Product' : 'Material'} · {p.unit}</small></span> },
          { label: 'Cost', align: 'right', render: (p) => <b className="nowrap">{tk(p.cost)}</b> },
          { label: 'Price', align: 'right', render: (p) => (p.price ? tk(p.price) : '') },
          { label: 'Margin', align: 'right', render: (p) => (p.price > 0 ? <span className={p.price < p.cost ? 't-warn' : 't-good'}>{Math.round(((p.price - p.cost) / p.price) * 1000) / 10}%</span> : '') },
          { label: 'Stock value', align: 'right', render: (p) => <span className="nowrap">{tk(p.stock * p.cost)}</span> },
          { label: 'Last cost change', render: (p) => { const n = lastNote(p.name); return n ? <span className="two-line"><span>{n.from} → {n.to}</span><small className="t-muted">{fdate(n.date)} · {n.note}</small></span> : <span className="t-muted">—</span> } },
        ]} />
    </Card>
  )
}
