/** Turns a Node HTTP request into an API request and writes the answer back. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiRequest, BooksApi } from '../shared/api/core'

const MAX_BODY = 8 * 1024 * 1024

class BodyError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  // hosts such as Vercel may have parsed the body already
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body !== 'string') return Promise.resolve(req.body)
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {})
    } catch {
      return Promise.reject(new BodyError(400, 'The request was not valid JSON.'))
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new BodyError(413, 'That is too much data to save at once.'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      const text = Buffer.concat(chunks).toString('utf8')
      // the payment gateway posts an HTML form back
      if (String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(text)))
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new BodyError(400, 'The request was not valid JSON.'))
      }
    })
    req.on('error', reject)
  })
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * Answer an /api/* request. Returns false for other paths so the caller can serve the app.
 * On Vercel, vercel.json rewrites /api/<path> to /api?path=<path>, so both forms are accepted.
 */
export async function handleApi(api: BooksApi, req: IncomingMessage & { query?: Record<string, unknown> }, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost')
  let pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname.startsWith('/api')) return false
  const q = req.query?.path ?? url.searchParams.get('path')
  if (pathname === '/api' && q) pathname = '/api/' + (Array.isArray(q) ? q.join('/') : String(q))
  let body: unknown
  try {
    body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req)
  } catch (e) {
    send(res, e instanceof BodyError ? e.status : 400, { error: e instanceof Error ? e.message : 'Bad request.' })
    return true
  }
  const request: ApiRequest = {
    method: req.method || 'GET',
    path: pathname.replace(/^\/api\/?/, ''),
    query: url.searchParams,
    body,
    token: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
    client: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''),
  }
  const out = await api.handle(request)
  if (out.redirect) {
    res.writeHead(303, { Location: out.redirect, 'Cache-Control': 'no-store' })
    res.end()
    return true
  }
  send(res, out.status, out.body)
  return true
}
