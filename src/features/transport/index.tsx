import { useState } from 'react'
import {
  activeVehicles, addMonths, busyWith, byId, driverOf, serviceDue, servicesDue, change, fmonth, fmt, fshort, monthRange, paperAlerts, PAPERS, todayISO, tk, tkShort, transportBetween, transporters,
  transportExpenses, transportMonths, TRIP_STATUS, tripCalc, trips, tripVehicleLabel, VEHICLE_TYPES, vehicleStats, vehicles, type TripStatus,
} from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { downloadCsv } from '@/components/downloadCsv'
import { PageHead } from '@/components/PageHead'
import { PhoneLink } from '@/components/PhoneLink'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Empty, Icon, IconBadge, Pill, Segmented, Stat, useSheets, SearchBox } from '@/ui'
import { PayTransporterSheet } from './sheets/PayTransporterSheet'
import { TransportCostSheet } from './sheets/TransportCostSheet'
import { TripDetailSheet } from './sheets/TripDetailSheet'
import { TripSheet } from './sheets/TripSheet'
import { VehicleDetailSheet } from './sheets/VehicleDetailSheet'
import { VehicleSheet } from './sheets/VehicleSheet'
import { STATUS_TONE } from './tripTone'

type Tab = 'trips' | 'vehicles' | 'transporters' | 'costs'
const TABS: Tab[] = ['trips', 'vehicles', 'transporters', 'costs']
type TripFilter = 'open' | 'all' | 'fleet' | 'hired'

