# 7. Testing and deployment

## 7.1 Test layers

| Layer | Tool | What |
|---|---|---|
| Unit | Jest (`ts-jest` or `@swc/jest`) | Pure helpers: money rounding, counters' formatting, DTO validation, `resolveRef` |
| Service | Jest + a real Postgres (Testcontainers or the compose `db-test`) | Each command's rules, with every refusal message |
| Parity | Jest | Same command on `actions.ts` (in memory) and on the API → same books |
| E2E | Supertest against the Nest app | Routes, guards, status codes, tenant isolation |
| Contract | The React app's own test scripts pointed at the API | The UI works unchanged in Phase 1 and 2 |
| Load | k6 | 50 concurrent deliveries on shared products; book polling at 1 request/sec per user |

Run every test file inside a transaction that is rolled back, or truncate between files. Never mock
Prisma for service tests: the rules depend on locks and constraints.

## 7.2 Parity tests (the most valuable tests)

The browser's `applyAction(db, name, payload)` is the specification. For each scenario:

```ts
it('partial delivery 100 → 30 cartons', async () => {
  const start = demoDb()                                   // shared/domain/seed.ts
  const { tenantId } = await importBooks(start)            // importer from 08
  const steps: [ActionName, unknown][] = [
    ['saveInvoice', { id: 'new', data: bill(100), final: true }],
    ['recordDelivery', { invoiceId: 'SB-…', date, lines: [{ productId: P, qty: 30 }], via: 'own', receivedBy: 'Rahim', note: '' }],
  ]
  let local = start
  for (const [n, p] of steps) { local = applyAction(local, n, p); await api.command(tenantId, n, p) }
  const server = await booksProjection(tenantId)
  expect(normalise(server)).toEqual(normalise(local))      // ids mapped, Decimals → numbers, ts dropped
})
```

Cover at least the 22 delivery checks and 11 sample-data checks already used for the app:

- partial delivery, two of three items, more than left, more than stock;
- close the rest with credit, undo, undo after a return;
- return more than delivered, return on a bill from another dealer, damaged vs restock;
- sample load → deliver → return → remove leaves real figures unchanged.

Add the rest:

- factory receipt with freight in cost vs not; amendment below received;
- material settlement;
- import landed cost; export shipped and paid;
- purchase with part payment;
- payroll with advance and commission;
- dealer ledger allocation (chosen bill, then oldest, with a leftover advance).

## 7.3 E2E checklist

- [ ] Every Phase 1 route answers exactly like `createApi()` (same status codes and same `error` text).
- [ ] 409 on `PUT /books` with an old `baseVersion`.
- [ ] A view-only role gets 403 on every command. A role with `sell: edit` can deliver, because
      `deliveries` inherits from it.
- [ ] Only admins can use the settings, courier and messaging key routes and the role commands.
- [ ] Tenant isolation: company A's token + company B's ids → 404/400 on every route.
- [ ] Rate limit: the 9th failed sign-in in 10 minutes → 429.
- [ ] A platform session cannot call tenant routes until it opens a company; an open-books session
      expires in 4 hours.
- [ ] The same Idempotency-Key twice → one delivery, the same response.
- [ ] Courier and messaging in test mode never call the network (nock with `disableNetConnect`).
- [ ] Concurrency: 20 parallel deliveries for 10 units each, against 100 in stock and 150 billed →
      exactly 10 succeed and stock ends at 0.

## 7.4 Local development

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: exin, POSTGRES_PASSWORD: exin, POSTGRES_DB: exin }
    ports: ["5432:5432"]
    volumes: [pg:/var/lib/postgresql/data]
  db-test:
    image: postgres:16
    environment: { POSTGRES_USER: exin, POSTGRES_PASSWORD: exin, POSTGRES_DB: exin_test }
    ports: ["5433:5432"]
    tmpfs: [/var/lib/postgresql/data]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes: { pg: {} }
```

To point the React app at the new API, run `VITE_BACKEND=server` with the Vite proxy aimed at
`http://localhost:3000`.

## 7.5 Environment variables

