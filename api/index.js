/**
 * The books API as a Vercel serverless function. Every /api/* request is rewritten here by vercel.json.
 * Data lives in Postgres: add Neon from the Vercel Marketplace (Storage tab) so DATABASE_URL is set.
 */
import { createApp } from '../server/app.js'
import { missingStore, pgStore } from '../server/store-pg.js'

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
const store = DB_URL
  ? pgStore(DB_URL)
  : missingStore('The hosted app has no database yet. In Vercel open the project, go to Storage, add Neon (Postgres), then redeploy.')
const app = createApp(store)

export default function handler(req, res) {
  return app.handle(req, res)
}
