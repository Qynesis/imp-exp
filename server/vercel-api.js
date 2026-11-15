/**
 * The books API as a Vercel serverless function. NOT deployed right now (the app runs frontend-only).
 * To turn the server on later: move this file to api/index.js, restore the /api rewrite in vercel.json,
 * add Neon (Postgres) in Vercel Storage, and set VITE_BACKEND=server.
 * Data lives in Postgres: add Neon from the Vercel Marketplace (Storage tab) so DATABASE_URL is set.
 */
import { createApp } from './app.js'
import { missingStore, pgStore } from './store-pg.js'

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
const store = DB_URL
  ? pgStore(DB_URL)
  : missingStore('The hosted app has no database yet. In Vercel open the project, go to Storage, add Neon (Postgres), then redeploy.')
const app = createApp(store)

export default function handler(req, res) {
  return app.handle(req, res)
}
