# 5. Auth and security

## 5.1 Accounts and sessions

The current design has worked well. Keep it, with stronger storage:

| Item | Today | NestJS |
|---|---|---|
| Password hash | scrypt (64 bytes, per-user salt) | **argon2id** (`argon2` package, m=19 MiB, t=2, p=1). Keep verifying old scrypt hashes and rehash on the next successful sign-in (`hash` starts with `scrypt$…` after migration) |
| Session token | 32 random bytes hex, stored as SHA-256 digest, 30 days | Same. `Session.tokenDigest`. Slide `expiresAt` when `lastSeenAt` is over a day old |
| Platform "open books" | session `as { tenantId, userId }`, 4 h | `Session.actingAsUserId`, 4 h, audited |
| Logout | delete session | same; also "sign out everywhere" = delete all sessions for the user |
| Password change by admin or platform | drops the user's other sessions | same |

Why opaque tokens and not JWT: sessions must be revocable at once (a role removed, a password reset, a
platform session ending), and the app already sends one bearer token. A database lookup per request
is cheap. Cache it in Redis for 60 seconds, keyed by digest, and clear that entry on logout.

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest()
    if (this.reflector.get(PUBLIC, c.getHandler())) return true
    const token = (req.headers.authorization || '').replace(/^Bearer /, '')
    const s = token && await this.sessions.find(sha256(token))
    if (!s || s.expiresAt < new Date()) throw new DomainError(401, 'Please sign in again.')
    if (s.platformAdminId && !s.actingAsUserId) { req.platform = s; return true }   // platform routes only
    const user = s.actingAsUser ?? s.user
    if (!user || user.disabled) throw new DomainError(401, 'This account no longer exists.')
    req.ctx = { tenantId: user.tenantId, userId: user.id, roleId: user.roleId, viaPlatform: !!s.actingAsUserId }
    return true
  }
}
```

## 5.2 Sign-in protection

- **Rate limit**: at most 8 failed sign-ins per (IP, email) in 10 minutes. After that, 429 "Too many
  attempts. Wait ten minutes and try again." Store the counter in Redis (today it is in memory, so it
  resets on restart and is per instance).
- Also apply a global `@nestjs/throttler` limit: 300 requests per minute per IP, and 20 per minute on
  `/signup`.
- Run the password hash even when the email is unknown. Response time must not reveal which emails
  exist.
- The same message for a wrong email and a wrong password: "Wrong email or password."
- Passwords are at least 8 characters. Optionally check them against the HaveIBeenPwned k-anonymity
  API (send only the first 5 characters of the SHA-1).

## 5.3 Platform owner

- Created from `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` by the seed. If no password is
  set, generate one once and print it to the server log only.
- Can list companies, open a company as its owner (4 h) and reset a password. **Every** use writes
  `AuditLog` with `actorType = 'platform'`.
- Should have TOTP 2FA (`otplib`). Add it before going live with real companies.
- `viaPlatform = true` is returned in the session, so the app shows a "Viewing as platform owner"
  banner.

## 5.4 Roles and page access

Use `shared/domain/permissions.ts` as it is: `levelFor()`, `roleLevel()`, `isAdmin()`, `PAGES`,
`INHERITS`. Do not re-implement them.

```ts
export const Page = (page: PageId, level: 'view' | 'edit') => SetMetadata('page', { page, level })

