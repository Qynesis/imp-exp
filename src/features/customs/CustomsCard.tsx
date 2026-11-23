import { customsCalc, DUTY_COST_TYPE, fdate, tk, todayISO, type Shipment } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Card, Pill, useConfirm, useSheets, useToast } from '@/ui'
import { CustomsDetailsSheet } from './CustomsDetailsSheet'
import { CustomsStageSheet } from './CustomsStageSheet'

/** Stages, documents, references and the duty estimate for one shipment. */
export function CustomsCard({ shipment: s }: { shipment: Shipment }) {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const c = customsCalc(db, s)
  const cu = c.cu
  const exp = s.direction === 'export'
  const details = ([
    ['HS code', cu.hsCode], ['Port', cu.port], ['C&F agent', cu.cnf], ['Container or AWB', cu.container],
    [exp ? 'Bill of Export' : 'Bill of Entry', cu.boeNo && `${cu.boeNo}${cu.boeDate ? ` · ${fdate(cu.boeDate)}` : ''}`],
  ] as const).filter(([, v]) => v)

  const postDuty = async () => {
    if (exp) {
      act('addImportCost', { importId: s.id, type: DUTY_COST_TYPE, amount: c.dutyTotal, method: 'Bank transfer', date: todayISO() })
      act('markCustomsStage', { importId: s.id, key: 'duty', date: todayISO() })
      return toast(`${tk(c.dutyTotal)} added to export costs`)
    }
    const posted = s.costs.some((x) => x.group === 'duty' || x.type === DUTY_COST_TYPE)
    if (posted && !(await confirm({ title: 'Duty is already in the costs', message: 'Replace it with the duty worked out now?', confirmLabel: 'Replace' }))) return
    const why = act('postDuties', { importId: s.id, date: todayISO(), method: 'Bank transfer', replace: posted })
    if (!why) toast(`${tk(c.dutyTotal)} duty paid: ${tk(c.costDuty)} added to landed cost, ${tk(c.recoverable)} VAT/AT/AIT to claim back`)
  }

  return (
    <Card title={`Customs clearance · ${s.id}`} sub={c.released ? 'Released by customs' : `${c.doneCount} of ${c.stages.length} stages done`}
      action={<Button icon="edit" variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(CustomsDetailsSheet, { importId: s.id })}>Edit details</Button>}>
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
                <span className="name">{label}{cu.stageNotes?.[k]?.note && <small className="t-muted step-note">“{cu.stageNotes[k]?.note}”{cu.stageNotes[k]?.by ? ` — ${cu.stageNotes[k]?.by}` : ''}</small>}</span>
                <span className="meta t-muted">{fdate(c.dates[k])}</span>
                {c.dates[k] ? <Pill tone="good">Done</Pill>
                  : c.next?.[0] === k ? <Button variant="secondary" size="sm" className="edit-only" onClick={() => sheets.open(CustomsStageSheet, { importId: s.id, stage: k })}>Mark done…</Button>
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
                <input type="checkbox" checked={d.ok} onChange={() => act('toggleCustomsDoc', { importId: s.id, name: d.name })} />
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
                <Button size="sm" onClick={() => void postDuty()}>Record duty paid</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
