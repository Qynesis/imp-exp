import { customsDocs } from '../catalog'
import { INCOTERMS, REGIMES, regimeDocs, regimeOf, tradeDocs, type Regime } from '../tradeCatalog'
import { daysBetween, todayISO } from '../format'
import type { CustomsInfo, CustomsProcedure, CustomsStage, Db, DutyKey, ISODate, Shipment, Tone } from '../types'
import { memo, sum } from './common'

export const emptyCustoms = (): CustomsInfo => ({ stages: {}, docs: {}, rates: {} })

export function customsStages(s: Pick<Shipment, 'direction'>, regime: Regime = REGIMES.BD): [CustomsStage, string][] {
  const exp = s.direction === 'export'
  return [
    ['docs', 'Documents ready'],
    ['boe', `${exp ? regime.exportName : regime.entryName} submitted`],
    ['assess', 'Assessment done'],
    ['duty', exp ? 'Export charges paid' : 'Duty and taxes paid'],
    ['exam', 'Goods examined'],
    ['release', 'Released by customs'],
  ]
}

export interface DutyLine {
  key: DutyKey
  label: string
  rate: number
  amount: number
}
export interface CustomsCalc {
  cu: CustomsInfo
  stages: [CustomsStage, string][]
  dates: Partial<Record<CustomsStage, ISODate>>
  doneCount: number
  next: [CustomsStage, string] | undefined
  released: boolean
  /** Valuation: invoice, freight and insurance in Tk, CIF, the 1% landing charge, and the assessable value. */
  invoiceTk: number
  freightTk: number
  insuranceTk: number
  /** Insurance was not known, so customs' 1% rule was used. */
  insuranceAssumed: boolean
  cif: number
  landing: number
  av: number
  /** Duties that stay in the goods' cost (CD, RD, SD) and taxes claimed back (VAT, AT, AIT). */
  costDuty: number
  recoverable: number
  /** Total tax incidence: all duty and tax as a share of the assessable value, percent. */
  tti: number
  duties: DutyLine[]
  dutyTotal: number
  /** Free zone or transit: duty and VAT are not payable while the goods stay there. */
  suspended: boolean
  /** Re-export: duty held as a refundable deposit instead of paid. */
  deposit: number
  regime: Regime
  docs: { name: string; ok: boolean }[]
  docsOk: number
  daysAtPort: number | null
  overDays: number
  demurrage: number
  stageText: string
  tone: Tone
}

/**
 * Bangladesh customs order of calculation: CD and RD on the assessable value, SD on value plus CD and RD,
 * VAT and AT on value plus CD, RD and SD, AIT on the assessable value. An estimate until customs assesses.
 */
export const customsCalc = (db: Db, s: Shipment): CustomsCalc =>
  memo(db, 'customs:' + s.id, () => {
    const cu = { ...emptyCustoms(), ...s.customs }
    const stages = customsStages(s, regimeOf(db))
    const dates = cu.stages
    const doneCount = stages.filter(([k]) => dates[k]).length
    const next = stages.find(([k]) => !dates[k])
    const released = !!dates.release
    const t = s.trade
    const invoiceTk = s.usd * s.rate
    const term = t ? INCOTERMS[t.incoterm] : null
    const costOf = (re: RegExp) => sum(s.costs.filter((c) => re.test(c.type)), (c) => c.amount)
    // freight and insurance count only when the terms leave them to us; otherwise they are in the invoice
    const freightTk = term?.freight === 'seller' ? 0 : t?.freight != null ? t.freight * s.rate : costOf(/freight/i)
    const knownIns = t?.insurance != null ? t.insurance * s.rate : costOf(/^insurance/i)
    const regime = regimeOf(db)
    const insuranceAssumed = term?.insurance !== 'seller' && !knownIns && s.direction !== 'export' && regime.insurancePct > 0
    const insuranceTk = term?.insurance === 'seller' ? 0 : knownIns || (insuranceAssumed ? (invoiceTk + freightTk) * (regime.insurancePct / 100) : 0)
    const q = dutyQuote({ invoiceTk, freightTk, insuranceTk, exportShipment: s.direction === 'export', rates: cu.rates, avOverride: cu.av, regime, procedure: t?.procedure })
    const { cif, landing, av, duties } = q
    const docs = [...new Set([...(s.trade ? tradeDocs(s.direction, s.trade, regimeOf(db).code === 'BD') : []), ...regimeDocs(regimeOf(db), s.direction, s.trade || {}), ...(regimeOf(db).code === 'BD' ? customsDocs(db, s) : [])])].map((name) => ({ name, ok: !!cu.docs[name] }))
    const arrived = s.direction === 'export' ? s.steps.ready?.date : s.steps.port?.date
    const today = todayISO()
    const overDays = cu.freeUntil && arrived && !released ? Math.max(daysBetween(cu.freeUntil, today), 0) : 0
    const dutyTotal = q.dutyTotal
    return {
      cu, stages, dates, doneCount, next, released, invoiceTk, freightTk: Math.round(freightTk), insuranceTk: Math.round(insuranceTk), insuranceAssumed, cif: Math.round(cif), landing: Math.round(landing), av: Math.round(av),
      duties, dutyTotal, costDuty: q.costDuty, recoverable: q.recoverable, tti: q.tti, suspended: q.suspended, deposit: q.deposit, regime, docs, docsOk: docs.filter((d) => d.ok).length,
      daysAtPort: arrived && !released ? Math.max(daysBetween(arrived, today), 0) : null,
      overDays, demurrage: overDays * (Number(cu.demurragePerDay) || 0),
      stageText: released ? 'Released' : next && doneCount ? stages[doneCount - 1][1] : 'Not started',
      tone: released ? 'good' : doneCount ? 'warn' : 'neutral',
    }
  })

