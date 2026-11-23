import { useMemo, useState } from 'react'
import { byId, fdate, fmt, MODES, PAYMENT_TERMS, shipmentCalc, tk, tradeAlerts, tradeCalc, tradeTotals, type TransportMode } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Icon, Pill, SearchBox, Segmented, Stat, useSheets } from '@/ui'
import { DutyCalculator } from '@/features/shipments/DutyCalculator'
import { ShipmentPage } from '@/features/shipments/ShipmentPage'
import { NewShipmentSheet } from '@/features/shipments/sheets/NewShipmentSheet'
import { ShipmentFilters } from '@/features/shipments/ShipmentFilters'
import { matchShipment, SHIP_FILTER } from '@/features/shipments/shipmentFilter'
import { useFilters } from '@/components/filters/filterState'
import { FilterPanel, FilterSelect } from '@/components/filters/Filters'

type Tab = 'overview' | 'list' | 'lc' | 'calculator' | 'partners'
const TABS: Tab[] = ['overview', 'list', 'lc', 'calculator', 'partners']

/** #/trade[/tab] is the import and export hub; #/trade/<IMP-…|EXP-…> is one shipment with every detail. */
export default function TradePage({ params: [p] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const shipment = p && !TABS.includes(p as Tab) ? byId(db.imports, p) : undefined
  if (shipment) return <ShipmentPage key={shipment.id} shipment={shipment} />
  const tab: Tab = TABS.includes(p as Tab) ? (p as Tab) : 'overview'
  return (
    <>
      <PageHead title="Import and export" sub="Shipments by sea, air and road: terms, LC, transport, customs, duty and VAT, costs and export proceeds."
        actions={!accessGuard.readonly && <Button icon="plus" onClick={() => sheets.open(NewShipmentSheet, {})}>New shipment</Button>} />
      <Segmented<Tab> label="Import and export section" value={tab} onChange={(x) => go('trade/' + x)}
        options={[{ value: 'overview', label: 'Overview' }, { value: 'list', label: `Shipments (${db.imports.length})` }, { value: 'lc', label: 'LC register' }, { value: 'calculator', label: 'Duty calculator' }, { value: 'partners', label: 'Partners' }]} />
      {tab === 'overview' && <Overview />}
      {tab === 'list' && <List />}
      {tab === 'lc' && <LcRegister />}
      {tab === 'calculator' && <DutyCalculator />}
      {tab === 'partners' && <Partners />}
    </>
  )
}

function Overview() {
  const { db } = useBooks()
  const see = useSee()
  const tot = tradeTotals(db)
  const alerts = tradeAlerts(db)
  const m = (n: number) => (see.cost ? tk(n) : <Hidden />)
  const moving = db.imports.filter((s) => { const c = shipmentCalc(db, s); return c.next && (s.steps.lc?.date || s.steps.contract?.date) })
  return (
    <>
      <div className="stats">
        <Stat icon="ship" label="On the way" value={fmt(tot.inTransit)} sub={`${tot.atPort} at port or in customs`} href="#/trade/list" />
        <Stat icon="card" label="Open LCs" value={m(tot.openLcTk)} sub={see.cost ? `${tk(tot.marginHeldTk)} margin held by banks` : undefined} href="#/trade/lc" />
        <Stat icon="money" label="Duty and taxes paid" value={m(tot.dutyPaid)} sub={see.cost ? `${tk(tot.recoverable)} of it to claim back` : undefined} />
        <Stat icon="wallet" label="Export money to come" value={m(tot.exportOutstandingTk)} sub={see.cost && tot.incentiveDueTk ? `+ ${tk(tot.incentiveDueTk)} cash incentive to claim` : undefined} tone={tot.exportOutstandingTk > 0 ? 'warn' : undefined} />
      </div>
      <div className="grid2">
        <Card icon="alert" title="Needs attention" sub="LC expiry, last shipment dates, late vessels, usance payments, demurrage and export money past due.">
          {alerts.length ? (
            <div className="trade-alerts list">
              {alerts.map((a) => <button key={a.id} type="button" className={`trade-alert ${a.tone}`} onClick={() => go('trade/' + a.shipmentId)}><Icon name="alert" size={15} /><b>{a.shipmentId}</b> {a.text}</button>)}
            </div>
          ) : <p className="t-muted card-body">Nothing urgent. All dates are fine.</p>}
        </Card>
        <Card icon="route" title="By transport" sub="Every shipment, by how it travels.">
          <div className="mode-grid">
            {(Object.keys(MODES) as TransportMode[]).map((k) => {
              const row = tot.byMode.find((x) => x.mode === MODES[k].label)
              return (
                <div key={k} className={'mode-tile' + (row ? '' : ' empty')}>
                  <Icon name={MODES[k].icon} size={20} />
                  <b>{row?.count || 0}</b>
                  <span>{MODES[k].label}</span>
                  {row && see.cost && <small>{tk(row.value)}</small>}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
      <Card icon="ship" title="Moving now" sub="Shipments with steps still to go.">
        <ShipmentTable rows={moving} />
      </Card>
    </>
  )
}

function List() {
  const { db } = useBooks()
  const f = useFilters(SHIP_FILTER)
  const [q, setQ] = useState('')
  const rows = useMemo(() => db.imports.filter((s) => matchShipment(db, s, f.v, q)), [db, f.v, q])
  return (
    <Card icon="ship" title="All shipments" sub={`${fmt(rows.length)} of ${fmt(db.imports.length)} shown`}>
      <ShipmentFilters db={db} f={f} q={q} setQ={setQ} />
      <ShipmentTable rows={rows} />
    </Card>
  )
}

function ShipmentTable({ rows }: { rows: ReturnType<typeof useBooks>['db']['imports'] }) {
  const { db } = useBooks()
  const see = useSee()
  return (
    <DataTable rows={rows} rowKey={(s) => s.id} exportName="shipments" onRow={(s) => go('trade/' + s.id)} empty="No shipment matches."
      columns={[
        { label: 'Shipment', primary: true, render: (s) => <span className="two-line"><b>{s.id}</b><small className="t-muted">{shipmentCalc(db, s).productName}</small></span> },
        { label: 'Party', render: (s) => <span className="two-line"><span>{s.supplier || '—'}</span><small className="t-muted">{s.country}</small></span> },
        { label: 'Transport', render: (s) => { const t = tradeCalc(db, s).t; return <span className="nowrap"><Icon name={MODES[t.mode].icon} size={14} /> {t.loadPort || '?'} → {t.dischargePort || '?'}</span> }, exportValue: (s) => { const t = tradeCalc(db, s).t; return `${MODES[t.mode].label}: ${t.loadPort} → ${t.dischargePort}` } },
        { label: 'Terms', render: (s) => { const c = tradeCalc(db, s); return <span className="two-line"><span>{c.t.incoterm}</span><small className="t-muted">{PAYMENT_TERMS[c.t.payment].label}</small></span> } },
        { label: 'Value', align: 'right', render: (s) => (see.cost ? `${tradeCalc(db, s).t.currency} ${fmt(s.usd)}` : <Hidden />), exportValue: (s) => s.usd },
        { label: 'Status', render: (s) => { const c = shipmentCalc(db, s); const tc = tradeCalc(db, s); return <span className="two-line"><Pill tone={c.tone}>{c.status}</Pill>{tc.alerts[0] && <small className={tc.alerts[0].tone === 'warn' ? 't-warn' : 't-muted'}>{tc.alerts[0].text}</small>}</span> }, exportValue: (s) => shipmentCalc(db, s).status },
        { label: 'Landed cost / margin', align: 'right', render: (s) => { if (!see.cost) return <Hidden />; const c = shipmentCalc(db, s); return <b>{c.exp ? `Margin ${tk(c.margin)}` : tk(c.landed)}</b> }, exportValue: (s) => { const c = shipmentCalc(db, s); return c.exp ? c.margin : c.landed } },
      ]} />
  )
}

function LcRegister() {
  const { db } = useBooks()
  const see = useSee()
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [q, setQ] = useState('')
  const f = useFilters({ dir: '', bank: '', expiry: '' })
  const all = db.imports.map((s) => ({ s, c: tradeCalc(db, s) })).filter((r) => r.c.isLc)
  const banks = [...new Set(all.map((r) => (r.c.t.lc?.issuingBank || r.s.bank || '').trim()).filter(Boolean))].sort().map((x) => ({ value: x, label: x }))
  const n = q.trim().toLowerCase()
  const rows = all.filter((r) => (show === 'all' || !(r.c.t.lc?.retiredOn || (r.c.exp ? r.s.steps.paid?.date : r.s.steps.warehouse?.date)))
    && (!f.v.dir || (f.v.dir === 'export') === r.c.exp)
    && (!f.v.bank || (r.c.t.lc?.issuingBank || r.s.bank || '').trim() === f.v.bank)
    && (!f.v.expiry || (r.c.lcDaysLeft != null && !r.c.t.lc?.retiredOn && (f.v.expiry === 'expired' ? r.c.lcDaysLeft < 0 : r.c.lcDaysLeft >= 0 && r.c.lcDaysLeft <= Number(f.v.expiry))))
    && (!n || `${r.s.lcNo} ${r.s.id} ${r.s.supplier} ${r.c.t.lc?.issuingBank || ''} ${r.c.t.lc?.advisingBank || ''} ${r.s.bank}`.toLowerCase().includes(n)))
  return (
    <Card icon="card" title="LC register" sub="Every import and export LC: amounts, banks, margin, last shipment and expiry.">
      <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }} summary={<span><b>{fmt(rows.length)}</b> of {fmt(all.length)} LCs</span>}
        main={<>
          <SearchBox value={q} onChange={setQ} placeholder="LC no., shipment, party or bank" label="Search LCs" />
          <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
        </>}>
        <FilterSelect label="Import or export" value={f.v.dir} onChange={(x) => f.set('dir', x)} all="Both" options={[{ value: 'import', label: 'Import LCs' }, { value: 'export', label: 'Export LCs' }]} />
        <FilterSelect label="Issuing bank" value={f.v.bank} onChange={(x) => f.set('bank', x)} all="Every bank" options={banks} />
        <FilterSelect label="Expiry" value={f.v.expiry} onChange={(x) => f.set('expiry', x)} all="Any time" options={[{ value: '15', label: 'Within 15 days' }, { value: '30', label: 'Within 30 days' }, { value: 'expired', label: 'Already expired' }]} />
      </FilterPanel>
      <DataTable rows={rows} rowKey={(r) => r.s.id} exportName="lc-register" onRow={(r) => go('trade/' + r.s.id)} empty="No LCs."
        columns={[
          { label: 'LC', primary: true, render: (r) => <span className="two-line"><b>{r.s.lcNo || '—'}</b><small className="t-muted">{r.s.id} · {r.c.exp ? 'Export' : 'Import'}</small></span> },
          { label: 'Party', render: (r) => r.s.supplier },
          { label: 'Banks', render: (r) => <span className="two-line"><span>{r.c.t.lc?.issuingBank || r.s.bank || '—'}</span><small className="t-muted">{r.c.t.lc?.advisingBank}</small></span> },
          { label: 'Amount', align: 'right', render: (r) => (see.cost ? `${r.c.t.currency} ${fmt(r.c.lcAmount)}` : <Hidden />), exportValue: (r) => r.c.lcAmount },
          { label: 'Margin', align: 'right', render: (r) => (r.c.exp ? '—' : see.cost ? tk(r.c.lcMarginTk) : <Hidden />), exportValue: (r) => r.c.lcMarginTk },
          { label: 'Type', render: (r) => r.c.payLabel },
          { label: 'Last shipment', render: (r) => fdate(r.c.t.lc?.lastShipment) || '—' },
          { label: 'Expiry', render: (r) => { const d = r.c.lcDaysLeft; return r.c.t.lc?.retiredOn ? <Pill tone="good">Retired {fdate(r.c.t.lc.retiredOn)}</Pill> : r.c.t.lc?.expiry ? <span className={d != null && d <= 15 ? 't-warn strong' : undefined}>{fdate(r.c.t.lc.expiry)}{d != null ? (d < 0 ? ' · expired' : ` · ${d}d`) : ''}</span> : '—' }, exportValue: (r) => r.c.t.lc?.expiry || '' },
        ]} />
    </Card>
  )
}

/** Everyone we trade with abroad and everyone who moves and clears the goods, from the shipments. */
function Partners() {
  const { db } = useBooks()
  const [q, setQ] = useState('')
  const map = new Map<string, { name: string; role: string; shipments: string[]; country: string }>()
  const add = (name: string | undefined, role: string, id: string, country = '') => {
    const n = (name || '').trim()
    if (!n) return
    const k = role + '|' + n.toLowerCase()
    const r = map.get(k) || { name: n, role, shipments: [], country }
    if (!r.shipments.includes(id)) r.shipments.push(id)
    map.set(k, r)
  }
  for (const s of db.imports) {
    const t = s.trade
    add(s.supplier, s.direction === 'export' ? 'Buyer abroad' : 'Supplier abroad', s.id, s.country)
    add(t?.carrier, t ? MODES[t.mode].carrier : 'Carrier', s.id)
    add(t?.forwarder, 'Freight forwarder', s.id)
    add(t?.cnfAgent || s.customs?.cnf, 'C&F agent', s.id)
    add(t?.lc?.issuingBank, 'Issuing bank', s.id)
    add(t?.lc?.advisingBank, 'Advising bank', s.id)
  }
  const n = q.trim().toLowerCase()
  const rows = [...map.values()].filter((r) => !n || `${r.name} ${r.role} ${r.country}`.toLowerCase().includes(n)).sort((a, b) => a.role.localeCompare(b.role) || b.shipments.length - a.shipments.length)
  return (
    <Card icon="users" title="Trade partners" sub="Suppliers and buyers abroad, shipping lines, airlines, transporters, forwarders, C&F agents and banks — from your shipments."
      action={<SearchBox value={q} onChange={setQ} placeholder="Name, role or country" label="Search partners" />}>
      <DataTable rows={rows} rowKey={(r) => r.role + r.name} exportName="trade-partners" empty="No partners yet."
        columns={[
          { label: 'Name', primary: true, render: (r) => <b>{r.name}</b> },
          { label: 'Role', render: (r) => <Pill tone="neutral">{r.role}</Pill>, exportValue: (r) => r.role },
          { label: 'Country', render: (r) => r.country || '—' },
          { label: 'Shipments', align: 'right', render: (r) => r.shipments.length },
          { label: 'Latest', render: (r) => <button type="button" className="link" onClick={() => go('trade/' + r.shipments[r.shipments.length - 1])}>{r.shipments[r.shipments.length - 1]}</button>, exportValue: (r) => r.shipments.join(' ') },
        ]} />
    </Card>
  )
}
