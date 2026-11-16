/** Sign-in tokens kept in this browser. Storage can be unavailable (private windows), so every access is guarded. */
export type TokenKind = 'company' | 'platform'
const KEYS: Record<TokenKind, string> = { company: 'books-session', platform: 'books-platform' }

export function getToken(kind: TokenKind = 'company'): string {
  try {
    return localStorage.getItem(KEYS[kind]) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string, kind: TokenKind = 'company'): void {
  try {
    if (token) localStorage.setItem(KEYS[kind], token)
    else localStorage.removeItem(KEYS[kind])
  } catch {
    /* the session lasts until the tab closes */
  }
}
