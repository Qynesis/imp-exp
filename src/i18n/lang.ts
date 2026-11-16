import { useSyncExternalStore } from 'react'

export type Lang = 'en' | 'bn'
const KEY = 'sbt:lang'
const listeners = new Set<() => void>()

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === 'bn' ? 'bn' : 'en'
  } catch {
    return 'en'
  }
}
let current: Lang = read()

/** The dictionary is a separate chunk, downloaded only by people who read the app in Bangla. */
const translator = () => import('./translator')

function apply(lang: Lang) {
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en'
  document.documentElement.classList.toggle('lang-bn', lang === 'bn')
  void translator().then((t) => {
    // the language may have changed again while the chunk was loading
    if (current !== lang) return
    if (lang === 'bn') t.startTranslating()
    else t.stopTranslating()
  })
}

/** Call once at start-up, before the app renders. */
export const initLang = (): void => apply(current)

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // private window or blocked storage: the choice lasts for this visit only
  }
  apply(lang)
  listeners.forEach((l) => l())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
