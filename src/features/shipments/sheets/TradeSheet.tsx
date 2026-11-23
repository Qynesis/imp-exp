import { useState } from 'react'
import {
  byId, CURRENCIES, defaultTrade, INCOTERMS, MODES, num, PAYMENT_TERMS, portsFor, tk, type Container, type Incoterm, type TradeInfo, type TradePayment, type TransportMode, moneySymbol, regimeOf, FREE_ZONES, PROCEDURES, type CustomsProcedure } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, FormSheet, Icon, Segmented, useToast, type SheetComponent } from '@/ui'

const SIZES: Container['size'][] = ['20', '40', '40HC', 'LCL', 'reefer']
const str = (n?: number) => (n != null ? String(n) : '')
const opt = (s: string) => (s.trim() ? num(s) : undefined)

/** Transport, Incoterm, payment terms, LC and export details of a shipment, all in one place. */
export const TradeSheet: SheetComponent<{ importId: string }> = ({ importId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const exp = s?.direction === 'export'
  const t0: TradeInfo = { ...defaultTrade(s?.direction || 'import'), ...s?.trade }
  const [t, setT] = useState<TradeInfo>(t0)
  const [money, setMoney] = useState({ usd: str(s?.usd), rate: str(s?.rate), lcNo: s?.lcNo || '', bank: s?.bank || '', supplier: s?.supplier || '', country: s?.country || '' })
  const [nums, setNums] = useState({
    usance: str(t0.usanceDays), freight: str(t0.freight), insurance: str(t0.insurance), kg: str(t0.grossKg), cbm: str(t0.cbm), pkgs: str(t0.packages),
    lcAmount: str(t0.lc?.amount), margin: str(t0.lc?.marginPct), incentive: str(t0.incentivePct), sourceTax: str(t0.sourceTaxPct),
    realised: str(t0.realisedFc), realisedRate: str(t0.realisedRate),
  })
  if (!s) return null
  const up = <K extends keyof TradeInfo>(k: K, v: TradeInfo[K]) => setT((x) => ({ ...x, [k]: v }))
  const lc = t.lc || { issuingBank: '', advisingBank: '' }
  const upLc = (k: keyof typeof lc, v: string) => setT((x) => ({ ...x, lc: { ...lc, [k]: v || undefined } as TradeInfo['lc'] }))
  const isLc = PAYMENT_TERMS[t.payment].lc
  const term = INCOTERMS[t.incoterm]
  const regime = regimeOf(db)
  const home = portsFor(t.mode, true, regime.country)
  const away = portsFor(t.mode, false, regime.country)
  const loadList = exp ? home : away
  const arriveList = exp ? away : home
  const setC = (i: number, patch: Partial<Container>) => up('containers', t.containers.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const bindNum = (k: keyof typeof nums) => ({ className: 'in', inputMode: 'decimal' as const, value: nums[k], onChange: (e: { target: { value: string } }) => setNums((x) => ({ ...x, [k]: e.target.value })) })
  const bindT = (k: 'carrier' | 'vessel' | 'voyage' | 'docNo' | 'forwarder' | 'cnfAgent' | 'piNo' | 'invoiceNo' | 'loadPort' | 'dischargePort' | 'expNo') => ({ className: 'in', value: (t[k] as string) || '', onChange: (e: { target: { value: string } }) => up(k, e.target.value) })
  const bindD = (k: 'etd' | 'eta') => ({ className: 'in', type: 'date', value: t[k] || '', onChange: (e: { target: { value: string } }) => up(k, e.target.value || undefined) })
  const bindM = (k: keyof typeof money) => ({ className: 'in', value: money[k], onChange: (e: { target: { value: string } }) => setMoney((x) => ({ ...x, [k]: e.target.value })) })

  return (
    <FormSheet title={`Terms and transport · ${s.id}`} crumb="Import and export" submit="Save" wide onSubmit={() => {
      const trade: TradeInfo = {
        ...t, usanceDays: t.payment === 'lc-usance' || t.payment === 'da' ? opt(nums.usance) : undefined,
        freight: term.freight === 'buyer' ? opt(nums.freight) : undefined, insurance: term.insurance === 'buyer' ? opt(nums.insurance) : undefined,
        grossKg: opt(nums.kg), cbm: opt(nums.cbm), packages: opt(nums.pkgs),
        lc: isLc ? { ...lc, amount: opt(nums.lcAmount), marginPct: opt(nums.margin) } : undefined,
        incentivePct: exp && regime.exportIncentive ? opt(nums.incentive) : undefined, sourceTaxPct: exp && regime.exportIncentive ? opt(nums.sourceTax) : undefined,
        realisedFc: exp ? opt(nums.realised) : undefined, realisedRate: exp ? opt(nums.realisedRate) : undefined, realisedOn: exp && opt(nums.realised) ? t.realisedOn || undefined : undefined,
        procedure: regime.procedures ? t.procedure || 'home' : undefined, freeZone: t.procedure === 'freezone' || t.procedure === 'reexport' ? t.freeZone?.trim() || undefined : undefined,
        sourceImportId: exp ? t.sourceImportId || undefined : undefined,
      }
      const why = act('saveTrade', { importId: s.id, trade, usd: num(money.usd), rate: num(money.rate), lcNo: money.lcNo, bank: money.bank, supplier: money.supplier, country: money.country })
      if (why) return why
      toast('Terms and transport saved')
    }}>
      <p className="form-sub">Deal</p>
      <Field label={exp ? 'Buyer abroad' : 'Supplier abroad'}><input {...bindM('supplier')} /></Field>
      <Field label="Country"><input {...bindM('country')} /></Field>
      <Field label="Currency">
        <select className="in" value={t.currency} onChange={(e) => up('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label={`Invoice value (${t.currency})`}><input {...bindM('usd')} inputMode="decimal" /></Field>
      <Field label={`Exchange rate (${moneySymbol()} per ${t.currency})`} hint={num(money.usd) * num(money.rate) > 0 ? `= ${tk(num(money.usd) * num(money.rate))}` : undefined}><input {...bindM('rate')} inputMode="decimal" /></Field>
      <Field label="Incoterm" hint={term.risk}>
        <select className="in" value={t.incoterm} onChange={(e) => up('incoterm', e.target.value as Incoterm)}>
          {(Object.keys(INCOTERMS) as Incoterm[]).map((k) => <option key={k} value={k} disabled={INCOTERMS[k].seaOnly && t.mode !== 'sea'}>{k} · {INCOTERMS[k].label}{INCOTERMS[k].seaOnly ? ' (sea)' : ''}</option>)}
        </select>
      </Field>
      {!exp && term.freight === 'buyer' && <Field label={`Freight we pay (${t.currency})`} hint="Counts in the customs value"><input {...bindNum('freight')} placeholder="0" /></Field>}
      {!exp && term.insurance === 'buyer' && <Field label={`Insurance we pay (${t.currency})`} hint="Empty: customs takes 1%"><input {...bindNum('insurance')} placeholder="1% rule" /></Field>}
      <Field label="PI no."><input {...bindT('piNo')} /></Field>
      <Field label="Commercial invoice no."><input {...bindT('invoiceNo')} /></Field>
      {exp && <Field label="EXP form no."><input {...bindT('expNo')} /></Field>}

      <p className="form-sub">Transport</p>
      <div className="field wide">
        <Segmented<TransportMode> label="Mode" value={t.mode} onChange={(m) => {
          up('mode', m)
          if (INCOTERMS[t.incoterm].seaOnly && m !== 'sea') up('incoterm', t.incoterm === 'FOB' || t.incoterm === 'FAS' ? 'FCA' : t.incoterm === 'CIF' ? 'CIP' : 'CPT')
        }} options={(Object.keys(MODES) as TransportMode[]).map((m) => ({ value: m, label: MODES[m].label }))} />
      </div>
      <Field label={t.mode === 'road' ? 'Border / land port of loading' : t.mode === 'air' ? 'Airport of loading' : 'Port of loading'}>
        <input {...bindT('loadPort')} list="load-ports" placeholder={loadList[0]?.name} />
      </Field>
      <Field label={t.mode === 'road' ? 'Land port of entry' : t.mode === 'air' ? 'Airport of arrival' : 'Port of arrival'}>
        <input {...bindT('dischargePort')} list="arrive-ports" placeholder={arriveList[0]?.name} />
      </Field>
      <Field label="Departs (ETD)"><input {...bindD('etd')} /></Field>
      <Field label="Arrives (ETA)"><input {...bindD('eta')} /></Field>
      <Field label={MODES[t.mode].carrier}><input {...bindT('carrier')} /></Field>
      <Field label={MODES[t.mode].vessel}><input {...bindT('vessel')} /></Field>
      {t.mode === 'sea' && <Field label="Voyage"><input {...bindT('voyage')} /></Field>}
      <Field label={MODES[t.mode].doc}><input {...bindT('docNo')} /></Field>
      <Field label="Packages"><input {...bindNum('pkgs')} /></Field>
      <Field label="Gross weight (kg)"><input {...bindNum('kg')} /></Field>
      <Field label="Volume (CBM)"><input {...bindNum('cbm')} /></Field>
      <Field label="Freight forwarder"><input {...bindT('forwarder')} /></Field>
      <Field label="C&F agent"><input {...bindT('cnfAgent')} /></Field>
      {t.mode === 'sea' && (
        <>
          <p className="form-sub">Containers</p>
          {t.containers.map((c, i) => (
            <div key={i} className="extra-row container-row">
              <input className="in" value={c.no} onChange={(e) => setC(i, { no: e.target.value })} placeholder="e.g. MSKU 482915-3" aria-label="Container no." />
              <select className="in" value={c.size} onChange={(e) => setC(i, { size: e.target.value as Container['size'] })} aria-label="Size">{SIZES.map((z) => <option key={z} value={z}>{z === 'LCL' ? 'LCL' : z === 'reefer' ? 'Reefer' : `${z}′`}</option>)}</select>
              <input className="in" value={c.seal} onChange={(e) => setC(i, { seal: e.target.value })} placeholder="Seal no." aria-label="Seal no." />
              <button type="button" className="icon-btn" aria-label="Remove container" onClick={() => up('containers', t.containers.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
            </div>
          ))}
          <div className="field wide"><Button variant="secondary" icon="plus" onClick={() => up('containers', [...t.containers, { no: '', size: '20', seal: '' }])}>Add container</Button></div>
        </>
      )}

      {regime.procedures && (
        <>
          <p className="form-sub">Customs procedure</p>
          <Field label="Procedure" hint={PROCEDURES[t.procedure || 'home'].hint}>
            <select className="in" value={t.procedure || 'home'} onChange={(e) => up('procedure', e.target.value as CustomsProcedure)}>{(Object.keys(PROCEDURES) as CustomsProcedure[]).map((k) => <option key={k} value={k}>{PROCEDURES[k].label}</option>)}</select>
          </Field>
          {(t.procedure === 'freezone' || t.procedure === 'reexport') && <Field label="Free zone"><input className="in" value={t.freeZone || ''} onChange={(e) => up('freeZone', e.target.value)} list="trade-fz" placeholder="e.g. JAFZA" /></Field>}
        </>
      )}
      {exp && (
        <Field label="Re-export of" hint="The import these goods came in on; the margin uses its landed cost.">
          <select className="in" value={t.sourceImportId || ''} onChange={(e) => up('sourceImportId', e.target.value || undefined)}>
            <option value="">Not a re-export</option>
            {db.imports.filter((x) => x.direction !== 'export').map((x) => <option key={x.id} value={x.id}>{x.id} · {x.productName}</option>)}
          </select>
        </Field>
      )}

      <p className="form-sub">Payment</p>
      <Field label="Payment terms" hint={PAYMENT_TERMS[t.payment].hint}>
        <select className="in" value={t.payment} onChange={(e) => up('payment', e.target.value as TradePayment)}>{(Object.keys(PAYMENT_TERMS) as TradePayment[]).map((k) => <option key={k} value={k}>{PAYMENT_TERMS[k].label}</option>)}</select>
      </Field>
      {(t.payment === 'lc-usance' || t.payment === 'da') && <Field label="Days to pay (usance)"><input {...bindNum('usance')} placeholder="e.g. 90" /></Field>}
      <Field label={exp ? (isLc ? 'Export LC no.' : 'Contract no.') : isLc ? 'LC no.' : 'Reference'}><input {...bindM('lcNo')} /></Field>
      <Field label="Our bank"><input {...bindM('bank')} /></Field>
      {isLc && (
        <>
          <Field label={`LC amount (${t.currency})`} hint="Empty: the invoice value"><input {...bindNum('lcAmount')} /></Field>
          {!exp && <Field label="Margin held by bank (%)"><input {...bindNum('margin')} placeholder="e.g. 10" /></Field>}
          <Field label="Issuing bank"><input className="in" value={lc.issuingBank} onChange={(e) => upLc('issuingBank', e.target.value)} /></Field>
          <Field label="Advising bank"><input className="in" value={lc.advisingBank} onChange={(e) => upLc('advisingBank', e.target.value)} /></Field>
          <Field label="LC opened on"><input className="in" type="date" value={lc.issuedOn || ''} onChange={(e) => upLc('issuedOn', e.target.value)} /></Field>
          <Field label="Last shipment date"><input className="in" type="date" value={lc.lastShipment || ''} onChange={(e) => upLc('lastShipment', e.target.value)} /></Field>
          <Field label="Expiry"><input className="in" type="date" value={lc.expiry || ''} onChange={(e) => upLc('expiry', e.target.value)} /></Field>
          <Field label="Retired (closed) on"><input className="in" type="date" value={lc.retiredOn || ''} onChange={(e) => upLc('retiredOn', e.target.value)} /></Field>
        </>
      )}
      {exp ? (
        <>
          {regime.exportIncentive && <Field label="Cash incentive (%)" hint="Claimed from the government after proceeds arrive"><input {...bindNum('incentive')} placeholder="0" /></Field>}
          {regime.exportIncentive && <Field label="Source tax by bank (%)"><input {...bindNum('sourceTax')} placeholder="1" /></Field>}
          <Field label={`Received so far (${t.currency})`} hint="Correct the total here; new payments go through Money received"><input {...bindNum('realised')} placeholder="0" /></Field>
          <Field label={`Average rate received (${moneySymbol()} per ${t.currency})`}><input {...bindNum('realisedRate')} /></Field>
        </>
      ) : (
        <label className="check field wide">
          <input type="checkbox" checked={t.claimTax} onChange={(e) => up('claimTax', e.target.checked)} />
          <span>We claim back {regime.code === 'BD' ? 'import VAT, AT and AIT' : 'import VAT'} <small className="t-muted">— VAT-registered: kept out of the goods’ cost</small></span>
        </label>
      )}
      <datalist id="trade-fz">{FREE_ZONES.map((z) => <option key={z} value={z} />)}</datalist>
      <datalist id="load-ports">{loadList.map((p) => <option key={p.name} value={p.name}>{p.country}</option>)}</datalist>
      <datalist id="arrive-ports">{arriveList.map((p) => <option key={p.name} value={p.name}>{p.country}</option>)}</datalist>
    </FormSheet>
  )
}
