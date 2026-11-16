/**
 * Keeps every record as a row in Postgres.
 *  - Neon (from the Vercel Marketplace) is reached over HTTP, which suits serverless functions.
 *  - Any other Postgres (your own server, Supabase, Render, RDS) uses an ordinary `pg` pool.
 *    Add `?sslmode=require` to the URL when the host wants TLS.
 */
import type { KvStore, TenantBooks } from '../../shared/api/core'

type Row = Record<string, unknown>
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>

async function connect(url: string): Promise<Query> {
  if (/neon\.tech/.test(url)) {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(url)
    return (text, params = []) => sql.query(text, params) as Promise<Row[]>
  }
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  return (text, params = []) => pool.query(text, params).then((r) => r.rows as Row[])
}

/** `query` can be supplied for tests; otherwise it comes from the URL. */
export function postgresStore(url: string, query?: Query): KvStore {
  let q: Query | null = query || null
  const run = async (text: string, params?: unknown[]) => (q ||= await connect(url))(text, params)
  let init: Promise<void> | null = null
  const ready = () =>
    (init ||= (async () => {
      await run('CREATE TABLE IF NOT EXISTS docs (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
      await run('CREATE TABLE IF NOT EXISTS audit (id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), line text NOT NULL)')
    })().catch((e: unknown) => {
      init = null
      throw e
    }))
  const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T

  return {
    ok: true,
    kind: /neon\.tech/.test(url) ? 'postgres (Neon)' : 'postgres',
    async get<T>(key: string) {
      await ready()
      const rows = await run('SELECT value FROM docs WHERE key = $1', [key])
      return rows[0] ? parse<T>(rows[0].value) : null
    },
    async set(key, value) {
      await ready()
      await run('INSERT INTO docs (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)])
    },
    async del(key) {
      await ready()
      await run('DELETE FROM docs WHERE key = $1', [key])
    },
    async list<T>(prefix: string) {
      await ready()
      const rows = await run('SELECT key, value FROM docs WHERE key LIKE $1 ORDER BY key', [prefix.replace(/[%_\\]/g, '\\$&') + '%'])
      return rows.map((r) => ({ key: String(r.key), value: parse<T>(r.value) }))
    },
    async cas(key, expectedVersion, value: TenantBooks) {
      await ready()
      const rows = await run("UPDATE docs SET value = $2::jsonb, updated_at = now() WHERE key = $1 AND (value->>'version')::int = $3 RETURNING key", [key, JSON.stringify(value), expectedVersion])
      return rows.length > 0
    },
    async audit(line) {
      await ready()
      await run('INSERT INTO audit (line) VALUES ($1)', [line])
    },
    async generatedPassword(email, pw) {
      console.log(`Platform owner sign-in generated. Email: ${email}  Password: ${pw}  (set PLATFORM_ADMIN_PASSWORD to choose your own)`)
    },
  }
}

/** A store that is not set up: every call answers with this problem so the sign-in page can show it. */
export const missingStore = (problem: string): KvStore => {
  const fail = () => Promise.reject(new Error(problem))
  return { ok: false, problem, kind: 'none', get: fail, set: fail, del: fail, list: fail, cas: fail, audit: fail, generatedPassword: fail }
}
