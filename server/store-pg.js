/**
 * Keeps every record as a row in Postgres.
 *  - On Vercel with Neon (from the Vercel Marketplace) it talks over HTTP, which suits serverless functions.
 *  - With any other Postgres (your own server, Supabase, Render, RDS) it uses an ordinary `pg` connection pool.
 *    Add `?sslmode=require` to the URL when the host wants TLS, or `?sslmode=no-verify` for self-signed certificates.
 */

async function makeQuery(url) {
  if (/neon\.tech/.test(url)) {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(url)
    return (text, params) => sql.query(text, params)
  }
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  return (text, params) => pool.query(text, params).then((r) => r.rows)
}

/** `opts.query(text, params) -> rows` can be supplied for tests; otherwise it comes from the URL. */
export function pgStore(url, opts = {}) {
  let q = opts.query || null
  const query = async (text, params = []) => {
    q ||= await makeQuery(url)
    return q(text, params)
  }
  let init = null
  const ready = () => (init ||= (async () => {
    await query('CREATE TABLE IF NOT EXISTS docs (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
    await query('CREATE TABLE IF NOT EXISTS audit (id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), line text NOT NULL)')
  })().catch((e) => {
    init = null
    throw e
  }))
  const json = (v) => JSON.stringify(v)
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

  return {
    ok: true,
    kind: /neon\.tech/.test(url || '') ? 'postgres (Neon)' : 'postgres',
    async get(key) {
      await ready()
      const rows = await query('SELECT value FROM docs WHERE key = $1', [key])
      return rows[0] ? parse(rows[0].value) : null
    },
    async set(key, value) {
      await ready()
      await query('INSERT INTO docs (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, json(value)])
    },
    async del(key) {
      await ready()
      await query('DELETE FROM docs WHERE key = $1', [key])
    },
    async list(prefix) {
      await ready()
      const rows = await query('SELECT key, value FROM docs WHERE key LIKE $1 ORDER BY key', [prefix.replace(/[%_\\]/g, '\\$&') + '%'])
      return rows.map((r) => ({ key: r.key, value: parse(r.value) }))
    },
    /** Write only if the stored version is still `expectedVersion`: two people saving at once cannot overwrite each other. */
    async cas(key, expectedVersion, value) {
      await ready()
      const rows = await query("UPDATE docs SET value = $2::jsonb, updated_at = now() WHERE key = $1 AND (value->>'version')::int = $3 RETURNING key", [key, json(value), expectedVersion])
      return rows.length > 0
    },
    async audit(line) {
      await ready()
      await query('INSERT INTO audit (line) VALUES ($1)', [line])
    },
    async generatedPassword(email, pw) {
      console.log(`Platform owner sign-in generated. Email: ${email}  Password: ${pw}  (set PLATFORM_ADMIN_PASSWORD to choose your own)`)
    },
  }
}

/** A store that is not set up: the API answers every call with this problem so the sign-in page can show it. */
export const missingStore = (problem) => ({ ok: false, problem, kind: 'none' })
