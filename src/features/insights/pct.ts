/** A share as a percentage, or a dash when there is none. */
export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`)
