/**
 * Browser-only backend: the same API as the server (shared/api/core), with the records kept in this
 * browser's localStorage. Loaded on demand, only when the app is built without VITE_BACKEND=server.
 *
 * Data never leaves the device and passwords are only lightly protected. Fine for a demo or one shop
 * on one computer; use the server for many users sharing books.
 */
import { createApi, type ApiResponse, type CryptoKit, type KvStore, type TenantBooks } from '@shared/api/core'

const PREFIX = 'sbt:'
const LEGACY_KEY = 'books-local-v1'
const DEMO_PASSWORD = 'demo1234'

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  if (crypto.subtle) return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
  // plain http on a local network has no SubtleCrypto: fall back to a simple, non-secure hash
  let h = 0
  for (const b of data) h = (Math.imul(h, 31) + b) | 0
  return String(h)
}

const webCrypto: CryptoKit = {
  hashPassword: (password, salt) => sha256(salt + ':' + password),
  digest: sha256,
  randomHex: (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes))),
  equal: (a, b) => a === b,
}

class StorageFull extends Error {}

function localStore(): KvStore {
  const read = <T>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      throw new StorageFull('This browser has no room left to save. Remove the company logo, or download a backup and clear old data.')
    }
  }
  return {
    ok: true,
    kind: 'this browser',
    get: async <T>(key: string) => read<T>(key),
    set: async (key, value) => write(key, value),
    del: async (key) => localStorage.removeItem(PREFIX + key),
    list: async <T>(prefix: string) => {
      const out: { key: string; value: T }[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k?.startsWith(PREFIX + prefix)) continue
        const key = k.slice(PREFIX.length)
        const value = read<T>(key)
        if (value !== null) out.push({ key, value })
      }
      return out
    },
    cas: async (key, expectedVersion, value: TenantBooks) => {
      if ((read<TenantBooks>(key)?.version ?? null) !== expectedVersion) return false
      write(key, value)
      return true
    },
    audit: async () => undefined,
    generatedPassword: async () => undefined,
  }
}

/** Move books saved by the previous browser-only version (one big blob) into the key-per-record layout. */
async function migrateLegacy(store: KvStore) {
  type Legacy = { accounts?: Record<string, unknown>; tenants?: Record<string, unknown>; books?: Record<string, unknown> }
  const read = (): Legacy | null => {
    try {
      return JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null') as Legacy | null
    } catch {
      return null
    }
  }
  const old = read()
  if (!old) return
  for (const [id, t] of Object.entries(old.tenants || {})) await store.set('tenant:' + id, t)
  for (const [id, b] of Object.entries(old.books || {})) await store.set('books:' + id, b)
  for (const [email, a] of Object.entries(old.accounts || {})) await store.set('account:' + email, a)
  localStorage.removeItem(LEGACY_KEY)
}

const store = localStore()
const api = createApi(store, webCrypto, {
  platformEmail: 'admin@starbangla.local',
  platformPassword: DEMO_PASSWORD,
  demo: true,
  demoPassword: DEMO_PASSWORD,
  listPlatformInDemo: true,
  local: true,
})
const migrated = migrateLegacy(store)

export async function localRequest(method: string, path: string, body: unknown, token: string): Promise<ApiResponse> {
  await migrated
  const [route, query = ''] = path.split('?')
  try {
    return await api.handle({ method, path: route, query: new URLSearchParams(query), body: structuredClone(body ?? {}), token, client: 'browser' })
  } catch (e) {
    if (e instanceof StorageFull) return { status: 507, body: { error: e.message } }
    throw e
  }
}
