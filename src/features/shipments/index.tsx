import { useMemo } from 'react'
import { byId, fdate, fmt, fshort, shipmentCalc, stepLabel, tk, todayISO, type Shipment, type ShipmentCalc, type StepKey } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { CustomView } from '@/components/CustomFields'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { CustomsCard } from '@/features/customs/CustomsCard'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Card, DataTable, Pill, useConfirm, useSheets, useToast } from '@/ui'
import { AddCostSheet } from './sheets/AddCostSheet'
import { NewShipmentSheet } from './sheets/NewShipmentSheet'

/** #/imports and #/imports/<shipment id> */
export default function ShipmentsPage({ params: [id] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const rows = useMemo(() => db.imports.map((s) => ({ ...s, c: shipmentCalc(db, s) })), [db])
  const shown = byId(db.imports, id) || db.imports.find((s) => s.direction !== 'export') || db.imports[0]

  return (
    <>
      <PageHead title="Shipments" sub="Imports and exports through LC or contract, with every cost added up to the true landed cost or export margin."
        actions={<Button icon="plus" onClick={() => sheets.open(NewShipmentSheet)}>New shipment</Button>} />
      <Card title="All shipments">
        <DataTable
            pageSize={25}
          rows={rows}
          onRow={(r) => go('imports/' + r.id)}
          rowClass={(r) => r.id === shown?.id && 'selected'}
          empty="No shipments yet. Add your first import or export."
          columns={[
            { label: 'Shipment', primary: true, render: (r) => r.id },
            { label: 'Type', render: (r) => (r.c.exp ? 'Export' : 'Import') },
            { label: 'Product', render: (r) => `${r.c.productName}, ${fmt(r.qty)} ${r.unit}` },
            { label: 'Party', render: (r) => [r.supplier, r.country].filter(Boolean).join(', ') },
            { label: 'LC or contract', render: (r) => r.lcNo },
            { label: 'Invoice value', align: 'right', render: (r) => `USD ${fmt(r.usd)}` },
            { label: 'Status', render: (r) => <Pill tone={r.c.tone}>{r.c.status}</Pill> },
            { label: 'Landed cost or margin', align: 'right', render: (r) => <b>{r.c.exp ? `Margin ${tk(r.c.margin)}` : tk(r.c.landed)}</b> },
          ]}
        />
      </Card>
      {shown && <ShipmentDetail key={shown.id} shipment={shown} />}
    </>
  )
}

function ShipmentDetail({ shipment: s }: { shipment: Shipment }) {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const c = shipmentCalc(db, s)

  const mark = async (key: StepKey) => {
    const product = c.product
    if (c.exp && key === 'shipped' && product && s.qty > product.stock) {
      return toast(`Only ${fmt(product.stock)} ${product.unit} of ${c.productName} in the warehouse`)
    }
    const ok = await confirm({ title: `Mark “${stepLabel(key, s)}” as done?`, message: stepMessage(s, c, key), confirmLabel: 'Mark done' })
    if (!ok) return
    act('markImportStep', { importId: s.id, key, date: todayISO() })
    toast('Step marked done')
  }

  return (
    <div className="stack">
      <div className="grid2">
        <Card title={`${c.exp ? 'Export costs and margin' : 'Landed cost'} · ${s.id}`}
          action={<div className="btn-row tight-row">
            {!c.exp && !s.steps.warehouse?.date && <Button icon="truck" variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(TripSheet, { purpose: 'pickup', shipmentId: s.id })}>Pickup from port</Button>}
            <Button icon="plus" variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(AddCostSheet, { importId: s.id })}>Add cost</Button>
          </div>}>
          <div className="kv-list">
            <div className="kv"><span>{c.exp ? 'Export value' : 'Invoice value'} · USD {fmt(s.usd)} at Tk {fmt(s.rate)}</span><span>{tk(c.invoiceTk)}</span></div>
            {c.exp && <div className="kv"><span>Cost of goods · {fmt(s.qty)} {s.unit}</span><span>{tk(c.goodsCost)}</span></div>}
            {s.costs.map((x) => (
              <div className="kv" key={x.id}><span>{x.type} <small className="t-muted">· {fshort(x.date)}</small></span><span>{tk(x.amount)}</span></div>
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
        <Card title={`Shipment steps · ${s.id}`}>
          <div className="rows">
            {c.keys.map((k) => {
              const st = s.steps[k] || {}
              return (
                <div key={k} className="row step">
                  <span className="name">{stepLabel(k, s)}</span>
                  <span className="meta t-muted">{st.date ? fdate(st.date) : st.expected ? `Expected ${fshort(st.expected)}` : ''}</span>
                  {st.date ? <Pill tone="good">Done</Pill>
                    : c.next === k ? <Button variant="secondary" size="sm" className="edit-only" onClick={() => void mark(k)}>Mark done</Button>
                    : <Pill tone="warn">Pending</Pill>}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
      <CustomsCard shipment={s} />
    </div>
  )
}

/** What marking a step done will do, in words. */
function stepMessage(s: Shipment, c: ShipmentCalc, key: StepKey): string {
  if (c.product && !c.exp && key === 'warehouse') return `${fmt(s.qty)} ${s.unit} of ${c.productName} will be added to warehouse stock at the landed cost of ${tk(c.perUnit)} per unit.`
  if (c.product && c.exp && key === 'shipped') return `${fmt(s.qty)} ${s.unit} of ${c.productName} will leave warehouse stock.`
  if (key === 'paid') return `${tk(c.invoiceTk)} will be added to the cashbook as export proceeds.`
  return 'Today’s date will be recorded for this step.'
}