export interface DutyQuote {
  cif: number; landing: number; av: number; duties: DutyLine[]
  /** What has to be paid now (0 when suspended; the deposit for re-export). */
  dutyTotal: number
  costDuty: number; recoverable: number; tti: number
  suspended: boolean
  deposit: number
}

/**
 * Import duty from values in home currency, by the company's customs regime.
 * Bangladesh: CIF + 1% landing = AV; CD, RD on AV; SD on AV + CD + RD; VAT, AT on AV + CD + RD + SD; AIT on AV.
 * UAE / GCC and others: CIF = AV; customs duty and excise on AV; VAT on AV + duty + excise.
 * Free zone and transit suspend duty and VAT; re-export holds the duty as a refundable deposit.
 */
export function dutyQuote(p: {
  invoiceTk: number; freightTk: number; insuranceTk: number; exportShipment?: boolean; rates: Partial<Record<DutyKey, number>>; avOverride?: number
  regime?: Regime; procedure?: CustomsProcedure
}): DutyQuote {
  const regime = p.regime || REGIMES.BD
  const cif = p.invoiceTk + p.freightTk + p.insuranceTk
  const landing = p.exportShipment ? 0 : cif * (regime.landingPct / 100)
  const av = (p.avOverride || 0) > 0 ? (p.avOverride as number) : p.exportShipment ? p.invoiceTk : cif + landing
  const r = (k: DutyKey) => (Number(p.rates[k]) || 0) / 100
  const amounts: Partial<Record<DutyKey, number>> = {}
  if (regime.code === 'BD') {
    const cd = av * r('cd')
    const rd = av * r('rd')
    const sd = (av + cd + rd) * r('sd')
    const vatBase = av + cd + rd + sd
    Object.assign(amounts, { cd, rd, sd, vat: vatBase * r('vat'), ait: av * r('ait'), at: vatBase * r('at') })
  } else {
    const cd = av * r('cd')
    const excise = av * r('excise')
    Object.assign(amounts, { cd, excise, vat: (av + cd + excise) * r('vat') })
  }
  const duties = regime.duties.map(([key, label]) => ({ key, label, rate: Number(p.rates[key]) || 0, amount: Math.round(amounts[key] || 0) })).filter((d) => d.rate > 0)
  const all = sum(duties, (d) => d.amount)
  const suspended = !p.exportShipment && (p.procedure === 'freezone' || p.procedure === 'transit')
  const reexport = !p.exportShipment && p.procedure === 'reexport'
  const deposit = reexport ? sum(duties.filter((d) => d.key === 'cd' || d.key === 'excise'), (d) => d.amount) : 0
  const rec = sum(duties.filter((d) => regime.recoverable.includes(d.key)), (d) => d.amount)
  return {
    cif: Math.round(cif), landing: Math.round(landing), av: Math.round(av), duties,
    dutyTotal: suspended ? 0 : reexport ? deposit : all,
    costDuty: suspended || reexport ? 0 : all - rec,
    recoverable: suspended || reexport ? 0 : rec,
    tti: av ? Math.round((all / av) * 1000) / 10 : 0, suspended, deposit,
  }
}
