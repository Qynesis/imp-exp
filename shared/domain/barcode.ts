/**
 * Barcodes: Code 128, which every USB, Bluetooth and phone scanner reads and which holds letters and
 * digits. A unit label carries the product's barcode; a carton label adds "*qty" (e.g. "2001234567890*24"),
 * so one scan counts the whole carton. Bill and delivery numbers are printed as barcodes too, so a
 * returns desk can scan the challan to find the bill.
 */
import type { Db, Product } from './types'

/** Bar and space widths for Code 128 values 0..106 (106 is the stop pattern). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const START_C = 105
const STOP = 106

/** Code values for a text: Code C (two digits per symbol) for even runs of digits, otherwise Code B. */
export function code128Values(text: string): number[] {
  const digitsOnly = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4
  let values: number[]
  if (digitsOnly) {
    values = [START_C]
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)))
  } else {
    values = [START_B]
    for (const ch of text) {
      const c = ch.charCodeAt(0)
      if (c < 32 || c > 126) throw new Error('Barcodes can hold letters, digits and simple signs only')
      values.push(c - 32)
    }
  }
  const check = values.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103
  return [...values, check, STOP]
}

/** Module widths (bar, space, bar, …) for the whole symbol, without quiet zones. */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => PATTERNS[v].split('').map(Number))
}

/** SVG path for the bars, one unit per module, `height` tall. Returns the path and the total width in modules. */
export function code128Path(text: string, height = 50): { d: string; width: number } {
  let x = 0
  const parts: string[] = []
  code128Widths(text).forEach((w, i) => {
    if (i % 2 === 0) parts.push(`M${x} 0h${w}v${height}h-${w}z`)
    x += w
  })
  return { d: parts.join(''), width: x }
}

/** What is printed and scanned for a product: its own barcode, else its code, else its id. */
export const productBarcode = (p: Pick<Product, 'barcode' | 'code' | 'id'>): string => (p.barcode || p.code || p.id).trim()

/** EAN-13 check digit for 12 digits. */
const ean13Check = (d12: string) => {
  const s = d12.split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0)
  return String((10 - (s % 10)) % 10)
}
/** A new in-store barcode (EAN-13 in the 20-29 range kept for internal use), not used by any product yet. */
export function newBarcode(db: Db): string {
  const used = new Set(db.products.map((p) => p.barcode).filter(Boolean))
  for (let n = db.products.length + 1; ; n++) {
    const body = '20' + String(n).padStart(10, '0')
    const code = body + ean13Check(body)
    if (!used.has(code)) return code
  }
}

export interface ScanHit {
  product: Product
  qty: number
  /** The label was a carton label. */
  carton: boolean
}
/**
 * Read what a scanner typed. "CODE" is one unit; "CODE*24" is a carton (or lot) of 24. Matches the
 * product barcode or code, ignoring case and spaces. Archived products are found too, for returns.
 */
export function readScan(db: Db, text: string): ScanHit | null {
  const raw = text.trim()
  if (!raw) return null
  const [code, qtyText] = raw.split('*')
  const key = code.replace(/\s+/g, '').toLowerCase()
  const product = db.products.find((p) => productBarcode(p).replace(/\s+/g, '').toLowerCase() === key) || db.products.find((p) => p.code && p.code.replace(/\s+/g, '').toLowerCase() === key)
  if (!product) return null
  const n = Number(qtyText)
  return { product, qty: Number.isFinite(n) && n > 0 ? n : 1, carton: !!qtyText }
}
