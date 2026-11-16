import { DUTIES, customsDocs } from '../catalog'
import { daysBetween, todayISO } from '../format'
import type { CustomsInfo, CustomsStage, Db, DutyKey, ISODate, Shipment, Tone } from '../types'
import { memo, sum } from './common'

export const emptyCustoms = (): CustomsInfo => ({ stages: {}, docs: {}, rates: {} })

export function customsStages(s: Pick<Shipment, 'direction'>): [CustomsStage, string][] {
  const exp = s.direction === 'export'
  return [
    ['docs', 'Documents ready'],
    ['boe', exp ? 'Bill of Export submitted' : 'Bill of Entry submitted'],
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
  /** Assessable value. */
  av: number
  duties: DutyLine[]
  dutyTotal: number
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
    const stages = customsStages(s)
    const dates = cu.stages
    const doneCount = stages.filter(([k]) => dates[k]).length
    const next = stages.find(([k]) => !dates[k])
    const released = !!dates.release
    const cif = s.usd * s.rate + sum(s.costs.filter((c) => c.type === 'Sea freight' || c.type === 'Insurance'), (c) => c.amount)
    const av = (cu.av || 0) > 0 ? (cu.av as number) : s.direction === 'export' ? s.usd * s.rate : cif
    const r = (k: DutyKey) => (Number(cu.rates[k]) || 0) / 100
    const cd = av * r('cd')
    const rd = av * r('rd')
    const sd = (av + cd + rd) * r('sd')
    const vatBase = av + cd + rd + sd
    const amounts: Record<DutyKey, number> = { cd, rd, sd, vat: vatBase * r('vat'), ait: av * r('ait'), at: vatBase * r('at') }
    const duties = DUTIES.map(([key, label]) => ({ key, label, rate: Number(cu.rates[key]) || 0, amount: Math.round(amounts[key]) })).filter((d) => d.rate > 0)
    const docs = customsDocs(db, s).map((name) => ({ name, ok: !!cu.docs[name] }))
    const arrived = s.direction === 'export' ? s.steps.ready?.date : s.steps.port?.date
    const today = todayISO()
    const overDays = cu.freeUntil && arrived && !released ? Math.max(daysBetween(cu.freeUntil, today), 0) : 0
    return {
      cu, stages, dates, doneCount, next, released, av, duties, dutyTotal: sum(duties, (d) => d.amount), docs, docsOk: docs.filter((d) => d.ok).length,
      daysAtPort: arrived && !released ? Math.max(daysBetween(arrived, today), 0) : null,
      overDays, demurrage: overDays * (Number(cu.demurragePerDay) || 0),
      stageText: released ? 'Released' : next && doneCount ? stages[doneCount - 1][1] : 'Not started',
      tone: released ? 'good' : doneCount ? 'warn' : 'neutral',
    }
  })
