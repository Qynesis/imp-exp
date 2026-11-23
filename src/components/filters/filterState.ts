import { useState } from 'react'

/** Filter values kept together, with a count of the ones in use and a reset. */
export function useFilters<T extends Record<string, string>>(init: T) {
  const [v, setV] = useState<T>(init)
  const set = <K extends keyof T>(k: K, x: T[K]) => setV((s) => ({ ...s, [k]: x }))
  const active = (Object.keys(init) as (keyof T)[]).filter((k) => v[k] !== init[k]).length
  return { v, set, active, reset: () => setV(init) }
}
