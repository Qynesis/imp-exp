import { byId, MODES, PAYMENT_TERMS, shipmentCalc, siteLabel, siteStock, stepKeys, stepLabel, tradeCalc, type Db, type Shipment, type StepKey, type TradePayment, type TransportMode } from '@shared/domain'
import type { Opt } from '@/components/filters/Filters'

export const SHIP_FILTER = { dir: 'all', state: 'all', step: '', mode: '', country: '', party: '', pay: '', bank: '', site: '', from: '', to: '', late: '' }
export type ShipFilter = typeof SHIP_FILTER

/** The day a shipment started: LC opened or contract signed, else its earliest dated step. */
export const startedOn = (s: Shipment): string => s.steps.lc?.date || s.steps.contract?.date || Object.values(s.steps).map((x) => x?.date).filter((x): x is string => !!x).sort()[0] || ''

const uniq = (xs: string[]): Opt[] => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((x) => ({ value: x, label: x }))

/** The choices each filter offers, taken from the shipments in the books. */
export function shipmentFilterOptions(db: Db) {
  const all = db.imports
  const steps = (dir: 'import' | 'export') => stepKeys({ direction: dir }).map((k) => ({ value: `${dir}:${k}`, label: stepLabel(k, { direction: dir, country: '', customs: undefined }) }))
  return {
    steps: [{ label: 'Imports waiting for', options: steps('import') }, { label: 'Exports waiting for', options: steps('export') }],
    modes: (Object.keys(MODES) as TransportMode[]).filter((m) => all.some((s) => (s.trade?.mode || 'sea') === m)).map((m) => ({ value: m, label: MODES[m].label })),
    countries: uniq(all.map((s) => s.country)),
    parties: uniq(all.map((s) => s.supplier)),
    pays: (Object.keys(PAYMENT_TERMS) as TradePayment[]).filter((p) => all.some((s) => s.trade?.payment === p)).map((p) => ({ value: p, label: PAYMENT_TERMS[p].label })),
    banks: uniq(all.flatMap((s) => [s.bank, s.trade?.lc?.issuingBank || ''])),
    sites: siteStock(db).sites.map((w) => ({ value: w.id, label: siteLabel(w) })),
  }
}

/** Whether a shipment passes the filters and the search words. */
export function matchShipment(db: Db, s: Shipment, f: ShipFilter, q: string): boolean {
  const exp = s.direction === 'export'
  if (f.dir !== 'all' && (f.dir === 'export') !== exp) return false
  const c = shipmentCalc(db, s)
  if (f.state === 'open' && !c.next) return false
  if (f.state === 'done' && c.next) return false
  if (f.step) {
    const [dir, key] = f.step.split(':')
    if ((dir === 'export') !== exp || c.next !== (key as StepKey)) return false
  }
  const t = s.trade
  if (f.mode && (t?.mode || 'sea') !== f.mode) return false
  if (f.country && s.country.trim() !== f.country) return false
  if (f.party && s.supplier.trim() !== f.party) return false
  if (f.pay && t?.payment !== f.pay) return false
  if (f.bank && s.bank.trim() !== f.bank && (t?.lc?.issuingBank || '').trim() !== f.bank) return false
  if (f.site) {
    if (exp || !s.steps.warehouse?.date) return false
    const st = siteStock(db)
    if ((byId(st.sites, s.siteId)?.id || st.mainId) !== f.site) return false
  }
  const day = startedOn(s)
  if (f.from && (!day || day < f.from)) return false
  if (f.to && (!day || day > f.to)) return false
  if (f.late && !tradeCalc(db, s).alerts.some((a) => a.tone === 'warn')) return false
  const n = q.trim().toLowerCase()
  return !n || `${s.id} ${s.supplier} ${s.country} ${s.lcNo} ${s.bank} ${c.productName} ${s.customs?.hsCode || ''} ${t?.docNo || ''} ${t?.vessel || ''} ${t?.containers.map((x) => x.no).join(' ') || ''} ${Object.values(s.steps).map((x) => x?.note || '').join(' ')}`.toLowerCase().includes(n)
}
