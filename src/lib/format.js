const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
export const fmt = (n) => nf.format(Math.round((Number(n) || 0) * 100) / 100)
export const tk = (n) => 'Tk ' + fmt(n)
export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const pad = (n) => String(n).padStart(2, '0')
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}
export const todayISO = () => iso(new Date())
export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
// whole days from a to b (positive when b is later)
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const fdate = (s) => {
  if (!s) return ''
  const d = parse(s)
  return `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`
}
export const fshort = (s) => {
  if (!s) return ''
  if (s === todayISO()) return 'today'
  const d = parse(s)
  return `${pad(d.getDate())} ${MON[d.getMonth()]}`
}
export const flong = (s) => {
  const d = parse(s)
  return `${DAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`
}
export const fmonth = (key) => {
  const d = parse(key + '-01')
  return `${MONTH[d.getMonth()]} ${d.getFullYear()}`
}
export const addMonths = (key, n) => {
  const d = parse(key + '-01')
  d.setMonth(d.getMonth() + n)
  return iso(d).slice(0, 7)
}
export const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`
