import { useState } from 'react'
import {
  COST_GROUPS, fdate, fmt, fshort, groupOf, INCOTERMS, MODES, PAYMENT_TERMS, shipmentCalc, stepLabel, todayISO, tk, tradeCalc,
  type Shipment, type StepKey,
} from '@shared/domain'
import { useSee } from '@/app/useSee'
import { CustomView } from '@/components/CustomFields'
import { Hidden } from '@/components/Hidden'
import { PageHead } from '@/components/PageHead'
import { accessGuard, useBooks } from '@/core/store/context'
import { CustomsCard } from '@/features/customs/CustomsCard'
import { TripSheet } from '@/features/transport/sheets/TripSheet'
import { Button, Card, DataTable, Icon, Pill, Progress, Segmented, useConfirm, useSheets, useToast } from '@/ui'
import { DutyCalculator } from './DutyCalculator'
import { AddCostSheet } from './sheets/AddCostSheet'
import { RealiseSheet, TrackEventSheet } from './sheets/TradeSmallSheets'
import { TradeSheet } from './sheets/TradeSheet'
import { EditCostSheet, EditTrackSheet, ShipmentBasicsSheet, StepDateSheet } from './sheets/EditSheets'
import { StepDoneSheet } from './sheets/StepDoneSheet'
import { go } from '@/core/router'

type Tab = 'summary' | 'transport' | 'customs' | 'costs' | 'duty' | 'payment'

