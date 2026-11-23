/** Demo notes on shipment steps and customs stages, so the step popups and cards have something to show. */
import type { CustomsStage, Db, StepKey } from './types'

const IMPORT: Partial<Record<StepKey, (no: string) => string>> = {
  lc: (no) => `${no || 'LC'} opened at sight, 10% margin paid. Swift copy sent to the supplier.`,
  shipped: () => 'On board, B/L received by email. 1 × 40ft container, seal checked on the photos.',
  port: () => 'Berthed at the jetty. IGM done, free time 4 days from discharge.',
  customs: () => 'Assessment accepted at declared value. Duty paid through Sonali Bank, out-pass collected.',
  warehouse: () => 'Unloaded at gate 2. Cartons counted against the packing list — no shortage.',
}
const EXPORT: Partial<Record<StepKey, (no: string) => string>> = {
  contract: (no) => `${no || 'Contract'} signed by the buyer; 30% advance asked on the PI.`,
  ready: () => 'Packed and palletised. Pre-shipment inspection passed.',
  customs: () => 'Shipping bill assessed and goods examined; let export order issued.',
  shipped: () => 'Loaded, B/L issued. Documents sent to the bank for collection.',
  paid: () => 'Proceeds credited by the bank at the day’s rate.',
}
const STAGES: Partial<Record<CustomsStage, string>> = {
  docs: 'Invoice, packing list, B/L and LC copy handed to the C&F agent.',
  boe: 'Bill of Entry lodged online; lane assigned.',
  assess: 'HS code accepted. Value assessed as declared.',
  duty: 'Duty and VAT paid; challan copy filed with the shipment.',
  exam: 'Scan only, no physical check needed.',
  release: 'Release order issued; truck booked for the next morning.',
}

export function addStepNotes(db: Db, by: string, customsBy = by): void {
  for (const s of db.imports) {
    const text = s.direction === 'export' ? EXPORT : IMPORT
    for (const [k, st] of Object.entries(s.steps) as [StepKey, NonNullable<(typeof s.steps)[StepKey]>][]) {
      if (!st?.date || st.note) continue
      const f = text[k]
      if (f) Object.assign(st, { note: f(s.lcNo || ''), by: k === 'customs' || k === 'port' ? customsBy : by })
    }
    const cu = s.customs
    if (!cu) continue
    for (const [k, date] of Object.entries(cu.stages) as [CustomsStage, string | undefined][]) {
      if (!date || cu.stageNotes?.[k] || !STAGES[k]) continue
      cu.stageNotes = { ...cu.stageNotes, [k]: { note: STAGES[k], by: customsBy } }
    }
  }
}