@Injectable()
export class PermissionGuard implements CanActivate {
  async canActivate(c: ExecutionContext) {
    const need = this.reflector.get<{ page: PageId; level: AccessLevel }>('page', c.getHandler())
    if (!need) return true
    const { ctx } = c.switchToHttp().getRequest()
    const role = await this.roles.get(ctx.tenantId, ctx.roleId)          // cached per booksVersion
    if (!role) throw new DomainError(403, 'Your role was removed.')
    const have = role.key === 'owner' ? 'edit' : roleLevel(role, need.page)
    const ok = need.level === 'view' ? have !== 'none' : have === 'edit'
    if (!ok) throw new DomainError(403, need.level === 'edit' ? 'Your role is view-only here.' : 'You do not have access to this screen.')
    return true
  }
}
```

- Inherited access: screens added later take the best access from their parent screens. For example,
  `deliveries` inherits from `sell`, `products` and `transport`. `INHERITS` handles this.
- **Admin** = `settings: edit` (the Owner always is).
- **Editor** (courier booking, sending messages) = the role has `edit` on at least one screen.
- The `GET /api/books` projection returns the whole books to any signed-in user, as today. In Phase
  3, the paged endpoints check `view` on their page, and the projection can leave out pages a role
  can't see (for example, `employees` for the Sales role).

## 5.5 Tenant isolation (defence in depth)

1. `TenantContext` comes only from the session, never from the request body or URL.
2. Repository and Prisma extension: `tenantId` is in every where clause; creates fill it in.
3. Postgres RLS with `app.tenant_id` set per transaction (02 §2.6). The app's database user cannot
   bypass it.
4. Ids from the client are resolved inside the tenant (`resolveRef`). An id from another company is
   simply "not found".
5. An e2e test signs in as company A and tries every command and resource with ids from company B. All
   of them must answer 404 or 400 (07 §7.3).

## 5.6 Integration secrets

Courier and WhatsApp/SMS keys:

- Encrypted with **AES-256-GCM**. The key is `SECRETS_KEY` (32 bytes, base64) from the environment or
  a KMS. A fresh 12-byte IV is used for each write. The value is stored as
  `v1:<iv>:<tag>:<ciphertext>` in `IntegrationSecret.box`.
- The `GET …/settings` routes return only `hints` (`•••• 1234`, plus `baseUrl`/`storeId`/`username`,
  which are not secret).
- Server environment keys (`STEADFAST_*`, `PATHAO_*`, `REDX_*`, `WHATSAPP_*`, `SMS_*`) win over saved
  keys, and `fromServer: true` is reported, as today.
- **Key rotation**: support `SECRETS_KEY_OLD`. Decrypt with the new key first, then the old one, and
  re-encrypt on read.
- Saving or removing keys writes an audit entry, without the values.

## 5.7 HTTP hardening

- `helmet()`. CORS allows only the app's origin (`APP_ORIGIN`), with methods GET/POST/PUT/PATCH/DELETE,
  header `Authorization, Content-Type, Idempotency-Key`, and no credentials (the token is a header,
  not a cookie).
- Body limit: 2 MB for normal routes. In Phase 1, `PUT /api/books` needs up to 15 MB; give that route
  its own limit.
- `trust proxy` is set when behind a load balancer, so rate limits see the real IP.
- No stack traces in responses. Unknown errors become 500 "Something went wrong on the server." and
  are logged with the request id.
- Logs never contain: passwords, tokens, `Authorization`, integration keys, or full message texts to
  customers. Phone numbers are masked (`01711••••89`).

## 5.8 Audit log

Write `AuditLog` for:

- sign-in (success and failure, with the IP);
- password changes and user add, remove and role change;
- role edits;
- platform actions;
- integration key changes;
- credit-limit overrides;
- `undoDelivery`;
- sample-data load and remove;
- `replaceAll` (restore);
- every command, as `{ command, refNo }` only, not the full payload.

Keep it for 2 years. Platform admins see everything; a company's admins see their own (Phase 3 screen).

## 5.9 Data protection

- TLS everywhere (the database connection uses `sslmode=require`).
- Encrypted backups (07 §7.6).
- Deleting a company: soft-delete (`Tenant.status = suspended`) at once, then hard-delete after 30
  days with `ON DELETE CASCADE`. Export their books as JSON first and keep it 30 days.
- Personal data stored: names, phones and addresses of dealers, staff and drivers. Show it only to
  roles with view rights on that screen (Phase 3). Provide an export on request.
