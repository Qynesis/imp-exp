import type { Dated } from '../types'

export const byId = <T extends { id: string }>(list: readonly T[], id: string | null | undefined): T | undefined =>
  id ? list.find((x) => x.id === id) : undefined

/** Like byId, for places where a missing record is a programming error. */
export function mustFind<T extends { id: string }>(list: readonly T[], id: string, what: string): T {
  const x = byId(list, id)
  if (!x) throw new Error(`${what} ${id} not found`)
  return x
}

export const sum = <T>(list: readonly T[], f: (x: T) => number): number => list.reduce((s, x) => s + f(x), 0)

/** Oldest first; records on the same day keep the order they were made in. */
export const byDateTs = (a: Dated, b: Dated): number => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1)
export const newestFirst = (a: Dated, b: Dated): number => -byDateTs(a, b)

/**
 * Results cached per version of the books. Every change makes a new `Db` object, so a result
 * computed for one object stays valid for as long as that object is on screen, and old caches
 * are garbage collected with the object.
 */
const caches = new WeakMap<object, Map<string, unknown>>()
export function memo<T>(db: object, key: string, compute: () => T): T {
  let cache = caches.get(db)
  if (!cache) caches.set(db, (cache = new Map()))
  if (cache.has(key)) return cache.get(key) as T
  const value = compute()
  cache.set(key, value)
  return value
}
