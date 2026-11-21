/**
 * VAT / GST / sales tax: what was charged on sales (output), what was paid on purchases and at import
 * customs (input, which can usually be set off), what was paid to the government, and what is still owed.
 */
import { countryByCode, isConsumptionTax, TAX_KINDS } from '../countries'
import type { Db, ISODate, TaxKind, TaxRate } from '../types'
import { memo, sum } from './common'
import { customsCalc } from './customs'
import { invTaxLines } from './dealers'

export const taxRates = (db: Db): TaxRate[] => db.taxRates || []
export const taxSettings = (db: Db) => {
  const t = db.company.tax
  const c = countryByCode(t?.country)
  return {
    country: t?.country || 'BD', countryName: c.name, currency: t?.currency || c.currency, taxNo: t?.taxNo || '',
    taxNoLabel: c.taxNoLabel, taxName: c.taxName, salesDefault: t?.salesDefault || [], pricesIncludeTax: !!t?.pricesIncludeTax,
  }
}

export interface TaxLine {
  date: ISODate
  ref: string
  details: string
  name: string
  kind: TaxKind
  amount: number
}

export interface TaxReport {
  from: ISODate
  to: ISODate
  /** Charged on sales. */
  output: TaxLine[]
  /** Paid on purchases and at import customs; can be set off against output. */
  input: TaxLine[]
  /** Income tax taken in advance (import AIT, withholding on purchases). */
  advance: TaxLine[]
  /** Paid to the government. */
  paid: { date: ISODate; ref: string; kind: TaxKind; amount: number; period: string; id: string }[]
  outputTotal: number
  inputTotal: number
  advanceTotal: number
  paidTotal: number
  /** Output less input for the period. */
  net: number
  /** Everything up to `to`: output − input − paid (positive: owed to the government). */
  balance: number
  byName: { name: string; kind: TaxKind; output: number; input: number }[]
}

function lines(db: Db, from: ISODate, to: ISODate) {
  const output: TaxLine[] = []
  const input: TaxLine[] = []
  const advance: TaxLine[] = []
  for (const inv of db.invoices) {
    if (inv.status !== 'final' || inv.sample || inv.date < from || inv.date > to) continue
    for (const t of invTaxLines(inv)) {
      if (!t.amount) continue
      const line = { date: inv.date, ref: inv.id, details: `Sale bill ${inv.id}${t.inclusive ? ' (in price)' : ''}`, name: t.name, kind: t.kind, amount: t.amount }
      if (isConsumptionTax(t.kind)) output.push(line)
      else advance.push(line)
    }
  }
  for (const p of db.purchases) {
    if (!p.tax || p.date < from || p.date > to) continue
    input.push({ date: p.date, ref: p.billNo || p.id, details: `Purchase ${p.billNo || ''}`.trim(), name: 'VAT on purchases', kind: 'vat', amount: p.tax })
  }
  for (const s of db.imports) {
    if (s.direction === 'export') continue
    const c = customsCalc(db, s)
    const day = c.dates.release
    if (!day || day < from || day > to) continue
    for (const d of c.duties) {
      if (d.key === 'vat' || d.key === 'at') input.push({ date: day, ref: s.id, details: `Import ${s.id}: ${d.label}`, name: `Import ${d.label}`, kind: 'vat', amount: d.amount })
      if (d.key === 'ait') advance.push({ date: day, ref: s.id, details: `Import ${s.id}: ${d.label}`, name: d.label, kind: 'withholding', amount: d.amount })
    }
  }
  return { output, input, advance }
}

export const taxReport = (db: Db, from: ISODate, to: ISODate): TaxReport =>
  memo(db, `tax:${from}:${to}`, () => {
    const { output, input, advance } = lines(db, from, to)
    const pays = (db.taxPayments || []).filter((p) => p.date >= from && p.date <= to)
    const all = lines(db, '0000-01-01', to)
    const paidAll = sum((db.taxPayments || []).filter((p) => p.date <= to && isConsumptionTax(p.kind)), (p) => p.amount)
    const names = new Map<string, { name: string; kind: TaxKind; output: number; input: number }>()
    for (const l of output) names.set(l.name, { ...(names.get(l.name) || { name: l.name, kind: l.kind, output: 0, input: 0 }), output: (names.get(l.name)?.output || 0) + l.amount })
    for (const l of input) names.set(l.name, { ...(names.get(l.name) || { name: l.name, kind: l.kind, output: 0, input: 0 }), input: (names.get(l.name)?.input || 0) + l.amount })
    const r2 = (n: number) => Math.round(n * 100) / 100
    return {
      from, to, output, input, advance,
      paid: pays.map((p) => ({ date: p.date, ref: p.ref, kind: p.kind, amount: p.amount, period: p.period, id: p.id })),
      outputTotal: r2(sum(output, (l) => l.amount)), inputTotal: r2(sum(input, (l) => l.amount)), advanceTotal: r2(sum(advance, (l) => l.amount)),
      paidTotal: r2(sum(pays, (p) => p.amount)),
      net: r2(sum(output, (l) => l.amount) - sum(input, (l) => l.amount)),
      balance: r2(sum(all.output, (l) => l.amount) - sum(all.input, (l) => l.amount) - paidAll),
      byName: [...names.values()],
    }
  })

export const taxKindLabel = (k: TaxKind) => TAX_KINDS[k]