export default function TransportPage({ params: [tabParam] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'trips'
  const setTab = (t: Tab) => go(t === 'trips' ? 'transport' : 'transport/' + t)
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [from, to] = monthRange(month)
  const now = transportBetween(db, from, to)
  const [pf, pt] = monthRange(addMonths(month, -1))
  const before = transportBetween(db, pf, pt)
  const owed = transporters(db).reduce((s, t) => s + t.due, 0)
  const alerts = paperAlerts(db)
  const services = servicesDue(db)
  const onRoad = trips(db).filter((t) => t.status === 'on-the-way').length
  const isThisMonth = month === todayISO().slice(0, 7)
  const delta = change(now.total, before.total)

  return (
    <>
      <PageHead title="Transport" sub="Our own and rented vehicles, trucks hired per trip, and every transport cost." actions={
        <>
          <Button variant="secondary" icon="plus" onClick={() => sheets.open(VehicleSheet, {})}>Add vehicle</Button>
          <Button variant="secondary" icon="wallet" onClick={() => sheets.open(TransportCostSheet, {})}>Add cost</Button>
          <Button icon="route" onClick={() => sheets.open(TripSheet, {})}>Book a trip</Button>
        </>
      } />

      {services.length > 0 && (
        <div className="alert-strip info" role="status">
          <IconBadge name="settings" tone="info" />
          <div>
            <b>Servicing due</b>
            <span>{services.map((s) => `${s.vehicle.name}: ${!s.lastDate ? 'no service recorded' : s.state === 'late' ? 'late' : 'due soon'}`).join(' · ')}</span>
          </div>
          <button type="button" className="link" onClick={() => sheets.open(VehicleDetailSheet, { vehicleId: services[0].vehicle.id })}>Open</button>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="alert-strip" role="alert">
          <IconBadge name="alert" tone="warn" />
          <div>
            <b>{alerts.filter((a) => a.state === 'expired').length ? `${alerts.filter((a) => a.state === 'expired').length} paper${alerts.filter((a) => a.state === 'expired').length === 1 ? '' : 's'} expired` : 'Papers to renew soon'}</b>
            <span>{alerts.slice(0, 3).map((a) => `${a.vehicle.name}: ${PAPERS[a.paper]} ${a.state === 'expired' ? `expired ${fshort(a.date)}` : `runs out ${fshort(a.date)}`}`).join(' · ')}{alerts.length > 3 ? ` · and ${alerts.length - 3} more` : ''}</span>
          </div>
          <button type="button" className="link" onClick={() => setTab('vehicles')}>See vehicles</button>
        </div>
      )}

      <div className="analytics-bar">
        <div className="month-nav">
          <button type="button" className="icon-btn bordered" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="back" size={18} /></button>
          <b className="period-label">{fmonth(month)}</b>
          <button type="button" className="icon-btn bordered" aria-label="Next month" disabled={isThisMonth} onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevron" size={18} /></button>
          {!isThisMonth && <button type="button" className="link" onClick={() => setMonth(todayISO().slice(0, 7))}>Back to this month</button>}
        </div>
      </div>

      <div className="stats">
        <Stat icon="truck" label="Transport cost" value={tk(now.total)}
          sub={delta === null ? `${fmt(now.trips)} trips` : <span><b className={delta > 0 ? 't-warn' : 't-good'}>{delta > 0 ? '↑' : '↓'} {Math.round(Math.abs(delta) * 100)}%</b> vs last month ({tkShort(before.total)})</span>} />
        <Stat icon="layers" label="Own fleet / hired" value={`${tkShort(now.own)} / ${tkShort(now.hired)}`} sub={now.ofSales != null ? `${(now.ofSales * 100).toFixed(1)}% of sales this month` : 'No sales to compare'} />
        <Stat icon="route" label="Trips" value={fmt(now.trips)} sub={onRoad ? `${onRoad} on the way now` : 'None on the road now'} />
        <Stat icon="wallet" label="Owed to transporters" value={tk(owed)} tone={owed > 0 ? 'warn' : undefined} sub={owed > 0 ? `${transporters(db).filter((t) => t.due > 0).length} transporters to pay` : 'All hire paid'} />
      </div>

      <div className="grid2">
        <Card icon="chart" title="Transport cost by month" sub="Fuel, hire, rent, repairs and every other transport cost.">
          <ColumnChart
            data={transportMonths(db, todayISO().slice(0, 7)).map((m) => ({
              key: m.key, short: m.short, long: m.long, value: m.total,
              extra: [['own fleet', tkShort(m.own)], ['hired and rented', tkShort(m.hired)], ['trips', fmt(m.trips)], ...(m.ofSales != null ? [['of sales', `${(m.ofSales * 100).toFixed(1)}%`] as [string, string]] : [])],
            }))}
            valueName="Transport cost" format={tk} height={230} pickHint="Click to open this month"
            onPick={(d) => setMonth(d.key)}
          />
        </Card>
        <Card icon="wallet" title={`Where the money went · ${fmonth(month)}`}>
          <BarList share="of the total" format={tk} empty="No transport costs this month." rows={now.byKind.map((k) => ({ id: k.kind, name: k.kind, value: k.amount }))} />
        </Card>
      </div>

      <Segmented<Tab> label="Transport section" value={tab} onChange={setTab} options={[
        { value: 'trips', label: 'Trips' },
        { value: 'vehicles', label: `Vehicles (${activeVehicles(db).length})` },
        { value: 'transporters', label: 'Hired transporters' },
        { value: 'costs', label: 'Costs' },
      ]} />

      {tab === 'trips' && <TripsTab month={month} />}
      {tab === 'vehicles' && <VehiclesTab month={month} />}
      {tab === 'transporters' && <TransportersTab />}
      {tab === 'costs' && <CostsTab month={month} />}
    </>
  )
}

function TripsTab({ month }: { month: string }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [filter, setFilter] = useState<TripFilter>('all')
  const [q, setQ] = useState('')
  const [from, to] = monthRange(month)
  const n = q.trim().toLowerCase()
  const rows = trips(db).filter((t) => (!n || JSON.stringify([t.id, t.from, t.to, t.load, t.hire?.transporter]).toLowerCase().includes(n)) &&
    (filter === 'open' ? t.status === 'planned' || t.status === 'on-the-way' : t.date >= from && t.date <= to) &&
    (filter !== 'fleet' || !t.hire) && (filter !== 'hired' || !!t.hire))
  const open = trips(db).filter((t) => t.status === 'planned' || t.status === 'on-the-way').length
  return (
    <Card icon="route" title="Trips" sub={filter === 'open' ? 'Planned and on the way, any date' : fmonth(month)}
      action={<div className="tools-right"><Segmented<TripFilter> label="Show trips" value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' }, { value: 'open', label: `Open (${open})` }, { value: 'fleet', label: 'Our vehicles' }, { value: 'hired', label: 'Hired' },
      ]} /><SearchBox value={q} onChange={setQ} placeholder="Trip, place, load or transporter" label="Search trips" /></div>}>
      <DataTable pageSize={25} rows={rows} rowKey={(t) => t.id} onRow={(t) => sheets.open(TripDetailSheet, { tripId: t.id })}
        empty={trips(db).length ? 'No trips here.' : 'No trips yet. Book the first one.'}
        columns={[
          { label: 'Trip', primary: true, render: (t) => <span className="two-line"><b>{t.from} → {t.to}</b><small>{t.id} · {fshort(t.date)}</small></span> },
          { label: 'Vehicle and driver', render: (t) => {
            const dr = driverOf(db, t)
            return (
              <span className="two-line">
                <span>{tripVehicleLabel(db, t)}</span>
                <small className="t-muted">{t.hire ? 'Hired' : byId(db.vehicles || [], t.vehicleId)?.ownership === 'rented' ? 'Rented' : 'Own'}{dr.name ? ` · ${dr.name}` : ''}</small>
                {(dr.phone || dr.vehiclePhone) && <small><PhoneLink phone={dr.phone || dr.vehiclePhone} label={dr.name || 'driver'} /></small>}
              </span>
            )
          } },
          { label: 'Load', render: (t) => <span className="t-muted">{t.load}</span> },
          { label: 'Cost', align: 'right', render: (t) => {
            const c = tripCalc(db, t)
            return <span className="two-line right"><b>{tk(c.cost)}</b>{c.hireDue > 0 && <small className="t-warn">{tk(c.hireDue)} hire due</small>}</span>
          } },
          { label: 'Status', align: 'right', render: (t) => <Pill tone={STATUS_TONE[t.status as TripStatus]}>{TRIP_STATUS[t.status]}</Pill> },
        ]} />
    </Card>
  )
}

