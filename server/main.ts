/**
 * Runs the books API on your own computer or server, and serves the built app from ./dist when it exists.
 *
 *   npm run server                       development, restarts on changes
 *   npm run build && npm start           production
 *
 * Books go to files in DATA_DIR, or to Postgres when DATABASE_URL is set. Settings come from .env.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createApi } from '../shared/api/core'
import { apiOptions, createStore, dataDir, databaseUrl, env, loadDotEnv } from './config'
import { nodeCrypto } from './crypto'
import { handleApi } from './http'

loadDotEnv()

const DIST = path.resolve('dist')
const PORT = Number(env('PORT')) || 8787
const store = createStore({ allowFiles: true })
const options = apiOptions()
const api = createApi(store, nodeCrypto, options)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
}
function serveStatic(url: URL, res: http.ServerResponse) {
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST)) file = DIST
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Run "npm run build" first, or use "npm run dev".')
    return
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(file).pipe(res)
}

http
  .createServer((req, res) => {
    handleApi(api, req, res)
      .then((handled) => handled || serveStatic(new URL(req.url || '/', 'http://localhost'), res))
      .catch((e: unknown) => {
        console.error(e)
        if (!res.headersSent) res.writeHead(500).end()
      })
  })
  .listen(PORT, async () => {
    console.log(`Qyndms server on http://localhost:${PORT}  (data: ${store.kind})`)
    if (options.demo) console.log(`Demo logins are ON (password: ${options.demoPassword})`)
    const where = options.platformPassword ? 'from PLATFORM_ADMIN_PASSWORD' : databaseUrl() ? 'printed once below when first generated' : 'see ' + path.join(dataDir(), 'platform-admin.txt')
    console.log(`Platform owner sign-in: ${api.platformEmail}  (password: ${where})`)
    try {
      await api.ready()
    } catch (e) {
      console.error('The data store is not working:', e instanceof Error ? e.message : e)
    }
  })
