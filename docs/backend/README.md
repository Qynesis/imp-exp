# Backend guide: NestJS + PostgreSQL + Prisma

This folder explains how to build the production backend for Star Bangla Trading with **NestJS**,
**PostgreSQL** and **Prisma**. Everything here is based on the code that already exists:

| Source of truth today | What it holds |
|---|---|
| `shared/domain/types.ts` | The data model: `Db` and every record in it |
| `shared/domain/actions.ts` | Every change a person can make, with its rules and refusals |
| `shared/domain/calc/*` | Derived numbers: dealer dues, stock reserved for deliveries, P&L, cashbook |
| `shared/domain/permissions.ts` | Screens, access levels, default roles, inherited access |
| `shared/api/contract.ts` and `shared/api/core.ts` | The HTTP API the frontend calls today |
| `shared/courier/`, `shared/messaging/` | Steadfast, Pathao, RedX, WhatsApp Cloud API and SMS gateways |

The current server keeps each company's books as **one JSON document**, which it loads and saves
whole. That works for small companies, but it has limits:

- The whole document is sent on every save.
- Two people editing at once get a 409 conflict.
- The database enforces nothing.
- Reports cannot be run in SQL.

The new backend stores each record as a proper relational row. Every change becomes a transactional
**command** that the server checks before saving.

## Documents

| # | Document | Read it when you… |
|---|---|---|
| 1 | [Architecture](01-architecture.md) | set up the NestJS project: modules, layers, tenancy, request flow, folder layout |
| 2 | [Database and Prisma schema](02-database-prisma.md) | create the database: full `schema.prisma`, indexes, constraints, row-level security |
| 3 | [API](03-api.md) | write controllers: the compatibility API, the command API, REST resources, DTOs, errors |
| 4 | [Business rules](04-business-rules.md) | write services: stock, delivery, returns, dues, factory orders, landed cost, transport |
| 5 | [Auth and security](05-auth-security.md) | do sign-in, sessions, roles, platform owner, secrets, rate limits, audit |
| 6 | [Integrations and jobs](06-integrations.md) | connect courier and messaging providers, queues, scheduled reminders, webhooks |
| 7 | [Testing and deployment](07-testing-deployment.md) | write tests, Docker, CI, environment variables, backups, monitoring |
| 8 | [Migration plan](08-migration-plan.md) | move existing JSON books into the tables and switch the frontend over |

## Delivery in three phases

```
Phase 1  Compatible        NestJS serves today's API exactly (books as jsonb). Frontend unchanged.
Phase 2  Relational        Tables from 02, commands from 03/04. GET /api/books is built from the
                           tables; writes go through POST /api/commands/:name. One small frontend change.
Phase 3  Scale             Paged REST resources, SQL reports, queues, webhooks. Screens move off the
                           whole-books download one at a time.
```

Each phase ships on its own and can be rolled back on its own. Do not skip Phase 1: it lets you
replace the server without touching the app, and it gives you a test harness to compare against.

## Ground rules for the whole backend

1. **One tenant per company.** Every business row has `tenantId`. No query runs without it.
   Postgres row-level security is a second lock behind the code (see 02 and 05).
2. **Every change is one command in one transaction.** Stock, ledgers and counters change
   together or not at all.
3. **The server decides.** The browser may preview a change, but only the server's result counts.
   Rules such as "you cannot deliver more than the bill still has" are enforced in the service and,
   where possible, again in the database.
4. **Money is `Decimal(14,2)` and quantity is `Decimal(14,3)`.** Never use `Float`. Amounts are in
   Taka (BDT). Import values in USD keep their own column and exchange rate.
5. **Business numbers come from per-tenant counters**, e.g. invoice `SB-1042`, `FO-12`, `IMP-007`,
   `DL-…`, `RT-…`. They are taken inside the same transaction that creates the record.
6. **Sample data never touches real figures.** Rows with `sample = true` are left out of stock,
   money, dues and reports (see 04).
7. **Secrets never reach a browser.** Courier and messaging keys are stored encrypted and shown
   only as `•••• 1234` hints.

## Quick start (after reading 01 and 02)

```bash
npm i -g @nestjs/cli
nest new exin-api --strict --package-manager npm
cd exin-api
npm i @prisma/client @nestjs/config @nestjs/throttler @nestjs/schedule @nestjs/bullmq bullmq ioredis \
      class-validator class-transformer helmet nestjs-pino pino-http argon2 zod
npm i -D prisma
npx prisma init --datasource-provider postgresql
# paste the schema from 02-database-prisma.md into prisma/schema.prisma
docker compose up -d db redis          # see 07
npx prisma migrate dev --name init
npm run start:dev
```
