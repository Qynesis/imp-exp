/**
 * One shipment's terms worked out: costs by group, LC margin and dates, transit, export proceeds,
 * cash incentive and source tax — and the warnings an importer or exporter must not miss.
 */
import { addDays, daysBetween, fdate, todayISO } from '../format'
import { COST_GROUPS, defaultTrade, groupOf, INCOTERMS, MODES, PAYMENT_TERMS, PROCEDURES, regimeOf, type Regime } from '../tradeCatalog'
import type { CostGroup, Db, ISODate, Shipment, TradeInfo } from '../types'
import { memo, sum } from './common'
import { customsCalc } from './customs'
import { computeShipment } from './shipments'

export interface TradeAlert { id: string; shipmentId: string; tone: 'warn' | 'info'; text: string }

export interface TradeCalc {
  t: TradeInfo
  regime: Regime
  procedureLabel: string
  /** Re-export deposit paid and not yet refunded. */
  depositOpen: number
  exp: boolean
  modeLabel: string
  termLabel: string
  payLabel: string
  isLc: boolean
  /** Costs paid so far by group (taxes claimed back are kept apart). */
  byGroup: { group: CostGroup; label: string; amount: number }[]
  recoverablePaid: number
  /** Landed cost: invoice plus every cost that stays in the goods. */
  landed: number
  perUnit: number
  /** LC: amount in currency and Tk, margin held by the bank, days left. */
  lcAmount: number
  lcTk: number
  lcMarginTk: number
  lcDaysLeft: number | null
  /** Usance LC or DA: the day the bank pays. */
  dueOn: ISODate | null
  /** Transit. */
  daysToEta: number | null
  late: boolean
  /** Exports. */
  proceedsTk: number
  realisedTk: number
  outstandingFc: number
  incentiveTk: number
  sourceTaxTk: number
  fxGain: number
  /** Days since shipment for exports not fully paid (Bangladesh Bank expects proceeds within 120 days). */
  daysUnpaid: number | null
  alerts: TradeAlert[]
}

export const tradeCalc = (db: Db, s: Shipment, today: ISODate = todayISO()): TradeCalc =>
  memo(db, `tradeCalc:${s.id}:${today}`, () => {
    const exp = s.direction === 'export'
    const t: TradeInfo = { ...defaultTrade(s.direction), ...s.trade }
    const base = computeShipment(db, s)
    const groups = new Map<CostGroup, number>()
    for (const c of s.costs) if (!c.recoverable) groups.set(c.group || groupOf(c.type), (groups.get(c.group || groupOf(c.type)) || 0) + c.amount)
    const byGroup = (Object.keys(COST_GROUPS) as CostGroup[]).map((g) => ({ group: g, label: COST_GROUPS[g], amount: groups.get(g) || 0 })).filter((x) => x.amount > 0)
    const isLc = PAYMENT_TERMS[t.payment]?.lc ?? true
    const lcAmount = t.lc?.amount || s.usd
    const lcTk = lcAmount * s.rate
    const shippedOn = s.steps.shipped?.date || t.etd || null
    const usance = t.payment === 'lc-usance' || t.payment === 'da' ? t.usanceDays || 0 : 0
    const dueOn = usance && shippedOn ? addDays(shippedOn, usance) : null
    const arrived = exp ? !!s.steps.shipped?.date : !!(s.steps.port?.date || s.steps.warehouse?.date)
    const daysToEta = t.eta && !arrived ? daysBetween(today, t.eta) : null
    const proceedsTk = exp ? s.usd * s.rate : 0
    const realisedTk = exp ? (t.realisedFc || 0) * (t.realisedRate || s.rate) : 0
    const outstandingFc = exp ? Math.max(s.usd - (t.realisedFc || 0), 0) : 0
    const shipped = s.steps.shipped?.date
    const alerts: TradeAlert[] = []
    const add = (id: string, tone: 'warn' | 'info', text: string) => alerts.push({ id: `${s.id}:${id}`, shipmentId: s.id, tone, text })
    const lcOpen = isLc && !t.lc?.retiredOn && !(exp ? s.steps.paid?.date : s.steps.warehouse?.date)
    // the LC's dates matter until the goods are shipped and the documents presented
    if (lcOpen && !shipped && t.lc?.expiry) {
      const left = daysBetween(today, t.lc.expiry)
      if (left < 0) add('lc-expired', 'warn', `LC ${s.lcNo || ''} expired on ${fdate(t.lc.expiry)} — ask for an amendment`)
      else if (left <= 15) add('lc-expiry', 'warn', `LC ${s.lcNo || ''} expires in ${left} day${left === 1 ? '' : 's'}`)
    }
    if (lcOpen && t.lc?.lastShipment && !shipped && t.lc.lastShipment < today) add('last-ship', 'warn', `Last shipment date ${fdate(t.lc.lastShipment)} passed, not shipped — ask for an LC amendment`)
    if (daysToEta != null && daysToEta < 0) add('eta', 'warn', `${MODES[t.mode].vessel} ${t.vessel || ''} was due ${-daysToEta} day${daysToEta === -1 ? '' : 's'} ago`.replace('  ', ' '))
    else if (daysToEta != null && daysToEta <= 3) add('eta-soon', 'info', `Arrives at ${t.dischargePort || 'port'} ${daysToEta === 0 ? 'today' : `in ${daysToEta} day${daysToEta === 1 ? '' : 's'}`}`)
    if (dueOn && !t.lc?.retiredOn && daysBetween(today, dueOn) <= 10) add('due', daysBetween(today, dueOn) < 0 ? 'warn' : 'info', `Usance payment due ${fdate(dueOn)}`)
    const regime = regimeOf(db)
    const daysUnpaid = exp && shipped && outstandingFc > 0.01 ? daysBetween(shipped, today) : null
    const limit = regime.proceedsDays
    if (daysUnpaid != null && limit && daysUnpaid > limit - 30) add('proceeds', daysUnpaid > limit ? 'warn' : 'info', `${t.currency} ${outstandingFc.toLocaleString('en-IN')} export proceeds unpaid for ${daysUnpaid} days${daysUnpaid > limit ? ` — past the ${limit}-day limit` : ''}`)
    else if (daysUnpaid != null && !limit && daysUnpaid > 60) add('proceeds', daysUnpaid > 90 ? 'warn' : 'info', `${t.currency} ${outstandingFc.toLocaleString('en-IN')} still to be paid by the buyer, ${daysUnpaid} days after shipment`)
    const depositOpen = sum(s.costs.filter((c) => /deposit/i.test(c.type) && !c.refundedOn), (c) => c.amount)
    if (!exp && depositOpen > 0) {
      const out = db.imports.filter((x) => x.direction === 'export' && x.trade?.sourceImportId === s.id && x.steps.shipped?.date)
      if (out.length) add('deposit', 'info', `Re-exported on ${out.map((x) => x.id).join(', ')} — claim the customs deposit back`)
    }
    if (!exp) {
      const cc = customsCalc(db, s)
      if (cc.demurrage > 0) add('demurrage', 'warn', `Demurrage running: ${cc.overDays} day${cc.overDays === 1 ? '' : 's'} past free time`)
    }
    return {
      t, exp, regime, procedureLabel: PROCEDURES[t.procedure || 'home'].label, depositOpen, modeLabel: MODES[t.mode].label, termLabel: `${t.incoterm} · ${INCOTERMS[t.incoterm].label}`, payLabel: PAYMENT_TERMS[t.payment].label + (usance ? ` ${usance} days` : ''), isLc,
      byGroup, recoverablePaid: sum(s.costs.filter((c) => c.recoverable), (c) => c.amount), landed: base.landed, perUnit: base.perUnit,
      lcAmount, lcTk, lcMarginTk: Math.round(lcTk * (t.lc?.marginPct || 0) / 100), lcDaysLeft: isLc && t.lc?.expiry ? daysBetween(today, t.lc.expiry) : null,
      dueOn, daysToEta, late: daysToEta != null && daysToEta < 0,
      proceedsTk, realisedTk, outstandingFc, incentiveTk: regime.exportIncentive ? Math.round(proceedsTk * (t.incentivePct || 0) / 100) : 0, sourceTaxTk: regime.exportIncentive ? Math.round(realisedTk * (t.sourceTaxPct ?? 1) / 100) : 0,
      fxGain: exp && t.realisedFc && t.realisedRate ? Math.round((t.realisedRate - s.rate) * t.realisedFc) : 0, daysUnpaid, alerts,
    }
  })

