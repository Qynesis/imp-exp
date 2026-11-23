import { fmt, tk, type Shipment, type ShipmentCalc, type StepKey } from '@shared/domain'

/** What confirming a step will do, in words. */
export function stepMessage(s: Shipment, c: ShipmentCalc, key: StepKey): string {
  if (c.product && !c.exp && key === 'warehouse') return `${fmt(s.qty)} ${s.unit} of ${c.productName} will be added to warehouse stock at the landed cost of ${tk(c.perUnit)} per unit.`
  if (c.product && c.exp && key === 'shipped') return `${fmt(s.qty)} ${s.unit} of ${c.productName} will leave warehouse stock.`
  if (key === 'paid') return `${tk(c.invoiceTk)} counts as received export proceeds. To record part payments or the bank’s rate, use Money received instead.`
  return 'The date and your note are kept with the shipment, and the next step opens.'
}
