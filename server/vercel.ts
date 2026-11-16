/**
 * The books API as a Vercel serverless function. NOT deployed while the app runs frontend-only.
 *
 * To switch the shared server on:
 *   1. Bundle this file into api/index.js as part of the build:
 *        "build": "vite build && esbuild server/vercel.ts --bundle --platform=node --format=esm --packages=external --outfile=api/index.js"
 *   2. Add to vercel.json:  "rewrites": [{ "source": "/api/:path*", "destination": "/api?path=:path*" }]
 *   3. In Vercel add Neon (Postgres) under Storage, and set VITE_BACKEND=server and PLATFORM_ADMIN_PASSWORD.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApi } from '../shared/api/core'
import { apiOptions, createStore } from './config'
import { nodeCrypto } from './crypto'
import { handleApi } from './http'

const api = createApi(createStore({ allowFiles: false }), nodeCrypto, apiOptions())

export default async function handler(req: IncomingMessage & { query?: Record<string, unknown> }, res: ServerResponse) {
  await handleApi(api, req, res)
}