/** Everything an importer or exporter should look at today, across all shipments. */
export const tradeAlerts = (db: Db, today: ISODate = todayISO()): TradeAlert[] =>
  memo(db, 'tradeAlerts:' + today, () => db.imports.flatMap((s) => tradeCalc(db, s, today).alerts).sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warn' ? -1 : 1)))

export interface TradeTotals {
  byMode: { mode: string; count: number; value: number }[]
  inTransit: number
  atPort: number
  openLcTk: number
  marginHeldTk: number
  dutyPaid: number
  recoverable: number
  exportOutstandingTk: number
  incentiveDueTk: number
}

/** Totals for the hub: where shipments are, money tied up in LCs, duty paid, export money to come. */
export const tradeTotals = (db: Db, today: ISODate = todayISO()): TradeTotals =>
  memo(db, 'tradeTotals:' + today, () => {
    const rows = db.imports.map((s) => ({ s, c: tradeCalc(db, s, today) }))
    const modes = new Map<string, { count: number; value: number }>()
    for (const r of rows) {
      const m = modes.get(r.c.modeLabel) || { count: 0, value: 0 }
      modes.set(r.c.modeLabel, { count: m.count + 1, value: m.value + r.s.usd * r.s.rate })
    }
    const imp = rows.filter((r) => !r.c.exp)
    const exp = rows.filter((r) => r.c.exp)
    const openLc = imp.filter((r) => r.c.isLc && !r.c.t.lc?.retiredOn && !r.s.steps.warehouse?.date && r.s.steps.lc?.date)
    return {
      byMode: [...modes.entries()].map(([mode, v]) => ({ mode, ...v })),
      inTransit: imp.filter((r) => r.s.steps.shipped?.date && !r.s.steps.port?.date).length,
      atPort: imp.filter((r) => r.s.steps.port?.date && !r.s.steps.customs?.date).length,
      openLcTk: sum(openLc, (r) => r.c.lcTk),
      marginHeldTk: sum(openLc, (r) => r.c.lcMarginTk),
      dutyPaid: sum(imp, (r) => sum(r.s.costs.filter((c) => (c.group || groupOf(c.type)) === 'duty' || c.recoverable), (c) => c.amount)),
      recoverable: sum(imp, (r) => r.c.recoverablePaid),
      exportOutstandingTk: sum(exp, (r) => r.c.outstandingFc * r.s.rate),
      incentiveDueTk: sum(exp.filter((r) => r.c.realisedTk > 0), (r) => r.c.incentiveTk),
    }
  })
