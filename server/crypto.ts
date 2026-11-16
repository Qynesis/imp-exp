import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { CryptoKit } from '../shared/api/core'

const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>

/** scrypt for passwords, SHA-256 for session tokens. */
export const nodeCrypto: CryptoKit = {
  hashPassword: async (password, salt) => (await scrypt(password, salt, 64)).toString('hex'),
  digest: async (value) => crypto.createHash('sha256').update(value).digest('hex'),
  randomHex: (bytes) => crypto.randomBytes(bytes).toString('hex'),
  equal: (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)),
}
