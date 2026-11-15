/** Keeps every record as a small JSON file in DATA_DIR. For your own computer or a single server. */
import fs from 'node:fs'
import path from 'node:path'

export function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const file = (key) => path.join(dir, encodeURIComponent(key) + '.json')
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(file(key), 'utf8'))
    } catch {
      return null
    }
  }
  const write = (key, value) => {
    const f = file(key)
    const tmp = `${f}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value))
    fs.renameSync(tmp, f) // atomic: a crash never leaves a half-written file
  }

  // books saved by the earlier version (registry.json + tenant-*.json) move into the new layout once
  const legacy = path.join(dir, 'registry.json')
  if (fs.existsSync(legacy)) {
    try {
      const reg = JSON.parse(fs.readFileSync(legacy, 'utf8'))
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
      console.error('Could not migrate the earlier books files:', e.message)
    }
  }

  return {
    ok: true,
    kind: 'files in ' + dir,
    async get(key) { return read(key) },
    async set(key, value) { write(key, value) },
    async del(key) {
      try {
        fs.unlinkSync(file(key))
      } catch {
        /* already gone */
      }
    },
    async list(prefix) {
      const out = []
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.json')) continue
        const key = decodeURIComponent(name.slice(0, -5))
        if (key.startsWith(prefix)) out.push({ key, value: read(key) })
      }
      return out.filter((x) => x.value !== null)
    },
    /** Write only if the stored version is still `expectedVersion`. */
    async cas(key, expectedVersion, value) {
      const cur = read(key)
      if ((cur?.version ?? null) !== expectedVersion) return false
      write(key, value)
      return true
    },
    async audit(line) { fs.appendFileSync(path.join(dir, 'audit.log'), `${new Date().toISOString()} ${line}\n`) },
    async generatedPassword(email, pw) {
      fs.writeFileSync(path.join(dir, 'platform-admin.txt'), `Platform owner sign-in\nEmail: ${email}\nPassword: ${pw}\n`, { mode: 0o600 })
    },
  }
}
