/** Server settings from the environment, with `.env` next to package.json as a fallback for local runs. */
import fs from 'node:fs'
import path from 'node:path'
import type { ApiOptions, KvStore } from '../shared/api/core'
import { fileStore } from './stores/file'
import { missingStore, postgresStore } from './stores/postgres'

export function loadDotEnv(file = path.resolve('.env')): void {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch {
    /* no .env file: use the defaults */
  }
}

export const env = (name: string): string | undefined => process.env[name] || undefined
export const databaseUrl = (): string | undefined => env('DATABASE_URL') || env('POSTGRES_URL')
export const dataDir = (): string => env('DATA_DIR') || path.resolve('server/data')

export const apiOptions = (): ApiOptions => ({
  platformEmail: env('PLATFORM_ADMIN_EMAIL') || 'admin@starbangla.local',
  platformPassword: env('PLATFORM_ADMIN_PASSWORD'),
  demo: env('DEMO_ACCOUNTS') === '1',
  demoPassword: env('DEMO_PASSWORD') || 'demo1234',
})

/** Postgres when DATABASE_URL is set; files on disk otherwise (or a clear error where there is no disk). */
export function createStore(opts: { allowFiles: boolean }): KvStore {
  const url = databaseUrl()
  if (url) return postgresStore(url)
  if (opts.allowFiles) return fileStore(dataDir())
  return missingStore('The hosted app has no database yet. In Vercel open the project, go to Storage, add Neon (Postgres), then redeploy.')
}