function VehiclesTab({ month }: { month: string }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [showArchived, setShowArchived] = useState(false)
  const [from, to] = monthRange(month)
  const list = vehicles(db).filter((v) => !!v.archived === showArchived)
  const archivedCount = vehicles(db).filter((v) => v.archived).length
  return (
    <Card icon="truck" title={showArchived ? 'Archived vehicles' : 'Fleet'} sub={`Costs and trips for ${fmonth(month)}`}
      action={archivedCount ? <button type="button" className="link" onClick={() => setShowArchived((x) => !x)}>{showArchived ? 'Show fleet' : `Archived (${archivedCount})`}</button> : undefined}>
      {!list.length ? (
        <Empty>{showArchived ? 'No archived vehicles.' : 'No vehicles yet. Add your own trucks and vans, and any you rent by the month.'}</Empty>
      ) : (
        <DataTable pageSize={20} rows={list} rowKey={(v) => v.id} onRow={(v) => sheets.open(VehicleDetailSheet, { vehicleId: v.id })}
          columns={[
            { label: 'Vehicle', primary: true, render: (v) => <span className="two-line"><b>{v.name}</b><small>{[v.regNo, VEHICLE_TYPES[v.type], v.capacity].filter(Boolean).join(' · ')}</small></span> },
            { label: 'Ownership', render: (v) => (v.ownership === 'rented' ? <span className="two-line"><Pill tone="info">Rented</Pill><small className="t-muted">{v.owner}{v.monthlyRent ? ` · ${tkShort(v.monthlyRent)}/month` : ''}</small></span> : <Pill tone="good">Own</Pill>) },
            { label: 'Driver and phone', render: (v) => {
              const dr = driverOf(db, { vehicleId: v.id })
              return (
                <span className="two-line">
                  <span>{dr.name || <span className="t-muted">No driver</span>}</span>
                  <small><PhoneLink phone={dr.phone} label={dr.name} /></small>
                  {dr.vehiclePhone && <small className="t-muted">Vehicle <PhoneLink phone={dr.vehiclePhone} label={v.name} /></small>}
                </span>
              )
            } },
            { label: 'Today', render: (v) => {
              const busy = busyWith(db, v.id)
              return busy ? <Pill tone="warn">{busy.status === 'on-the-way' ? 'On the road' : 'Booked'} · {busy.id}</Pill> : <Pill tone="good">Free</Pill>
            } },
            { label: 'Trips', align: 'right', render: (v) => fmt(vehicleStats(db, v.id, from, to).trips) },
            { label: 'Cost', align: 'right', render: (v) => <b>{tk(vehicleStats(db, v.id, from, to).cost)}</b> },
            { label: 'Papers and service', align: 'right', render: (v) => {
              const bad = paperAlerts(db).filter((a) => a.vehicle.id === v.id)
              const expired = bad.filter((a) => a.state === 'expired').length
              const svc = serviceDue(db, v)
              return (
                <span className="two-line right">
                  {bad.length ? <Pill tone="warn">{expired ? `${expired} expired` : `${bad.length} due soon`}</Pill> : <Pill tone="good">Papers in order</Pill>}
                  {svc && svc.state !== 'ok' && <small className="t-warn">Service {svc.state === 'late' ? 'late' : 'due soon'}</small>}
                </span>
              )
            } },
          ]} />
      )}
    </Card>
  )
}

