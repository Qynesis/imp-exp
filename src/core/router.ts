/** A small hash router: "#/factory-orders/FO-1042" → ['factory-orders', 'FO-1042']. Works on any static host. */
import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const snapshot = () => window.location.hash

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '')
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

export const go = (path: string): void => {
  window.location.hash = '/' + path
}
export const href = (path: string): string => '#/' + path
