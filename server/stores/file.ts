/** Keeps every record as a small JSON file in a folder. For your own computer or a single server. */
import fs from 'node:fs'
import path from 'node:path'
import type { KvStore, TenantBooks } from '../../shared/api/core'

export function fileStore(dir: string): KvStore {
  fs.mkdirSync(dir, { recursive: true })
  const file = (key: string) => path.join(dir, encodeURIComponent(key) + '.json')
  const read = <T>(key: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(file(key), 'utf8')) as T
    } catch {
      return null
    }
  }
  const write = (key: string, value: unknown) => {
    const f = file(key)
    const tmp = `${f}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value))
    fs.renameSync(tmp, f) // atomic: a crash never leaves a half-written file
  }

  migrateLegacy(dir, write)

  return {
    ok: true,
    kind: 'files in ' + dir,
    get: async <T>(key: string) => read<T>(key),
    set: async (key, value) => write(key, value),
    del: async (key) => fs.rmSync(file(key), { force: true }),
    list: async <T>(prefix: string) =>
      fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => decodeURIComponent(name.slice(0, -5)))
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, value: read<T>(key) }))
        .filter((x): x is { key: string; value: T } => x.value !== null),
    cas: async (key, expectedVersion, value: TenantBooks) => {
      if ((read<TenantBooks>(key)?.version ?? null) !== expectedVersion) return false
      write(key, value)
      return true
    },
    audit: async (line) => fs.appendFileSync(path.join(dir, 'audit.log'), `${new Date().toISOString()} ${line}\n`),
    generatedPassword: async (email, pw) =>
      fs.writeFileSync(path.join(dir, 'platform-admin.txt'), `Platform owner sign-in\nEmail: ${email}\nPassword: ${pw}\n`, { mode: 0o600 }),
  }
}

/** Books saved by the first version (registry.json + tenant-*.json) move into the key-per-file layout once. */
function migrateLegacy(dir: string, write: (key: string, value: unknown) => void) {
  const legacy = path.join(dir, 'registry.json')
  if (!fs.existsSync(legacy)) return
  try {
    const reg = JSON.parse(fs.readFileSync(legacy, 'utf8')) as {
      tenants?: Record<string, unknown>
      accounts?: Record<string, unknown>
      platform?: unknown
    }
    for (const [id, t] of Object.entries(reg.tenants || {})) {
      const tf = path.join(dir, `tenant-${id}.json`)
      if (!fs.existsSync(tf)) continue
      write('tenant:' + id, t)
      write('books:' + id, JSON.parse(fs.readFileSync(tf, 'utf8')))
      fs.renameSync(tf, tf + '.migrated')
    }
    for (const [email, acc] of Object.entries(reg.accounts || {})) write('account:' + email, acc)
    if (reg.platform) write('platform', reg.platform)
    fs.renameSync(legacy, legacy + '.migrated')
    console.log('Moved the earlier books files into the new layout.')
  } catch (e) {
    console.error('Could not migrate the earlier books files:', e instanceof Error ? e.message : e)
  }
}
