import { CustomView } from '../custom.jsx'
import { fdate, fmt, fshort, tk, todayISO } from '../lib/format.js'
import { byId, customsCalc, importCalc, stepLabel } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Pill, go, useConfirm, useSheets, useToast } from '../ui.jsx'
import { PageHead } from './common.jsx'

export function CustomsCard({ imp }) {
  const { db, act } = useStore()
  const sheets = useSheets()
  const toast = useToast()
  const c = customsCalc(db, imp)
  const cu = c.cu
  const exp = imp.direction === 'export'
  const details = [
    ['HS code', cu.hsCode], ['Port', cu.port], ['C&F agent', cu.cnf], ['Container or AWB', cu.container],
    [exp ? 'Bill of Export' : 'Bill of Entry', cu.boeNo && `${cu.boeNo}${cu.boeDate ? ` · ${fdate(cu.boeDate)}` : ''}`],
  ].filter(([, v]) => v)
  const postDuty = () => {
    act('addImportCost', { importId: imp.id, type: 'Customs duty and VAT', amount: c.dutyTotal, method: 'Bank transfer', date: todayISO() })
    act('markCustomsStage', { importId: imp.id, key: 'duty', date: todayISO() })
    toast(`${tk(c.dutyTotal)} duty paid and added to ${exp ? 'export costs' : 'landed cost'}`)
  }
  return (
    <Card title={`Customs clearance · ${imp.id}`} sub={c.released ? 'Released by customs' : `${c.doneCount} of ${c.stages.length} stages done`}
      action={<Button variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open('customs', { importId: imp.id })}>Edit details</Button>}>
      {c.overDays > 0 && (
        <div className="alert-strip">
          Free time ended {c.overDays} day{c.overDays === 1 ? '' : 's'} ago.{c.demurrage > 0 && <> Demurrage so far about <b>{tk(c.demurrage)}</b>.</>}
        </div>
      )}
      <div className="customs-grid">
        <div>
          <h3 className="sub-h">Stages</h3>
          <div className="rows">
            {c.stages.map(([k, label]) => (
              <div key={k} className="row step">
                <span className="name">{label}</span>
                <span className="meta t-muted">{c.dates[k] ? fdate(c.dates[k]) : ''}</span>
                {c.dates[k] ? <Pill tone="good">Done</Pill>
                  : c.next?.[0] === k ? <Button variant="secondary" size="sm" className="edit-only" onClick={() => act('markCustomsStage', { importId: imp.id, key: k, date: todayISO() })}>Mark done</Button>
                  : <Pill tone="neutral">Waiting</Pill>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="sub-h">Documents · {c.docsOk} of {c.docs.length} ready</h3>
          <div className="doc-list">
            {c.docs.map((d) => (
              <label key={d.name} className="check">
                <input type="checkbox" checked={d.ok} onChange={() => act('toggleCustomsDoc', { importId: imp.id, name: d.name })} />
                <span>{d.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="kv-list">
        {details.map(([l, v]) => <div className="kv" key={l}><span className="t-muted">{l}</span><span>{v}</span></div>)}
        {!details.length && <div className="kv"><span className="t-muted">No HS code, Bill of {exp ? 'Export' : 'Entry'} or agent recorded yet.</span></div>}
        {c.duties.length > 0 && (
          <>
            <div className="kv"><span>Assessable value</span><span>{tk(c.av)}</span></div>
            {c.duties.map((d) => <div className="kv" key={d.key}><span>{d.label} · {d.rate}%</span><span>{tk(d.amount)}</span></div>)}
            <div className="kv total"><span>Estimated duty and taxes</span><span>{tk(c.dutyTotal)}</span></div>
            {!c.dates.duty && (
              <div className="kv edit-only">
                <span className="t-muted">When paid, this adds the amount to the shipment costs and the cashbook.</span>
                <Button size="sm" onClick={postDuty}>Record duty paid</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

export default function Imports({ id }) {
  const { db, act } = useStore()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const rows = db.imports.map((i) => ({ ...i, c: importCalc(db, i) }))
  const imp = byId(db.imports, id) || db.imports.find((i) => i.direction !== 'export') || db.imports[0]
  const c = imp && importCalc(db, imp)

  const mark = async (key) => {
    const linked = !!c.product
    if (c.exp && key === 'shipped' && linked && imp.qty > c.product.stock) {
      return toast(`Only ${fmt(c.product.stock)} ${c.product.unit} of ${c.productName} in the warehouse`)
    }
    const stockMsg = !linked ? null
      : !c.exp && key === 'warehouse' ? `${fmt(imp.qty)} ${imp.unit} of ${c.productName} will be added to warehouse stock at the landed cost of ${tk(c.perUnit)} per unit.`
      : c.exp && key === 'shipped' ? `${fmt(imp.qty)} ${imp.unit} of ${c.productName} will leave warehouse stock.`
      : null
    const ok = await confirm({
      title: `Mark “${stepLabel(key, imp)}” as done?`,
      message: stockMsg || (key === 'paid' ? `${tk(c.invoiceTk)} will be added to the cashbook as export proceeds.` : 'Today’s date will be recorded for this step.'),
      confirmLabel: 'Mark done',
    })
    if (!ok) return
    act('markImportStep', { importId: imp.id, key, date: todayISO() })
    toast('Step marked done')
  }

  return (
    <>
      <PageHead title="Shipments" sub="Imports and exports through LC or contract, with every cost added up to the true landed cost or export margin."
        actions={<Button onClick={() => sheets.open('newImport')}>New shipment</Button>} />
      <Card title="All shipments">
        <DataTable
          rows={rows}
          onRow={(r) => go('imports/' + r.id)}
          rowClass={(r) => r.id === imp?.id && 'selected'}
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

      {imp && (
        <div className="stack" key={imp.id}>
          <div className="grid2">
            <Card title={`${c.exp ? 'Export costs and margin' : 'Landed cost'} · ${imp.id}`} action={<Button variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open('addCost', { importId: imp.id })}>Add cost</Button>}>
              <div className="kv-list">
                <div className="kv"><span>{c.exp ? 'Export value' : 'Invoice value'} · USD {fmt(imp.usd)} at Tk {fmt(imp.rate)}</span><span>{tk(c.invoiceTk)}</span></div>
                {c.exp && <div className="kv"><span>Cost of goods · {fmt(imp.qty)} {imp.unit}</span><span>{tk(c.goodsCost)}</span></div>}
                {imp.costs.map((x) => (
                  <div className="kv" key={x.id}><span>{x.type} <small className="t-muted">· {fshort(x.date)}</small></span><span>{tk(x.amount)}</span></div>
                ))}
                {c.exp ? (
                  <div className={`kv total ${c.margin < 0 ? 't-warn' : ''}`}><span>{c.margin < 0 ? 'Loss on this export' : 'Margin on this export'}</span><span>{tk(Math.abs(c.margin))}</span></div>
                ) : (
                  <>
                    <div className="kv total"><span>Total landed cost</span><span>{tk(c.landed)}</span></div>
                    <div className="kv"><span className="t-muted">Cost per unit ({fmt(imp.qty)} {imp.unit})</span><b>{tk(c.perUnit)}</b></div>
                  </>
                )}
              </div>
              <CustomView entity="shipment" record={imp} />
            </Card>
            <Card title={`Shipment steps · ${imp.id}`}>
              <div className="rows">
                {c.keys.map((k) => {
                  const st = imp.steps[k] || {}
                  return (
                    <div key={k} className="row step">
                      <span className="name">{stepLabel(k, imp)}</span>
                      <span className="meta t-muted">{st.date ? fdate(st.date) : st.expected ? `Expected ${fshort(st.expected)}` : ''}</span>
                      {st.date ? <Pill tone="good">Done</Pill>
                        : c.next === k ? <Button variant="secondary" size="sm" className="edit-only" onClick={() => mark(k)}>Mark done</Button>
                        : <Pill tone="warn">Pending</Pill>}
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
          <CustomsCard imp={imp} />
        </div>
      )}
    </>
  )
}
