import { useMemo, useState } from 'react'
import { byId, fdate, fmt, fshort, shipmentCalc, stepLabel, tk, tradeCalc, type Shipment, type StepKey } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { useAccess } from '@/app/useAccess'
import { useSee } from '@/app/useSee'
import { CustomView } from '@/components/CustomFields'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { CustomsCard } from '@/features/customs/CustomsCard'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Card, DataTable, Pill, useSheets } from '@/ui'
import { AddCostSheet } from './sheets/AddCostSheet'
import { NewShipmentSheet } from './sheets/NewShipmentSheet'
import { StepDoneSheet } from './sheets/StepDoneSheet'
import { ShipmentFilters } from './ShipmentFilters'
import { matchShipment, SHIP_FILTER } from './shipmentFilter'
import { useFilters } from '@/components/filters/filterState'

/** #/imports and #/imports/<shipment id>: shipments on LC or contract, their landed cost, steps and customs. */
export default function ShipmentsPage({ params: [id] }: FeatureRouteProps) {
  const see = useSee()
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const f = useFilters(SHIP_FILTER)
  const rows = useMemo(() => db.imports.filter((s) => matchShipment(db, s, f.v, q)).map((s) => ({ ...s, c: shipmentCalc(db, s) })), [db, q, f.v])
  const shown = byId(db.imports, id) || db.imports.find((s) => s.direction !== 'export') || db.imports[0]
  return (
    <>
      <PageHead title="Shipments (LC)" sub="Imports and exports through LC or contract, with every cost added up to the true landed cost or export margin."
        actions={!accessGuard.readonly && <Button icon="plus" onClick={() => sheets.open(NewShipmentSheet, {})}>New shipment</Button>} />
      <Card title="All shipments" sub={`${fmt(rows.length)} of ${fmt(db.imports.length)} shown`}>
        <ShipmentFilters db={db} f={f} q={q} setQ={setQ} />
        <DataTable rows={rows} rowKey={(r) => r.id} exportName="shipments-lc" onRow={(r) => go('imports/' + r.id)} rowClass={(r) => r.id === shown?.id && 'selected'}
          empty={db.imports.length ? 'No shipment matches.' : 'No shipments yet.'}
          columns={[
            { label: 'Shipment', primary: true, render: (r) => <span className="two-line"><b>{r.id}</b><small>{r.direction === 'export' ? 'Export' : 'Import'} · {r.c.productName}</small></span> },
            { label: 'Party', render: (r) => [r.supplier, r.country].filter(Boolean).join(', ') },
            { label: 'LC or contract', render: (r) => <span className="two-line"><span>{r.lcNo || '—'}</span><small className="t-muted">{r.bank}</small></span> },
            { label: 'Invoice value', align: 'right', render: (r) => (see.cost ? `${r.trade?.currency || 'USD'} ${fmt(r.usd)}` : <Hidden />), exportValue: (r) => r.usd },
            { label: 'Status', render: (r) => <Pill tone={r.c.tone}>{r.c.status}</Pill>, exportValue: (r) => r.c.status },
            { label: 'Landed cost or margin', align: 'right', render: (r) => (see.cost ? <b>{r.c.exp ? `Margin ${tk(r.c.margin)}` : tk(r.c.landed)}</b> : <Hidden />), exportValue: (r) => (r.c.exp ? r.c.margin : r.c.landed) },
          ]} />
      </Card>
      {shown && <ShipmentDetail key={shown.id} shipment={shown} />}
    </>
  )
}