/** #/trade/<id>: one import or export with everything about it. */
export function ShipmentPage({ shipment: s }: { shipment: Shipment }) {
  const { db, act } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('summary')
  const c = shipmentCalc(db, s)
  const tc = tradeCalc(db, s)
  const t = tc.t
  const exp = c.exp
  const canEdit = !accessGuard.readonly
  const done = c.keys.filter((k) => s.steps[k]?.date).length

  const mark = (key: StepKey) => sheets.open(StepDoneSheet, { importId: s.id, step: key })

  return (
    <>
      <PageHead back={{ to: 'trade/list', label: 'Import and export' }} title={`${s.id} · ${c.productName}`}
        pill={<Pill tone={c.tone}>{c.status}</Pill>}
        sub={<>{exp ? 'Export to' : 'Import from'} {s.supplier || '—'}{s.country ? `, ${s.country}` : ''} · {tc.modeLabel} · {t.incoterm} · {tc.payLabel}</>}
        actions={canEdit && (
          <>
            <Button variant="secondary" icon="edit" onClick={() => sheets.open(TradeSheet, { importId: s.id })}>Terms and transport</Button>
            <Button variant="secondary" icon="plus" onClick={() => sheets.open(AddCostSheet, { importId: s.id })}>Add cost</Button>
            {!exp && !s.steps.warehouse?.date && <Button variant="secondary" icon="truck" onClick={() => sheets.open(TripSheet, { purpose: 'pickup', shipmentId: s.id })}>Pickup from port</Button>}
            {exp && s.steps.shipped?.date && tc.outstandingFc > 0 && <Button icon="wallet" onClick={() => sheets.open(RealiseSheet, { importId: s.id })}>Money received</Button>}
            <Button variant="secondary" icon="box" onClick={() => sheets.open(ShipmentBasicsSheet, { importId: s.id })}>Goods</Button>
            {!(exp ? s.steps.shipped?.date : s.steps.warehouse?.date) && <Button variant="secondary" icon="trash" onClick={async () => {
              if (!(await confirm({ title: `Remove ${s.id}?`, message: 'The shipment and its costs are removed, and the costs leave the cashbook. This cannot be undone.', confirmLabel: 'Remove shipment', destructive: true }))) return
              const why = act('removeShipment', s.id)
              if (why) toast(why)
              else { toast(`${s.id} removed`); go('trade/list') }
            }}>Remove</Button>}
          </>
        )} />

      {tc.alerts.length > 0 && <div className="trade-alerts">{tc.alerts.map((a) => <div key={a.id} className={`trade-alert ${a.tone}`}><Icon name="alert" size={15} />{a.text}</div>)}</div>}

      {/* where it is, at a glance */}
      <div className="ship-track">
        {c.keys.map((k, i) => {
          const st = s.steps[k] || {}
          return (
            <div key={k} className={'ship-step' + (st.date ? ' done' : c.next === k ? ' next' : '')}>
              <span className="ship-dot">{st.date ? <Icon name="check" size={13} /> : i + 1}</span>
              <b>{stepLabel(k, s)}</b>
              <small>{st.date ? fdate(st.date) : st.expected ? `Expected ${fshort(st.expected)}` : ''}</small>
              {st.note && <small className="step-note" title={st.by ? `By ${st.by}` : undefined}>“{st.note}”{st.by ? ` — ${st.by}` : ''}</small>}
              {canEdit && !st.date && c.next === k && <button type="button" className="link" onClick={() => mark(k)}>Mark done…</button>}
              {canEdit && (st.date || st.expected || s.steps[k]) && <button type="button" className="link step-edit" onClick={() => sheets.open(StepDateSheet, { importId: s.id, step: k })}>{st.date ? 'Change date' : 'Set expected'}</button>}
            </div>
          )
        })}
      </div>
      <Progress value={Math.round((done / c.keys.length) * 100)} />

      <Segmented<Tab> label="Shipment section" value={tab} onChange={setTab}
        options={[{ value: 'summary', label: 'Summary' }, { value: 'transport', label: 'Transport' }, { value: 'customs', label: 'Customs and papers' }, { value: 'costs', label: 'Costs' }, ...(!exp ? [{ value: 'duty' as const, label: 'Duty and tax' }] : []), { value: 'payment', label: exp ? 'Payment and proceeds' : 'LC and payment' }]} />

      {tab === 'summary' && (
        <div className="grid2">
          <Card title="Deal" icon="receipt">
            <div className="kv-list boxed">
              <div className="kv"><span>{exp ? 'Buyer' : 'Supplier'}</span><b>{s.supplier || '—'}{s.country ? `, ${s.country}` : ''}</b></div>
              <div className="kv"><span>Goods</span><b>{fmt(s.qty)} {s.unit} of {c.productName}</b></div>
              <div className="kv"><span>HS code</span><b>{s.customs?.hsCode || '—'}</b></div>
              <div className="kv"><span>Invoice value</span><b>{see.cost ? `${t.currency} ${fmt(s.usd)} × ${s.rate} = ${tk(c.invoiceTk)}` : <Hidden />}</b></div>
              <div className="kv"><span>Incoterm</span><b>{tc.termLabel}</b></div>
              <div className="kv"><span>Who pays freight / insurance</span><b>{INCOTERMS[t.incoterm].freight === 'seller' ? 'Seller' : 'Buyer'} / {INCOTERMS[t.incoterm].insurance === 'seller' ? 'Seller' : 'Buyer'}</b></div>
              <div className="kv"><span>Payment</span><b>{tc.payLabel}</b></div>
              <div className="kv"><span>{exp ? 'Export LC / contract' : 'LC no.'}</span><b>{s.lcNo || '—'}{s.bank ? ` · ${s.bank}` : ''}</b></div>
              <div className="kv"><span>PI / invoice no.</span><b>{[t.piNo, t.invoiceNo].filter(Boolean).join(' · ') || '—'}</b></div>
              {exp && tc.regime.code === 'BD' && <div className="kv"><span>EXP form</span><b>{t.expNo || '—'}</b></div>}
              {tc.regime.procedures && <div className="kv"><span>Customs procedure</span><b>{tc.procedureLabel}{t.freeZone ? ` · ${t.freeZone}` : ''}</b></div>}
              {exp && t.sourceImportId && <div className="kv"><span>Re-export of</span><b><button type="button" className="link" onClick={() => go('trade/' + t.sourceImportId)}>{t.sourceImportId}</button></b></div>}
              {!exp && tc.depositOpen > 0 && <div className="kv"><span>Customs deposit to get back</span><b className="t-good">{see.cost ? tk(tc.depositOpen) : <Hidden />}</b></div>}
            </div>
            <p className="t-muted tight trade-note">{INCOTERMS[t.incoterm].risk}</p>
            <CustomView entity="shipment" record={s} />
          </Card>
          <Card title={exp ? 'Margin' : 'Landed cost'} icon="wallet">
            {see.cost ? (
              <div className="kv-list">
                <div className="kv"><span>{exp ? 'Export value' : 'Goods (invoice)'}</span><span>{tk(c.invoiceTk)}</span></div>
                {exp && <div className="kv"><span>Cost of goods</span><span>{tk(c.goodsCost)}</span></div>}
                {tc.byGroup.map((g) => <div key={g.group} className="kv"><span>{g.label}</span><span>{tk(g.amount)}</span></div>)}
                {exp ? (
                  <div className={`kv total ${c.margin < 0 ? 't-warn' : ''}`}><span>{c.margin < 0 ? 'Loss' : 'Margin'}</span><span>{tk(Math.abs(c.margin))}</span></div>
                ) : (
                  <>
                    <div className="kv total"><span>Landed cost</span><span>{tk(c.landed)}</span></div>
                    <div className="kv"><span>Per {s.unit.replace(/s$/, '')} ({fmt(s.qty)})</span><b>{tk(c.perUnit)}</b></div>
                    {tc.recoverablePaid > 0 && <div className="kv"><span className="t-muted">VAT, AT and AIT paid — claimed back, not in cost</span><span className="t-good">{tk(tc.recoverablePaid)}</span></div>}
                  </>
                )}
                {exp && tc.incentiveTk > 0 && <div className="kv"><span className="t-muted">Cash incentive ({t.incentivePct}%) to claim</span><span className="t-good">{tk(tc.incentiveTk)}</span></div>}
              </div>
            ) : <p className="t-muted card-body">Values and costs are hidden for your role.</p>}
          </Card>
        </div>
      )}

      {tab === 'transport' && (
        <div className="grid2">
          <Card title={tc.modeLabel} icon={MODES[t.mode].icon}
            action={canEdit && <Button size="sm" variant="secondary" icon="edit" onClick={() => sheets.open(TradeSheet, { importId: s.id })}>Edit</Button>}>
            <div className="route-line">
              <span><small>From</small><b>{t.loadPort || '—'}</b>{t.etd && <small>{s.steps.shipped?.date ? 'Left' : 'Leaves'} {fdate(s.steps.shipped?.date || t.etd)}</small>}</span>
              <span className="route-arrow"><Icon name={MODES[t.mode].icon} size={20} /></span>
              <span><small>To</small><b>{t.dischargePort || '—'}</b>{t.eta && <small className={tc.late ? 't-warn' : undefined}>{tc.daysToEta == null ? 'Arrived' : tc.late ? `Due ${-tc.daysToEta} days ago` : `Arrives ${fdate(t.eta)}`}</small>}</span>
            </div>
            <div className="kv-list boxed">
              <div className="kv"><span>{MODES[t.mode].carrier}</span><b>{t.carrier || '—'}</b></div>
              <div className="kv"><span>{MODES[t.mode].vessel}</span><b>{[t.vessel, t.voyage].filter(Boolean).join(' / ') || '—'}</b></div>
              <div className="kv"><span>{MODES[t.mode].doc}</span><b>{t.docNo || '—'}</b></div>
              {t.mode === 'sea' && <div className="kv"><span>Containers</span><b className="kv-lines">{t.containers.length ? t.containers.map((x, i) => <span key={i}>{x.no || 'not given'} · {x.size === 'LCL' ? 'LCL' : x.size === 'reefer' ? 'reefer' : `${x.size}′`}{x.seal ? ` · seal ${x.seal}` : ''}</span>) : '—'}</b></div>}
              <div className="kv"><span>Packages · weight · volume</span><b>{[t.packages && `${fmt(t.packages)} pkgs`, t.grossKg && `${fmt(t.grossKg)} kg`, t.cbm && `${fmt(t.cbm)} CBM`].filter(Boolean).join(' · ') || '—'}</b></div>
              <div className="kv"><span>Freight forwarder</span><b>{t.forwarder || '—'}</b></div>
              <div className="kv"><span>C&F agent</span><b>{t.cnfAgent || s.customs?.cnf || '—'}</b></div>
            </div>
          </Card>
          <Card title="Tracking" icon="route" sub="Every movement, newest last."
            action={canEdit && <Button size="sm" icon="plus" onClick={() => sheets.open(TrackEventSheet, { importId: s.id })}>Add update</Button>}>
            <ol className="track-list">
              {t.events.map((e) => (
                <li key={e.id}>
                  <span className="track-dot" />
                  <div><b>{e.text}</b><small className="t-muted">{fdate(e.date)}{e.place ? ` · ${e.place}` : ''}</small></div>
                  {canEdit && <button type="button" className="icon-btn" aria-label="Edit update" onClick={() => sheets.open(EditTrackSheet, { importId: s.id, eventId: e.id })}><Icon name="edit" size={14} /></button>}
                  {canEdit && <button type="button" className="icon-btn" aria-label="Remove update" onClick={() => act('removeTrackEvent', { importId: s.id, eventId: e.id })}><Icon name="trash" size={14} /></button>}
                </li>
              ))}
              {!t.events.length && <li className="t-muted">No updates yet. Add sailing, transhipment, arrival and release as they happen.</li>}
            </ol>
          </Card>
        </div>
      )}

      {tab === 'customs' && <CustomsCard shipment={s} />}

      {tab === 'costs' && (
        <Card title="Costs" icon="receipt" sub={exp ? 'Every cost of getting the goods out; it comes off the margin. Tap a cost to change it.' : 'Every cost of getting the goods in. Taxes claimed back and refundable deposits are kept apart. Tap a cost to change it.'}
          action={canEdit && <Button size="sm" icon="plus" onClick={() => sheets.open(AddCostSheet, { importId: s.id })}>Add cost</Button>}>
          {see.cost ? (
            <DataTable rows={[...s.costs].sort((a, b) => (a.date < b.date ? -1 : 1))} rowKey={(x) => x.id} exportName={`${s.id}-costs`} empty="No costs yet."
              onRow={canEdit ? (x) => sheets.open(EditCostSheet, { importId: s.id, costId: x.id }) : undefined}
              columns={[
                { label: 'Date', primary: true, render: (x) => <span className="nowrap">{fdate(x.date)}</span> },
                { label: 'Cost', render: (x) => <span className="two-line"><b>{x.type}</b>{x.note && <small className="t-muted">{x.note}</small>}</span> },
                { label: 'Group', render: (x) => <span className="t-muted">{COST_GROUPS[x.group || groupOf(x.type)]}</span> },
                { label: 'Paid by', render: (x) => <span className="t-muted">{x.method}</span> },
                { label: 'Amount', align: 'right', render: (x) => <span className={x.recoverable ? 't-good' : undefined}>{tk(x.amount)}{x.refundedOn ? ` · refunded ${fdate(x.refundedOn)}` : x.recoverable ? (/deposit/i.test(x.type) ? ' · refundable' : ' · claim back') : ''}</span>, exportValue: (x) => x.amount },
                ...(canEdit ? [{ label: '', align: 'right' as const, render: (x: Shipment['costs'][number]) => (/deposit/i.test(x.type) && !x.refundedOn ? <Button size="sm" variant="secondary" onClick={async (e) => {
                  e.stopPropagation()
                  if (!(await confirm({ title: `Deposit ${tk(x.amount)} refunded?`, message: 'It comes back into the cashbook today.', confirmLabel: 'Refunded' }))) return
                  toast(act('refundDeposit', { importId: s.id, costId: x.id, date: todayISO() }) || 'Deposit refunded')
                }}>Refunded</Button> : null) }] : []),
                ...(canEdit ? [{ label: '', align: 'right' as const, render: (x: Shipment['costs'][number]) => <button type="button" className="icon-btn" aria-label="Remove cost" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: `Remove ${x.type}?`, confirmLabel: 'Remove', destructive: true })) act('removeImportCost', { importId: s.id, costId: x.id }) }}><Icon name="trash" size={14} /></button> }] : []),
              ]} />
          ) : <p className="t-muted card-body">Costs are hidden for your role.</p>}
        </Card>
      )}

      {tab === 'duty' && !exp && <DutyCalculator shipment={s} />}

      {tab === 'payment' && <PaymentTab shipment={s} />}
    </>
  )
}

