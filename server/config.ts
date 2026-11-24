/** Server settings from the environment, with `.env` next to package.json as a fallback for local runs. */
import fs from 'node:fs'
import path from 'node:path'
import type { ApiOptions, KvStore } from '../shared/api/core'
import { claudeAnalyst, claudeAssistant } from './assistant'
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
  courier: {
    steadfast: { apiKey: env('STEADFAST_API_KEY') || env('COURIER_API_KEY'), secretKey: env('STEADFAST_SECRET_KEY') || env('COURIER_SECRET_KEY'), baseUrl: env('STEADFAST_BASE_URL') },
    pathao: { apiKey: env('PATHAO_CLIENT_ID'), secretKey: env('PATHAO_CLIENT_SECRET'), username: env('PATHAO_USERNAME'), password: env('PATHAO_PASSWORD'), storeId: env('PATHAO_STORE_ID'), baseUrl: env('PATHAO_BASE_URL') },
    redx: { apiKey: env('REDX_TOKEN'), baseUrl: env('REDX_BASE_URL') },
  },
  messaging: {
    whatsapp: { token: env('WHATSAPP_TOKEN'), phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'), template: env('WHATSAPP_TEMPLATE'), language: env('WHATSAPP_TEMPLATE_LANGUAGE') },
    sms: { apiKey: env('SMS_API_KEY'), senderId: env('SMS_SENDER_ID'), gateway: env('SMS_GATEWAY') },
  },
  assistant: claudeAssistant(env('ANTHROPIC_API_KEY')),
  analyst: claudeAnalyst(env('ANTHROPIC_API_KEY')),
  billing: {
    trialDays: Number(env('TRIAL_DAYS')) || 14,
    testPayments: env('BILLING_TEST_PAYMENTS') === '1',
    gateway: { storeId: env('SSLCOMMERZ_STORE_ID'), storePassword: env('SSLCOMMERZ_STORE_PASSWORD'), sandbox: env('SSLCOMMERZ_SANDBOX') !== '0' },
    publicUrl: env('APP_URL'),
    manual: { bkash: env('BILLING_BKASH_NUMBER'), nagad: env('BILLING_NAGAD_NUMBER'), bank: env('BILLING_BANK_DETAILS') },
  },
})

/** Postgres when DATABASE_URL is set; files on disk otherwise (or a clear error where there is no disk). */
export function createStore(opts: { allowFiles: boolean }): KvStore {
  const url = databaseUrl()
  if (url) return postgresStore(url)
  if (opts.allowFiles) return fileStore(dataDir())
  return missingStore('The hosted app has no database yet. In Vercel open the project, go to Storage, add Neon (Postgres), then redeploy.')
}
