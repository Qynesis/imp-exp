/**
 * Runs the books API on your own computer or server, and serves the built app from ./dist when it exists.
 *
 *   node server/index.js            API on :8787
 *   PORT=80 DATA_DIR=/var/books node server/index.js
 *
 * Data goes to files in DATA_DIR, or to Postgres when DATABASE_URL is set. Settings are read from .env.
 * On Vercel the same API runs from api/index.js instead.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { fileStore } from './store-file.js'
import { pgStore } from './store-pg.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// read settings from .env next to package.json (real environment variables win)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  /* no .env file: use the defaults */
}

const DATA = process.env.DATA_DIR || path.join(ROOT, 'data')
const DIST = path.join(ROOT, '..', 'dist')
const PORT = Number(process.env.PORT) || 8787
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL

const store = DB_URL ? pgStore(DB_URL) : fileStore(DATA)
const app = createApp(store)

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }
function serveStatic(url, res) {
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST)) file = DIST
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    return res.end('Run "npm run build" first, or use "npm run dev".')
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(file).pipe(res)
}

http.createServer(async (req, res) => {
  if (!(await app.handle(req, res))) serveStatic(new URL(req.url, 'http://localhost'), res)
}).listen(PORT, async () => {
  console.log(`Star Bangla Trading server on http://localhost:${PORT}  (data: ${store.kind})`)
  if (app.DEMO_ON) console.log(`Demo logins are ON (password: ${app.DEMO_PASSWORD})`)
  console.log(`Platform owner sign-in: ${app.PLATFORM_EMAIL}  (password: ${process.env.PLATFORM_ADMIN_PASSWORD ? 'from PLATFORM_ADMIN_PASSWORD' : DB_URL ? 'see the log line above when first generated' : 'see ' + path.join(DATA, 'platform-admin.txt')})`)
  try {
    await app.ready()
  } catch (e) {
    console.error('The data store is not working:', e.message)
  }
})