function TransportersTab() {
  const { db } = useBooks()
  const sheets = useSheets()
  const list = transporters(db)
  return (
    <Card icon="users" title="Hired transporters" sub="Agencies and truck owners we hire per trip, and what we still owe them.">
      <DataTable pageSize={20} rows={list} rowKey={(r) => r.name} empty="No hired trips yet. Book a trip with a hired vehicle and the transporter appears here."
        columns={[
          { label: 'Transporter', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small>Last trip {fshort(r.lastDate)}</small></span> },
          { label: 'Trips', align: 'right', render: (r) => fmt(r.trips) },
          { label: 'Hire agreed', align: 'right', render: (r) => tk(r.fare) },
          { label: 'Paid', align: 'right', render: (r) => tk(r.paid) },
          { label: 'Due', align: 'right', render: (r) => (r.due > 0 ? <b className="t-warn">{tk(r.due)}</b> : <span className="t-good">Paid up</span>) },
          { label: '', align: 'right', render: (r) => (r.due > 0 ? <Button size="sm" variant="secondary" icon="wallet" className="edit-only" onClick={(e) => { e.stopPropagation(); sheets.open(PayTransporterSheet, { transporter: r.name }) }}>Pay</Button> : null) },
        ]} />
    </Card>
  )
}

function CostsTab({ month }: { month: string }) {
  const { db } = useBooks()
  const sheets = useSheets()
  const [from, to] = monthRange(month)
  const rows = transportExpenses(db).filter((e) => e.date >= from && e.date <= to).slice().reverse()
  const download = () => downloadCsv(`transport-costs-${month}.csv`, ['Date', 'Cost', 'Vehicle', 'Trip', 'Transporter', 'Details', 'Paid by', 'Amount'],
    rows.map((e) => [e.date, e.transport?.kind || 'Other transport', byId(db.vehicles || [], e.transport?.vehicleId)?.name || '', e.transport?.tripId || '', e.transport?.transporter || '', e.details, e.method, e.amount]))
  return (
    <Card icon="wallet" title="Transport costs" sub={`${fmonth(month)} · also in the cashbook under Transport`}
      action={<div className="btn-row tight-row">
        <Button size="sm" variant="secondary" icon="download" onClick={download}>Download</Button>
        <Button size="sm" icon="plus" className="edit-only" onClick={() => sheets.open(TransportCostSheet, {})}>Add cost</Button>
      </div>}>
      <DataTable pageSize={25} rows={rows} rowKey={(e) => e.id} empty="No transport costs this month."
        onRow={(e) => (e.transport?.tripId ? sheets.open(TripDetailSheet, { tripId: e.transport.tripId }) : e.transport?.vehicleId ? sheets.open(VehicleDetailSheet, { vehicleId: e.transport.vehicleId }) : undefined)}
        columns={[
          { label: 'Cost', primary: true, render: (e) => <span className="two-line"><b>{e.transport?.kind || 'Other transport'}</b><small>{fshort(e.date)} · {e.method}</small></span> },
          { label: 'For', render: (e) => <span className="t-muted">{[byId(db.vehicles || [], e.transport?.vehicleId)?.name, e.transport?.transporter, e.transport?.tripId].filter(Boolean).join(' · ') || 'General'}</span> },
          { label: 'Details', render: (e) => <span className="t-muted">{e.details}</span> },
          { label: 'Amount', align: 'right', render: (e) => <b>{tk(e.amount)}</b> },
        ]} />
    </Card>
  )
}
