import type { Db, Product, Shipment, StepKey, Tone } from '../types'
import { byId, memo, sum } from './common'

const IMPORT_STEPS: StepKey[] = ['lc', 'shipped', 'port', 'customs', 'warehouse']
const EXPORT_STEPS: StepKey[] = ['contract', 'ready', 'customs', 'shipped', 'paid']
export const stepKeys = (s: Pick<Shipment, 'direction'>): StepKey[] => (s.direction === 'export' ? EXPORT_STEPS : IMPORT_STEPS)

export function stepLabel(key: StepKey, s: Pick<Shipment, 'direction' | 'country' | 'customs'> & { trade?: Shipment['trade'] }): string {
  const exp = s.direction === 'export'
  const labels: Record<StepKey, string> = {
    lc: !s.trade || s.trade.payment.startsWith('lc') ? 'LC opened at bank' : s.trade.payment === 'tt-advance' ? 'TT sent in advance' : 'Order confirmed',
    contract: !s.trade || s.trade.payment.startsWith('lc') ? 'Export LC or contract received' : 'Order / contract received',
    ready: 'Goods ready and packed',
    shipped: exp ? `Shipped to ${s.country || 'buyer'}` : `Shipped from ${s.country || 'origin'}`,
    port: `Arrived at ${s.customs?.port || 'port'}`,
    customs: exp ? 'Export customs cleared' : 'Customs cleared',
    warehouse: 'Received in warehouse',
    paid: 'Payment realised at bank',
  }
  return labels[key]
}

const STATUS: Record<StepKey, [string, Tone]> = {
  lc: ['LC opened', 'info'], shipped: ['Shipped', 'info'], port: ['At port', 'warn'], customs: ['Cleared', 'good'], warehouse: ['Received', 'good'],
  contract: ['Contract received', 'info'], ready: ['Goods ready', 'info'], paid: ['Payment realised', 'good'],
}

export interface ShipmentCalc {
  exp: boolean
  keys: StepKey[]
  /** Invoice value in Tk. */
  invoiceTk: number
  /** Freight, duty and other costs added so far. */
  extra: number
  /** Imports: invoice value plus costs. Exports: costs only. */
  landed: number
  /** Exports: cost of the goods sent. */
  goodsCost: number
  /** Exports: value less costs and cost of goods. */
  margin: number
  perUnit: number
  status: string
  tone: Tone
  next: StepKey | undefined
  product: Product | undefined
  productName: string
}

/** Uncached; for use inside changes to the books, where the document is still being edited. */
export function computeShipment(db: Db, s: Shipment): ShipmentCalc {
  const exp = s.direction === 'export'
  const keys = stepKeys(s)
  const invoiceTk = s.usd * s.rate
  // VAT, AT and AIT claimed back are not part of what the goods cost
  const extra = sum(s.costs.filter((c) => !c.recoverable), (c) => c.amount)
  const product = s.productId ? byId(db.products, s.productId) : undefined
  const done = keys.filter((k) => s.steps[k]?.date)
  const last = done[done.length - 1]
  let status: [string, Tone] = last ? STATUS[last] : ['Planned', 'neutral']
  if (exp && last === 'customs') status = ['Cleared', 'info']
  if (exp && last === 'shipped') status = ['Shipped', 'warn']
  // a re-export costs what the goods landed at on the import they came in on
  const source = exp && s.trade?.sourceImportId ? db.imports.find((x) => x.id === s.trade?.sourceImportId && x.direction !== 'export') : undefined
  const sourceUnit = source ? computeShipment(db, source).perUnit : undefined
  const goodsCost = exp ? s.qty * (s.unitCost ?? sourceUnit ?? product?.cost ?? 0) : 0
  const landed = exp ? extra : invoiceTk + extra
  return {
    exp, keys, invoiceTk, extra, landed, goodsCost, margin: exp ? invoiceTk - extra - goodsCost : 0,
    perUnit: s.qty > 0 ? landed / s.qty : 0, status: status[0], tone: status[1],
    next: keys.find((k) => !s.steps[k]?.date), product, productName: product?.name || s.productName || 'Goods',
  }
}

export const shipmentCalc = (db: Db, s: Shipment): ShipmentCalc => memo(db, 'ship:' + s.id, () => computeShipment(db, s))