function PaymentTab({ shipment: s }: { shipment: Shipment }) {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const tc = tradeCalc(db, s)
  const t = tc.t
  const lc = t.lc
  const money = (n: number) => (see.cost ? tk(n) : <Hidden />)
  return (
    <div className="grid2">
      <Card title={tc.isLc ? (tc.exp ? 'Export LC' : 'Letter of credit') : PAYMENT_TERMS[t.payment].label} icon="card" sub={PAYMENT_TERMS[t.payment].hint}>
        <div className="kv-list boxed">
          <div className="kv"><span>Terms</span><b>{tc.payLabel}</b></div>
          {tc.isLc && (
            <>
              <div className="kv"><span>LC no.</span><b>{s.lcNo || '—'}</b></div>
              <div className="kv"><span>Amount</span><b>{see.cost ? `${t.currency} ${fmt(tc.lcAmount)} (${tk(tc.lcTk)})` : <Hidden />}</b></div>
              {!tc.exp && <div className="kv"><span>Margin held by bank{lc?.marginPct ? ` (${lc.marginPct}%)` : ''}</span><b>{money(tc.lcMarginTk)}</b></div>}
              <div className="kv"><span>Issuing bank</span><b>{lc?.issuingBank || s.bank || '—'}</b></div>
              <div className="kv"><span>Advising bank</span><b>{lc?.advisingBank || '—'}</b></div>
              <div className="kv"><span>Opened</span><b>{fdate(lc?.issuedOn || s.steps.lc?.date || s.steps.contract?.date) || '—'}</b></div>
              <div className="kv"><span>Last shipment date</span><b>{fdate(lc?.lastShipment) || '—'}</b></div>
              <div className="kv"><span>Expiry</span><b className={tc.lcDaysLeft != null && tc.lcDaysLeft <= 15 && !lc?.retiredOn ? 't-warn' : undefined}>{lc?.expiry ? `${fdate(lc.expiry)}${tc.lcDaysLeft != null && !lc.retiredOn ? (tc.lcDaysLeft < 0 ? ' · expired' : ` · ${tc.lcDaysLeft} days left`) : ''}` : '—'}</b></div>
              {lc?.retiredOn && <div className="kv"><span>Retired</span><b className="t-good">{fdate(lc.retiredOn)}</b></div>}
            </>
          )}
          {tc.dueOn && <div className="kv"><span>Payment due ({t.usanceDays} days)</span><b>{fdate(tc.dueOn)}</b></div>}
        </div>
      </Card>
      {tc.exp ? (
        <Card title="Export proceeds" icon="wallet" action={tc.outstandingFc > 0 && s.steps.shipped?.date && !accessGuard.readonly && <Button size="sm" icon="plus" onClick={() => sheets.open(RealiseSheet, { importId: s.id })}>Money received</Button>}>
          {see.cost ? (
            <div className="kv-list">
              <div className="kv"><span>Invoiced</span><span>{t.currency} {fmt(s.usd)} · {tk(tc.proceedsTk)}</span></div>
              <div className="kv"><span>Received{t.realisedOn ? ` (last ${fdate(t.realisedOn)})` : ''}</span><span className="t-good">{t.currency} {fmt(t.realisedFc || 0)} · {tk(tc.realisedTk)}</span></div>
              <div className="kv"><span>Still to come</span><b className={tc.outstandingFc > 0 ? 't-warn' : 't-good'}>{tc.outstandingFc > 0 ? `${t.currency} ${fmt(tc.outstandingFc)}` : 'Fully received'}</b></div>
              {tc.daysUnpaid != null && <div className="kv"><span>Days since shipment</span><b className={tc.regime.proceedsDays && tc.daysUnpaid > tc.regime.proceedsDays ? 't-warn' : undefined}>{tc.daysUnpaid}{tc.regime.proceedsDays ? ` of ${tc.regime.proceedsDays}` : ''}</b></div>}
              {tc.fxGain !== 0 && <div className="kv"><span>Exchange {tc.fxGain > 0 ? 'gain' : 'loss'} on what was received</span><span className={tc.fxGain > 0 ? 't-good' : 't-warn'}>{tk(Math.abs(tc.fxGain))}</span></div>}
              {tc.regime.exportIncentive && <div className="kv"><span>Source tax by the bank ({t.sourceTaxPct ?? 1}%)</span><span>{tk(tc.sourceTaxTk)}</span></div>}
              {tc.regime.exportIncentive && (t.incentivePct || 0) > 0 && <div className="kv total"><span>Cash incentive ({t.incentivePct}%) to claim</span><span className="t-good">{tk(tc.incentiveTk)}</span></div>}
            </div>
          ) : <p className="t-muted card-body">Values are hidden for your role.</p>}
        </Card>
      ) : (
        <Card title="Money out" icon="wallet">
          {see.cost ? (
            <div className="kv-list">
              <div className="kv"><span>Invoice value to the supplier</span><span>{tk(s.usd * s.rate)}</span></div>
              <div className="kv"><span>Bank and LC charges</span><span>{tk(tc.byGroup.find((g) => g.group === 'bank')?.amount || 0)}</span></div>
              <div className="kv"><span>Duty and taxes (incl. claimable)</span><span>{tk((tc.byGroup.find((g) => g.group === 'duty')?.amount || 0) + tc.recoverablePaid)}</span></div>
              <div className="kv total"><span>Paid out so far</span><span>{tk(s.usd * s.rate + s.costs.reduce((a, x) => a + x.amount, 0))}</span></div>
            </div>
          ) : <p className="t-muted card-body">Values are hidden for your role.</p>}
        </Card>
      )}
    </div>
  )
}
