/** One way to call the books API, whether it runs in this browser or on a server. */
import type { HttpMethod } from '@shared/api/contract'

/** 'local' keeps everything in this browser (frontend-only hosting). Build with VITE_BACKEND=server to use the server. */
export const BACKEND: 'local' | 'server' = import.meta.env.VITE_BACKEND === 'server' ? 'server' : 'local'

export class ApiError extends Error {
  /** 0 means the server could not be reached. */
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function overNetwork(method: HttpMethod, path: string, body: unknown, token: string): Promise<{ status: number; body: unknown }> {
  let res: Response
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }
  const data: unknown = await res.json().catch(() => null)
  // a reply that is not from our server (for example the dev proxy failing) means the books server is down
  if (data === null) {
    throw new ApiError(res.status >= 500 ? `The server failed (${res.status}). Check the deployment logs.` : 'The books server is not running. Start it with “npm run server”, then try again.', 0)
  }
  return { status: res.status, body: data }
}

export async function request<T>(method: HttpMethod, path: string, body?: unknown, token = ''): Promise<T> {
  const out =
    BACKEND === 'local'
      ? await import('./localBackend').then((m) => m.localRequest(method, path, body, token)) // separate chunk, loaded once
      : await overNetwork(method, path, body, token)
  if (out.status >= 400) throw new ApiError((out.body as { error?: string } | null)?.error || 'Something went wrong.', out.status)
  return out.body as T
}
