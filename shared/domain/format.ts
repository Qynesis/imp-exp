import type { ISODate, MonthKey } from './types'

import type { Currency } from './types'

/** How money is shown: set once from the company's country (Taka with lakh grouping unless changed). */
const money = { symbol: 'Tk', nf: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }), lakh: true }
export function setMoney(c: Pick<Currency, 'symbol' | 'grouping'> | undefined): void {
  const lakh = (c?.grouping || 'lakh') === 'lakh'
  const symbol = c?.symbol || 'Tk'
  if (symbol === money.symbol && lakh === money.lakh) return
  money.symbol = symbol
  money.lakh = lakh
  money.nf = new Intl.NumberFormat(lakh ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })
}
export const moneySymbol = (): string => money.symbol
/** Number with the company's digit grouping: 1,20,000 (lakh) or 120,000. */
export const fmt = (n: number | null | undefined): string => money.nf.format(Math.round((Number(n) || 0) * 100) / 100)
/** Money amount in the company's currency: Tk 1,20,000, $120,000, ¥120,000. */
export const tk = (n: number | null | undefined): string => {
  const v = Number(n) || 0
  const sign = v < 0 ? '−' : ''
  const s = money.symbol
  // one-character symbols sit against the number ($120), word symbols get a space (Tk 1,20,000, AED 5,000)
  return sign + (s.length === 1 ? s : s + ' ') + fmt(Math.abs(v))
}
/** Parse what a person typed ("1,20,000", "", "12.5") into a number; anything unreadable is 0. */
export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
export const plural = (n: number, word: string): string => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export const todayISO = (): ISODate => iso(new Date())
export const thisMonth = (): MonthKey => todayISO().slice(0, 7)
export const addDays = (s: ISODate, n: number): ISODate => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: ISODate, b: ISODate): number => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
export const addMonths = (key: MonthKey, n: number): MonthKey => {
  const d = parse(key + '-01')
  d.setMonth(d.getMonth() + n)
  return iso(d).slice(0, 7)
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** 05 Nov 2026 */
export const fdate = (s: ISODate | null | undefined): string => {
  if (!s) return ''
  const d = parse(s)
  return `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`
}
/** "today", or 05 Nov */
export const fshort = (s: ISODate | null | undefined): string => {
  if (!s) return ''
  if (s === todayISO()) return 'today'
  const d = parse(s)
  return `${pad(d.getDate())} ${MON[d.getMonth()]}`
}
/** Sunday, 15 November 2026 */
export const flong = (s: ISODate): string => {
  const d = parse(s)
  return `${DAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`
}
/** November 2026 */
export const fmonth = (key: MonthKey): string => {
  const d = parse(key + '-01')
  return `${MONTH[d.getMonth()]} ${d.getFullYear()}`
}

/** Short amount in the Bangladeshi style: 950, 12.5K, 3.4 L (lakh), 1.25 Cr (crore). */
export function compact(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  const trim = (x: number, d: number) => String(Number(x.toFixed(d)))
  if (money.lakh) {
    if (a >= 1e7) return `${sign}${trim(a / 1e7, 2)} Cr`
    if (a >= 1e5) return `${sign}${trim(a / 1e5, 1)} L`
  } else {
    if (a >= 1e9) return `${sign}${trim(a / 1e9, 2)}B`
    if (a >= 1e6) return `${sign}${trim(a / 1e6, 2)}M`
  }
  if (a >= 1e3) return `${sign}${trim(a / 1e3, 1)}K`
  return sign + fmt(a)
}
export const tkShort = (n: number): string => (money.symbol.length === 1 ? money.symbol : money.symbol + ' ') + compact(n)
/** "Nov" for a month key or a 0-based month index. */
export const monShort = (m: MonthKey | number): string => MON[typeof m === 'number' ? m : parse(m + '-01').getMonth()]
/** "Mon 2 Nov" */
export const fday = (s: ISODate): string => {
  const d = parse(s)
  return `${DAY[d.getDay()].slice(0, 3)} ${d.getDate()} ${MON[d.getMonth()]}`
}
export const daysInMonth = (key: MonthKey): number => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
