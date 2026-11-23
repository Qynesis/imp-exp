import {
  activeProducts, byId, CURRENCIES, defaultTrade, FREE_ZONES, presetsFor, PROCEDURES, regimeOf, INCOTERMS, MODES, num, PAYMENT_TERMS, portsFor, tk, todayISO, UNITS,
  type CustomsProcedure, type CustomValues, type Direction, type Incoterm, type TradePayment, type TransportMode, moneySymbol } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useForm, useToast } from '@/ui'

/** A new import or export: goods, terms, transport and payment in one go. `productId` starts an import of that item. */
export function NewShipmentSheet({ productId }: { productId?: string } = {}) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({
    direction: 'import' as Direction, supplier: '', country: '', productId: productId || activeProducts(db)[0]?.id || '', productName: '', qty: '', unit: 'pcs',
    lcNo: '', bank: '', usd: '', rate: '', startDate: todayISO(), expected: '', hsCode: '', custom: {} as CustomValues,
    mode: 'sea' as TransportMode, incoterm: 'CFR' as Incoterm, payment: 'lc-sight' as TradePayment, currency: 'USD', loadPort: '', dischargePort: portsFor('sea', true, regimeOf(db).country)[0]?.name || '',
    procedure: 'home' as CustomsProcedure, freeZone: '', sourceImportId: '', etd: '', usanceDays: '', marginPct: '', expiry: '',
  })
  const product = byId(db.products, v.productId)
  const exp = v.direction === 'export'
  const term = INCOTERMS[v.incoterm]
  const isLc = PAYMENT_TERMS[v.payment].lc
  const regime = regimeOf(db)
  const presets = presetsFor(regime)
  const loadList = portsFor(v.mode, exp, regime.country)
  const arriveList = portsFor(v.mode, !exp, regime.country)
  const preset = presets.find((p) => p.code === v.hsCode.trim())
  const setDir = (d: Direction) => {
    set('direction', d)
    set('incoterm', d === 'export' ? 'FOB' : 'CFR')
    const home = portsFor(v.mode, true, regime.country)[0]?.name || ''
    set('loadPort', d === 'export' ? home : '')
    set('dischargePort', d === 'export' ? '' : home)
  }
  const setMode = (m: TransportMode) => {
    set('mode', m)
    if (INCOTERMS[v.incoterm].seaOnly && m !== 'sea') set('incoterm', v.incoterm === 'CIF' ? 'CIP' : v.incoterm === 'CFR' ? 'CPT' : 'FCA')
    const home = portsFor(m, true, regime.country)[0]?.name || ''
    if (exp) set('loadPort', home)
    else set('dischargePort', home)
  }
  return (
    <FormSheet title="New shipment" crumb="Import and export" submit="Save shipment" wide
      note={exp
        ? 'Stock leaves the warehouse when it is marked shipped; proceeds reach the cashbook when money is received.'
        : 'The invoice value leaves the cashbook on the LC (or payment) date. Add freight, bank, port and C&F costs as they come; record duty from the Duty and tax tab.'}
      onSubmit={() => {
        if (!product && !v.productName.trim()) return 'Say what is being shipped.'
        if (num(v.qty) <= 0) return 'Enter the quantity.'
        if (num(v.usd) <= 0 || num(v.rate) <= 0) return `Enter the invoice value in ${v.currency} and the exchange rate.`
        if (term.seaOnly && v.mode !== 'sea') return `${v.incoterm} is for sea shipments.`
        const id = (exp ? 'EXP-' : 'IMP-') + String(exp ? db.seq.exp : db.seq.imp).padStart(3, '0')
        const trade = {
          ...defaultTrade(v.direction), mode: v.mode, incoterm: v.incoterm, payment: v.payment, currency: v.currency, loadPort: v.loadPort.trim(), dischargePort: v.dischargePort.trim(),
          etd: v.etd || undefined, eta: v.expected || undefined, usanceDays: num(v.usanceDays) || undefined,
          procedure: regime.procedures ? v.procedure : undefined, freeZone: v.procedure === 'freezone' || v.procedure === 'reexport' ? v.freeZone.trim() || undefined : undefined,
          sourceImportId: exp && v.sourceImportId ? v.sourceImportId : undefined,
          lc: isLc ? { issuingBank: exp ? '' : v.bank.trim(), advisingBank: exp ? v.bank.trim() : '', issuedOn: v.startDate, expiry: v.expiry || undefined, marginPct: num(v.marginPct) || undefined } : undefined,
        }
        const why = act('newImport', {
          direction: v.direction, supplier: v.supplier.trim(), country: v.country.trim(), productId: product?.id || '', productName: product?.name || v.productName.trim(),
          qty: num(v.qty), unit: product?.unit || v.unit, lcNo: v.lcNo.trim(), bank: v.bank.trim(), usd: num(v.usd), rate: num(v.rate), startDate: v.startDate, expected: v.expected,
          custom: v.custom, trade,
          customs: { hsCode: v.hsCode.trim(), port: exp ? v.loadPort.trim() : v.dischargePort.trim(), stages: {}, docs: {}, rates: !exp && preset ? preset.rates : {} },
        })
        if (why) return why
        toast(`Shipment ${id} saved`)
        // stay in the section the shipment was started from
        go((location.hash.startsWith('#/trade') ? 'trade/' : 'imports/') + id)
      }}>
      <div className="field wide">
        <Segmented<Direction> label="Import or export" value={v.direction} onChange={setDir} options={[{ value: 'import', label: 'Import (we buy from abroad)' }, { value: 'export', label: 'Export (we sell abroad)' }]} />
      </div>
      <Field label={exp ? 'Buyer abroad' : 'Supplier abroad'}><input {...bind('supplier')} placeholder="Company name" /></Field>
      <Field label="Country"><input {...bind('country')} placeholder={exp ? 'e.g. Germany' : 'e.g. China'} /></Field>
      <Field label="Product">
        <select {...bind('productId')}>
          {activeProducts(db).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Something not in the product list</option>
        </select>
      </Field>
      {!product && <Field label="Goods description"><input {...bind('productName')} placeholder="e.g. CNC lathe machine" /></Field>}
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 200" /></Field>
      {!product && <Field label="Unit"><select {...bind('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>}
      <Field label="HS code" hint={preset ? `Typical duty for ${preset.name} filled in — check on the Duty and tax tab` : 'Pick a common item, or type the code'}>
        <input {...bind('hsCode')} list="new-hs" placeholder="e.g. 8539.52.00" />
      </Field>

      <p className="form-sub">Transport</p>
      <div className="field wide">
        <Segmented<TransportMode> label="Transport" value={v.mode} onChange={setMode} options={(Object.keys(MODES) as TransportMode[]).map((m) => ({ value: m, label: MODES[m].label }))} />
      </div>
      <Field label="From (port of loading)"><input {...bind('loadPort')} list="new-load" placeholder={loadList[0]?.name} /></Field>
      <Field label="To (port of arrival)"><input {...bind('dischargePort')} list="new-arrive" placeholder={arriveList[0]?.name} /></Field>
      <Field label="Departs (ETD)"><input type="date" {...bind('etd')} /></Field>
      <Field label={exp ? 'Arrives at buyer (ETA)' : 'Arrives at port (ETA)'}><input type="date" {...bind('expected')} /></Field>

      {regime.procedures && (
        <>
          <Field label="Customs procedure" hint={PROCEDURES[v.procedure].hint}>
            <select {...bind('procedure')}>{(Object.keys(PROCEDURES) as CustomsProcedure[]).map((k) => <option key={k} value={k}>{PROCEDURES[k].label}</option>)}</select>
          </Field>
          {(v.procedure === 'freezone' || v.procedure === 'reexport') && <Field label="Free zone"><input {...bind('freeZone')} list="new-fz" placeholder="e.g. JAFZA" /></Field>}
        </>
      )}
      {exp && (
        <Field label="Re-export of" hint="Pick the import these goods came in on; the margin then uses its landed cost.">
          <select {...bind('sourceImportId')}>
            <option value="">Not a re-export</option>
            {db.imports.filter((x) => x.direction !== 'export').map((x) => <option key={x.id} value={x.id}>{x.id} · {x.productName} ({x.qty} {x.unit})</option>)}
          </select>
        </Field>
      )}

      <p className="form-sub">Terms and payment</p>
      <Field label="Incoterm" hint={term.risk}>
        <select {...bind('incoterm')}>{(Object.keys(INCOTERMS) as Incoterm[]).map((k) => <option key={k} value={k} disabled={INCOTERMS[k].seaOnly && v.mode !== 'sea'}>{k} · {INCOTERMS[k].label}</option>)}</select>
      </Field>
      <Field label="Payment" hint={PAYMENT_TERMS[v.payment].hint}>
        <select {...bind('payment')}>{(Object.keys(PAYMENT_TERMS) as TradePayment[]).map((k) => <option key={k} value={k}>{PAYMENT_TERMS[k].label}</option>)}</select>
      </Field>
      {(v.payment === 'lc-usance' || v.payment === 'da') && <Field label="Days to pay"><input {...nbind('usanceDays')} placeholder="e.g. 90" /></Field>}
      <Field label="Currency"><select {...bind('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={`Invoice value (${v.currency})`}><input {...nbind('usd')} placeholder="0" /></Field>
      <Field label={`Exchange rate (${moneySymbol()} per ${v.currency})`} hint={num(v.usd) * num(v.rate) > 0 ? `= ${tk(num(v.usd) * num(v.rate))}` : undefined}><input {...nbind('rate')} placeholder="0" /></Field>
      <Field label={exp ? (isLc ? 'Export LC no.' : 'Contract no.') : isLc ? 'LC no.' : 'Reference'}><input {...bind('lcNo')} placeholder="e.g. LC-2026-0480" /></Field>
      <Field label="Our bank"><input {...bind('bank')} placeholder="Bank and branch" /></Field>
      {isLc && !exp && <Field label="LC margin (%)"><input {...nbind('marginPct')} placeholder="e.g. 10" /></Field>}
      {isLc && <Field label="LC expiry"><input type="date" {...bind('expiry')} /></Field>}
      <Field label={exp ? 'Contract / LC received on' : isLc ? 'LC opened on' : 'Order date'}><input type="date" {...bind('startDate')} /></Field>
      <CustomFields entity="shipment" value={v.custom} onChange={(c) => set('custom', c)} />
      <datalist id="new-hs">{presets.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</datalist>
      <datalist id="new-fz">{FREE_ZONES.map((z) => <option key={z} value={z} />)}</datalist>
      <datalist id="new-load">{loadList.map((p) => <option key={p.name} value={p.name}>{p.country}</option>)}</datalist>
      <datalist id="new-arrive">{arriveList.map((p) => <option key={p.name} value={p.name}>{p.country}</option>)}</datalist>
    </FormSheet>
  )
}