| Name | Required | Meaning |
|---|---|---|
| `NODE_ENV` | yes | `production` in production |
| `PORT` | no | default 3000 |
| `APP_ORIGIN` | yes | the app's URL, for CORS (e.g. `https://app.starbangla.com`) |
| `DATABASE_URL` | yes | pooled URL, connects as `exin_app` |
| `DATABASE_URL_MIGRATE` | yes (CI) | direct URL as the owner role, for `prisma migrate deploy` |
| `DATABASE_URL_PLATFORM` | yes | role with BYPASSRLS, for auth and platform modules only |
| `REDIS_URL` | yes | BullMQ, rate limits, caches |
| `SECRETS_KEY` / `SECRETS_KEY_OLD` | yes / no | 32-byte base64 key for integration secrets |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | yes | platform owner |
| `DEMO_ACCOUNTS`, `DEMO_PASSWORD` | no | demo company (keep `0` in production) |
| `STEADFAST_*`, `PATHAO_*`, `REDX_*` | no | server-wide courier keys (same names as `.env.example`) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` | no | server-wide WhatsApp |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | with webhooks | webhook verification |
| `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_GATEWAY` | no | server-wide SMS |
| `TRIAL_DAYS` | no | free trial for new companies (default 14) |
| `APP_URL` | for online payment | the app's public address, used for the gateway's return URL |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX` | for online payment | SSLCommerz store; sandbox unless `0` |
| `BILLING_TEST_PAYMENTS` | no | `1` simulates online payments when no gateway is set |
| `BILLING_BKASH_NUMBER`, `BILLING_NAGAD_NUMBER`, `BILLING_BANK_DETAILS` | no | shown to customers who pay by hand |
| `ANTHROPIC_API_KEY` | no | turns on the AI assistant (Claude); without it the built-in answerer is used |
| `WORKER_SCHEDULER` | worker | `1` on exactly one worker |
| `LOG_LEVEL` | no | `info` |
| `SENTRY_DSN` | no | error reporting |

Validate them with zod in `ConfigModule.forRoot({ validate })`. The process exits on a missing
required value.

## 7.6 Deployment

**Recommended setup**:

- the API and worker as two containers from one image (`node dist/main.js`, `node dist/main.worker.js`)
  on Render, Railway, Fly.io, AWS ECS or a VPS;
- managed Postgres 16 (Neon, Supabase, RDS) with point-in-time recovery;
- managed Redis (Upstash or ElastiCache).

The React app stays on Vercel. Rewrite `/api/*` to the API's URL in `vercel.json`, or set the API base
URL in the app config.

NestJS with BullMQ workers does not suit serverless functions. Run the API as a long-lived service.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**CI pipeline (GitHub Actions)**:

1. `npm ci`
2. `prisma validate`
3. lint, typecheck
4. unit tests
5. service, parity and e2e tests with Postgres and Redis service containers
6. build the image
7. migration drift check
8. on the main branch: `prisma migrate deploy` (with `DATABASE_URL_MIGRATE`), then roll out the API
   and worker

Migrations run **before** the new code and must be backwards compatible (02 §2.7).

**Health**:

- `GET /api/health/live` checks only that the process is up.
- `GET /api/health/ready` checks Postgres `SELECT 1` and Redis `PING` (`@nestjs/terminus`).
- `GET /api/status` stays as the app expects.

## 7.7 Backups and recovery

- Managed point-in-time recovery for 7–14 days, plus a nightly `pg_dump -Fc`, encrypted, kept 30 days
  in another region.
- A restore test every month into a scratch database. Run the stock check (`SUM(StockMove) = stock`)
  on the restored copy.
- Per-company export: `GET /api/v2/export/books` gives the `Db` JSON (the backup button in Settings).
  Restore it with `replaceAll`.

## 7.8 Monitoring

- Logs: pino JSON with `requestId`, `tenantId`, `userId`, `command` and `durationMs`.
- Metrics (Prometheus or OpenTelemetry):
  - request rate, p95 latency per route, and 4xx/5xx counts;
  - command counts and refusal counts by message;
  - queue depth and failed jobs;
  - courier and SMS error rates per provider;
  - database pool usage.
- Alerts:
  - 5xx above 1% for 5 minutes;
  - failed jobs above 20 in an hour;
  - the stock check finds a difference;
  - a reminder job didn't run;
  - database CPU above 80%;
  - disk above 80%.
- Errors go to Sentry, with request bodies scrubbed (5.7).
