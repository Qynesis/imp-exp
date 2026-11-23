import { useState } from 'react'
import {
  CURRENCIES, customsCalc, dutyQuote, fmt, INCOTERMS, moneySymbol, num, presetsFor, PROCEDURES, regimeOf, tk, todayISO,
  type CustomsProcedure, type DutyKey, type Incoterm, type Shipment,
} from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, Field, useConfirm, useToast } from '@/ui'

type Rates = Partial<Record<DutyKey, string>>

/**
 * Work out import duty step by step, the way the company's customs does it: Bangladesh (CD, RD, SD,
 * VAT, AT, AIT on CIF + 1%) or UAE / GCC (5% duty, excise, 5% VAT on CIF). Inside a shipment it starts
 * from the shipment's values and can save the rates or record the duty paid; on its own it is a what-if tool.
 */
export function DutyCalculator({ shipment: s }: { shipment?: Shipment }) {
  const { db, act } = useBooks()
  const see = useSee()
  const toast = useToast()
  const confirm = useConfirm()
  const regime = regimeOf(db)
  const presets = presetsFor(regime)
  const cc = s ? customsCalc(db, s) : null
  const t = s?.trade
  const ratesOf = (r: Partial<Record<DutyKey, number>> = {}): Rates => Object.fromEntries(regime.duties.map(([k]) => [k, r[k] != null ? String(r[k]) : '']))
  const [hs, setHs] = useState(s?.customs?.hsCode || '')
  const [rates, setRates] = useState<Rates>(() => ratesOf(s?.customs?.rates && Object.keys(s.customs.rates).length ? s.customs.rates : presets[0].rates))
  const [procedure, setProcedure] = useState<CustomsProcedure>(t?.procedure || 'home')
  const [v, setV] = useState({
    value: s ? String(s.usd) : '10000', currency: t?.currency || 'USD', rate: s ? String(s.rate) : regime.code === 'BD' ? '122' : '3.6725', incoterm: (t?.incoterm || 'FOB') as Incoterm,
    freight: s ? (cc?.freightTk ? String(Math.round((cc.freightTk / s.rate) * 10000) / 10000) : '') : '800',
    insurance: s && cc && !cc.insuranceAssumed && cc.insuranceTk ? String(Math.round((cc.insuranceTk / s.rate) * 10000) / 10000) : '', qty: s ? String(s.qty) : '1000',
  })
  const set = (k: keyof typeof v, x: string) => setV((o) => ({ ...o, [k]: x }))
  const pick = (code: string) => {
    setHs(code)
    const p = presets.find((x) => x.code === code)
    if (p) setRates(ratesOf(p.rates))
  }
  const term = INCOTERMS[v.incoterm]
  const fx = num(v.rate)
  const invoiceTk = num(v.value) * fx
  const freightTk = term.freight === 'seller' ? 0 : num(v.freight) * fx
  const insKnown = num(v.insurance) * fx
  const insuranceTk = term.insurance === 'seller' ? 0 : insKnown || (invoiceTk + freightTk) * (regime.insurancePct / 100)
  const r = Object.fromEntries(regime.duties.map(([k]) => [k, num(rates[k] || '')])) as Record<DutyKey, number>
  const q = dutyQuote({ invoiceTk, freightTk, insuranceTk, rates: r, regime, procedure })
  const qty = num(v.qty) || 1
  const claim = t?.claimTax ?? true
  const landed = invoiceTk + freightTk + insuranceTk + q.costDuty + (claim ? 0 : q.recoverable)
  const canEdit = !!s && !accessGuard.readonly
  const m = (n: number) => (see.cost ? tk(n) : <Hidden />)
  const base: Partial<Record<DutyKey, string>> = regime.code === 'BD'
    ? { cd: 'AV', rd: 'AV', ait: 'AV', sd: 'AV + CD + RD', vat: 'AV + CD + RD + SD', at: 'AV + CD + RD + SD' }
    : { cd: 'CIF', excise: 'CIF', vat: 'CIF + duty + excise' }
  const presetName = presets.find((p) => p.code === hs)?.name

  const save = () => {
    if (!s) return
    const why = act('saveCustoms', { importId: s.id, data: { hsCode: hs.trim(), rates: r } })
    if (!why && regime.procedures && t && procedure !== (t.procedure || 'home')) act('saveTrade', { importId: s.id, trade: { ...t, procedure } })
    if (!why) toast('Rates saved to the shipment')
  }
  const post = async () => {
    if (!s) return
    save()
    const posted = s.costs.some((x) => x.group === 'duty')
    if (posted && !(await confirm({ title: 'Duty is already in the costs', message: 'Replace it with these figures?', confirmLabel: 'Replace' }))) return
    const why = act('postDuties', { importId: s.id, date: todayISO(), method: 'Bank transfer', replace: posted })
    if (!why) toast(q.deposit ? `Customs deposit ${tk(q.deposit)} recorded — refundable on re-export` : `Duty recorded: ${tk(q.costDuty)} to cost, ${tk(q.recoverable)} to claim back`)
  }

  return (
    <div className="grid2 duty-calc">
      <Card title="Inputs" icon="layers" sub={`${regime.label}${s ? ' · from the shipment; change anything to see the effect' : ' · try any goods and terms before you buy'}`}>
        <div className="card-body pt0 form-grid">
          <Field label="HS code" wide hint={presetName ? `Typical rates for ${presetName} — check the tariff of the year` : 'Pick a common item to fill typical rates, or type rates yourself'}>
            <div className="hs-pick">
              <input className="in" value={hs} onChange={(e) => setHs(e.target.value)} placeholder="e.g. 8517.13.00" list="hs-presets" />
              <select className="in" value="" onChange={(e) => e.target.value && pick(e.target.value)} aria-label="Common items">
                <option value="">Common items…</option>
                {presets.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </select>
            </div>
          </Field>
          {regime.procedures && (
            <Field label="Customs procedure" wide hint={PROCEDURES[procedure].hint}>
              <select className="in" value={procedure} onChange={(e) => setProcedure(e.target.value as CustomsProcedure)}>{(Object.keys(PROCEDURES) as CustomsProcedure[]).map((k) => <option key={k} value={k}>{PROCEDURES[k].label}</option>)}</select>
            </Field>
          )}
          <Field label="Invoice value"><input className="in" inputMode="decimal" value={v.value} onChange={(e) => set('value', e.target.value)} /></Field>
          <Field label="Currency">
            <select className="in" value={v.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label={`Exchange rate (${moneySymbol()} per ${v.currency})`}><input className="in" inputMode="decimal" value={v.rate} onChange={(e) => set('rate', e.target.value)} /></Field>
          <Field label="Incoterm" hint={term.risk}>
            <select className="in" value={v.incoterm} onChange={(e) => set('incoterm', e.target.value)}>{(Object.keys(INCOTERMS) as Incoterm[]).map((k) => <option key={k} value={k}>{k} · {INCOTERMS[k].label}</option>)}</select>
          </Field>
          {term.freight === 'buyer' && <Field label={`Freight (${v.currency})`}><input className="in" inputMode="decimal" value={v.freight} onChange={(e) => set('freight', e.target.value)} placeholder="0" /></Field>}
          {term.insurance === 'buyer' && <Field label={`Insurance (${v.currency})`} hint={regime.insurancePct ? `Empty: customs takes ${regime.insurancePct}% of cost and freight` : undefined}><input className="in" inputMode="decimal" value={v.insurance} onChange={(e) => set('insurance', e.target.value)} placeholder={regime.insurancePct ? `${regime.insurancePct}% rule` : '0'} /></Field>}
          <Field label="Quantity"><input className="in" inputMode="decimal" value={v.qty} onChange={(e) => set('qty', e.target.value)} /></Field>
          <p className="form-sub">Rates (%)</p>
          {regime.duties.map(([k, label]) => (
            <Field key={k} label={label}><input className="in" inputMode="decimal" value={rates[k] || ''} onChange={(e) => setRates((x) => ({ ...x, [k]: e.target.value }))} placeholder="0" /></Field>
          ))}
        </div>
      </Card>
      <Card title="Duty and landed cost" icon="money" sub={`Total tax incidence ${q.tti}% of the ${regime.code === 'BD' ? 'assessable value' : 'CIF value'}`}>
        {q.suspended && <div className="trade-alert info calc-note">Duty and VAT are suspended while the goods stay in the free zone or in transit. They are due only if the goods enter the local market.</div>}
        {q.deposit > 0 && <div className="trade-alert info calc-note">Entered for re-export: duty of {m(q.deposit)} is paid as a deposit and refunded when the goods leave the country. No VAT is due.</div>}
        <div className="kv-list">
          <div className="kv"><span>Invoice value · {v.currency} {fmt(num(v.value))} × {fx}</span><span>{m(invoiceTk)}</span></div>
          <div className="kv"><span>Freight {term.freight === 'seller' ? '(in the price)' : ''}</span><span>{m(freightTk)}</span></div>
          <div className="kv"><span>Insurance {term.insurance === 'seller' ? '(in the price)' : !insKnown && regime.insurancePct ? `(${regime.insurancePct}% rule)` : ''}</span><span>{m(insuranceTk)}</span></div>
          <div className="kv"><span>CIF value</span><b>{m(q.cif)}</b></div>
          {regime.landingPct > 0 && <div className="kv"><span>Landing charge {regime.landingPct}%</span><span>{m(q.landing)}</span></div>}
          {regime.landingPct > 0 && <div className="kv total"><span>Assessable value (AV)</span><span>{m(q.av)}</span></div>}
          {q.duties.map((d) => (
            <div key={d.key} className="kv"><span>{d.label} · {d.rate}%<small className="t-muted"> on {base[d.key]}</small></span><span className={regime.recoverable.includes(d.key) && claim ? 't-good' : undefined}>{m(d.amount)}</span></div>
          ))}
          <div className="kv total"><span>{q.suspended ? 'Payable now (suspended)' : q.deposit ? 'Deposit to pay now' : 'Total duty and taxes to pay'}</span><span>{m(q.dutyTotal)}</span></div>
          {!q.suspended && !q.deposit && (
            <>
              <div className="kv"><span className="t-muted">Stays in cost ({regime.duties.filter(([k]) => !regime.recoverable.includes(k)).map(([, l]) => l.replace(/ \(.*\)/, '')).join(', ')})</span><span>{m(q.costDuty)}</span></div>
              <div className="kv"><span className="t-muted">{claim ? `Claimed back (${regime.code === 'BD' ? 'VAT, AT as input VAT; AIT against income tax' : 'input VAT on the VAT return'})` : 'VAT (not claimed back)'}</span><span className={claim ? 't-good' : undefined}>{m(q.recoverable)}</span></div>
            </>
          )}
          <div className="kv total"><span>Landed cost before port and clearance</span><span>{m(landed)}</span></div>
          <div className="kv"><span className="t-muted">Per unit ({fmt(qty)})</span><b>{m(landed / qty)}</b></div>
        </div>
        {s && <p className="t-muted tight card-body pt0">Customs’ own assessment decides. Bank, port, clearing and transport costs are added on the Costs tab.</p>}
        {canEdit && (
          <div className="card-body pt0 btn-row">
            <Button variant="secondary" onClick={save}>Save rates to {s?.id}</Button>
            <Button icon="check" disabled={q.suspended} onClick={() => void post()}>{q.deposit ? 'Record deposit paid' : 'Record duty paid'}</Button>
          </div>
        )}
        <datalist id="hs-presets">{presets.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</datalist>
      </Card>
    </div>
  )
}