function ShipmentDetail({ shipment: s }: { shipment: Shipment }) {
  const see = useSee()
  const { db } = useBooks()
  const { level } = useAccess()
  const sheets = useSheets()
  const c = shipmentCalc(db, s)
  const tc = tradeCalc(db, s)
  const lc = tc.t.lc

  const mark = (key: StepKey) => sheets.open(StepDoneSheet, { importId: s.id, step: key })

  return (
    <div className="stack">
      <div className="grid2">
        {see.cost ? (
          <Card title={`${c.exp ? 'Export costs and margin' : 'Landed cost'} · ${s.id}`}
            action={<div className="btn-row tight-row">
              {!c.exp && !s.steps.warehouse?.date && <Button icon="truck" variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(TripSheet, { purpose: 'pickup', shipmentId: s.id })}>Pickup from port</Button>}
              <Button icon="plus" variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(AddCostSheet, { importId: s.id })}>Add cost</Button>
            </div>}>
            <div className="kv-list">
              <div className="kv"><span>{c.exp ? 'Export value' : 'Invoice value'} · {tc.t.currency} {fmt(s.usd)} at {tk(s.rate)}</span><span>{tk(c.invoiceTk)}</span></div>
              {c.exp && <div className="kv"><span>Cost of goods · {fmt(s.qty)} {s.unit}</span><span>{tk(c.goodsCost)}</span></div>}
              {s.costs.map((x) => (
                <div className="kv" key={x.id}><span>{x.type} <small className="t-muted">· {fshort(x.date)}{x.recoverable ? ' · claimed back, not in cost' : ''}</small></span><span className={x.recoverable ? 't-good' : undefined}>{tk(x.amount)}</span></div>
              ))}
              {c.exp ? (
                <div className={`kv total ${c.margin < 0 ? 't-warn' : ''}`}><span>{c.margin < 0 ? 'Loss on this export' : 'Margin on this export'}</span><span>{tk(Math.abs(c.margin))}</span></div>
              ) : (
                <>
                  <div className="kv total"><span>Total landed cost</span><span>{tk(c.landed)}</span></div>
                  <div className="kv"><span className="t-muted">Cost per unit ({fmt(s.qty)} {s.unit})</span><b>{tk(c.perUnit)}</b></div>
                </>
              )}
            </div>
            <CustomView entity="shipment" record={s} />
          </Card>
        ) : <Card title={`Shipment · ${s.id}`}><div className="card-body pt0"><p className="t-muted">{fmt(s.qty)} {s.unit} of {c.productName}. Values, costs and landed cost are hidden for your role.</p></div><CustomView entity="shipment" record={s} /></Card>}
        <div className="stack">
          <Card title={`LC · ${s.lcNo || 'no LC number'}`} sub={tc.payLabel}
            action={level('trade') !== 'none' && <Button size="sm" variant="secondary" icon="route" onClick={() => go('trade/' + s.id)}>Full import/export details</Button>}>
            <div className="kv-list">
              <div className="kv"><span>Bank</span><b>{lc?.issuingBank || s.bank || '—'}</b></div>
              {lc?.advisingBank && <div className="kv"><span>Advising bank</span><b>{lc.advisingBank}</b></div>}
              <div className="kv"><span>Opened</span><span>{fdate(lc?.issuedOn || s.steps.lc?.date || s.steps.contract?.date) || '—'}</span></div>
              {lc?.lastShipment && <div className="kv"><span>Last shipment date</span><span>{fdate(lc.lastShipment)}</span></div>}
              {lc?.expiry && <div className="kv"><span>Expiry</span><span className={tc.lcDaysLeft != null && tc.lcDaysLeft <= 15 && !lc.retiredOn ? 't-warn' : undefined}>{fdate(lc.expiry)}{lc.retiredOn ? ' · retired' : ''}</span></div>}
              {!c.exp && tc.lcMarginTk > 0 && <div className="kv"><span>Margin held by bank</span><span>{see.cost ? tk(tc.lcMarginTk) : <Hidden />}</span></div>}
              {tc.dueOn && <div className="kv"><span>Payment due</span><span>{fdate(tc.dueOn)}</span></div>}
            </div>
          </Card>
          <Card title={`Shipment steps · ${s.id}`}>
            <div className="rows">
              {c.keys.map((k) => {
                const st = s.steps[k] || {}
                return (
                  <div key={k} className="row step">
                    <span className="name">{stepLabel(k, s)}{st.note && <small className="t-muted step-note">“{st.note}”{st.by ? ` — ${st.by}` : ''}</small>}</span>
                    <span className="meta t-muted">{st.date ? fdate(st.date) : st.expected ? `Expected ${fshort(st.expected)}` : ''}</span>
                    {st.date ? <Pill tone="good">Done</Pill>
                      : c.next === k ? <Button variant="secondary" size="sm" className="edit-only" onClick={() => mark(k)}>Mark done…</Button>
                      : <Pill tone="warn">Pending</Pill>}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
      <CustomsCard shipment={s} />
    </div>
  )
}
