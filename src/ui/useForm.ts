import { useCallback, useState, type ChangeEvent } from 'react'

/** Keys of T whose values are text, so they can be bound to an input or select. */
export type TextKeys<T> = { [K in keyof T]-?: T[K] extends string ? K : never }[keyof T]

/**
 * Form state with helpers that wire inputs to it.
 * `bind(k)` gives value/onChange for a text input or select; `numBind(k)` also opens the number keypad on phones.
 */
export function useForm<T extends object>(init: T | (() => T)) {
  const [v, setV] = useState<T>(init)
  const set = useCallback(<K extends keyof T>(k: K, val: T[K]) => setV((s) => ({ ...s, [k]: val })), [])
  const bind = <K extends TextKeys<T>>(k: K) => ({
    className: 'in',
    value: v[k] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k, e.target.value as T[K]),
  })
  const numBind = <K extends TextKeys<T>>(k: K) => ({ ...bind(k), inputMode: 'decimal' as const, autoComplete: 'off' })
  return [v, set, bind, numBind] as const
}

export type FormSetter<T> = <K extends keyof T>(k: K, val: T[K]) => void
export type FormBinder<T> = <K extends TextKeys<T>>(k: K) => {
  className: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  inputMode?: 'decimal'
  autoComplete?: string
}
