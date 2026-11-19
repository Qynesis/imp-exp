# 1. Architecture

## 1.1 The big picture

```
 Browser (React app, unchanged screens)
   │  HTTPS  Authorization: Bearer <session token>
   ▼
 NestJS API  ─────────────────────────────────────────────────────────────
   Guards:    ThrottlerGuard → AuthGuard (session) → TenantGuard → PermissionGuard(page, level)
   Pipes:     ValidationPipe (class-validator DTOs, whitelist + forbidNonWhitelisted)
   Controllers → Services (business rules, one transaction per command) → Prisma
   Interceptors: request id, audit, error mapping
   ─────────────────────────────────────────────────────────────────────────
   │                    │                          │
   ▼                    ▼                          ▼
 PostgreSQL 16        Redis 7                 Outside services
 (Prisma, RLS)        (BullMQ queues,         Steadfast / Pathao / RedX
                       rate limits, cache)    WhatsApp Cloud API / SMS gateway
```

- **One deployable API** (a modular monolith). Do not split it into microservices. The domain is
  tightly connected: a delivery moves stock, changes what is reserved and feeds the dealer ledger.
  One database transaction is far safer than messages passed between services.
- **A worker process** runs from the same codebase with a different entry point (`main.worker.ts`).
  It consumes BullMQ queues: courier booking, status polling, messages and reminders.

## 1.2 Modules

Each NestJS module matches a screen group in `shared/domain/permissions.ts`:

| Module | Screens (PageId) | Owns tables | Key commands (from `actions.ts`) |
|---|---|---|---|
| `AuthModule` | (sign-in) | `Account`, `Session`, `PlatformAdmin` | signup, login, logout |
| `TenancyModule` | settings | `Tenant`, `CompanySettings`, `Counter` | saveCompany, setBusinessTypes |
| `AccessModule` | settings | `Role`, `User` | saveRole, removeRole, users CRUD |
| `CustomFieldsModule` | settings | `FieldDef` | addField, removeField |
| `CatalogModule` | products, raw-materials | `Category`, `Product`, `RecipeLine`, `ProductSupplier`, `StockAdjustment`, `Production`, `StockMove` | saveProduct, archiveProduct, adjustStock, produce |
| `FactoryModule` | factory-orders | `Factory`, `FactoryEstimate`, `FactoryOrder` (+ receipts, bills, payments, amendments, settlements, materials) | saveEstimate, setEstimateStatus, newFactoryOrder, amendOrder, receiveShipment, factoryBill, payFactory, settleFactoryMaterial |
| `PurchasingModule` | suppliers | `Supplier`, `Purchase`, `SupplierPayment` | addSupplier, newPurchase, paySupplier |
| `TradeModule` | imports, customs | `Shipment`, `ShipmentCost`, `ShipmentStep`, `CustomsInfo` | newImport, addImportCost, markImportStep, saveCustoms, toggleCustomsDoc, markCustomsStage |
| `SalesModule` | sell, dealers | `Dealer`, `SalesQuote`, `Invoice`, `InvoiceLine`, `Collection` | saveDealer, saveQuote, setQuoteStatus, saveInvoice, collect |
| `DeliveryModule` | deliveries | `Delivery`, `DeliveryLine`, `SalesReturn`, `ReturnLine` | recordDelivery, closeRemainder, undoDelivery, recordReturn, sample load/remove |
| `TransportModule` | transport | `Vehicle`, `VehiclePaper`, `Trip` | saveVehicle, archiveVehicle, saveTrip, setTripStatus, addTransportCost |
| `CourierModule` | courier | `Parcel`, `ParcelEvent`, `IntegrationSecret` | courier/* routes, saveParcel, setParcelStatus |
| `MessagingModule` | messages | `MessageLog`, `IntegrationSecret` | messaging/* routes, logMessage, saveMessaging |
| `MoneyModule` | cashbook | `Expense`, `Advance` | addExpense, addAdvance |
| `PeopleModule` | employees | `Employee`, `PayrollRun`, `PayrollLine` | saveEmployee, payPayroll, setSalesTargets |
| `ReportsModule` | reports, sales-analytics, dashboard | (read-only SQL views) | P&L, sales series, receivables, payables |
| `PlatformModule` | (platform owner) | `AuditLog` | list companies, open books, reset password |
| `BooksModule` | (all) | — | Phase 1 `GET/PUT /api/books`; Phase 2 builds books from the tables |
| `CommandsModule` | (all) | — | `POST /api/commands/:name`, which sends each command to its module's service |

Shared infrastructure: `PrismaModule`, `CryptoModule` (passwords, AES-GCM secrets), `AuditModule`,
`QueueModule`, `ConfigModule`.

## 1.3 Layers inside a module

```
controller   HTTP only: route, DTO, guard decorators. No business logic.
service      One public method per command or query. Opens the transaction, checks the rules,
             writes rows, writes StockMove and audit, takes counters. Throws DomainError.
repository   (optional) Prisma queries that are reused; always takes `tx` and `tenantId`.
calc         Pure functions copied or imported from shared/domain/calc for derived numbers.
dto          class-validator classes for every request body.
```

Rules:

- A service method that changes data takes `(ctx: TenantContext, dto)` and runs everything inside
  `this.prisma.$transaction(async (tx) => …, { isolationLevel: 'ReadCommitted' })`. It locks the
  rows it reads before changing them (see 04 §4.1).
- Services in one module may call services in another only through their public methods, and they
  pass `tx` along. For example, `SalesService.saveInvoice` calls `DeliveryService.deliver(tx, …)`
  when `deliverNow` is set.
- **Re-use the shared domain code.** Put `shared/` into a workspace package (`@exin/domain`) that
  both the app and the API import. `calc/` functions and the `types.ts` interfaces then stay single
  sources of truth. The rules in `actions.ts` are written out again as SQL-aware services; use the
  pure `actions.ts` versions as the reference in tests (07 §7.2).

## 1.4 Tenancy

- `TenantContext = { tenantId, userId, roleId, isOwner, viaPlatform, requestId }` is built by
  `AuthGuard` from the session. It is attached to the request (`@Ctx()` decorator).
- Every Prisma call includes `where: { tenantId: ctx.tenantId }`. A Prisma client extension adds it
  automatically for tenant models and throws if a query has no tenant (02 §2.5).
- Postgres **row-level security** is enabled on every tenant table. Each transaction starts with
  `SELECT set_config('app.tenant_id', $1, true)`, so even a forgotten `where` cannot read another
  company's rows (02 §2.6).

## 1.5 Request flow: a delivery

```
POST /api/commands/recordDelivery   { invoiceId, date, lines:[{productId, qty}], via, receivedBy, note }
 1  ThrottlerGuard
 2  AuthGuard           session token → Session row (by SHA-256 digest) → TenantContext
 3  PermissionGuard     levelFor(role, 'deliveries') must be 'edit' (inherits sell/products/transport)
 4  ValidationPipe      RecordDeliveryDto
 5  DeliveryService.record(ctx, dto)
      tx: set app.tenant_id
          SELECT invoice FOR UPDATE; check final + stockOnDelivery
          SELECT products FOR UPDATE (sorted by id to avoid deadlocks)
          still-to-go = billed − delivered − closed;  refuse if qty > left or qty > stock
          UPDATE product stock; INSERT StockMove(kind='delivery'); INSERT Delivery + lines
          number from Counter('dl'); bump Tenant.booksVersion
          INSERT AuditLog
 6  Response { ok: true, id: 'DL-58', version: 1043 }
 7  After commit: enqueue 'messaging.auto' { kind:'delivery', deliveryId } if auto messages are on
```

## 1.6 Folder layout

```
exin-api/
  prisma/
    schema.prisma
    migrations/                 prisma migrate output + raw SQL (RLS, checks, views)
    seed.ts                     platform owner, demo company (mirrors shared/domain/seed.ts)
  src/
    main.ts                     HTTP app
    main.worker.ts              BullMQ workers + scheduler
    app.module.ts
    common/
      context/                  TenantContext, @Ctx() decorator
      guards/                   auth.guard.ts, permission.guard.ts, platform.guard.ts
      decorators/               @Page('deliveries', 'edit'), @Public()
      errors/                   DomainError, exception filter → { error: message }
      money.ts                  Decimal helpers (round2, sum)
      pagination.ts
    infra/
      prisma/                   PrismaService, tenant extension, withTenantTx()
      crypto/                   password hashing, token digest, AES-GCM secret box
      queue/                    BullMQ module, queue names
      audit/                    AuditService
    modules/
      auth/ tenancy/ access/ custom-fields/ catalog/ factory/ purchasing/ trade/ sales/
      delivery/ transport/ courier/ messaging/ money/ people/ reports/ platform/
      books/                    phase 1 jsonb store, phase 2 books projection
      commands/                 command registry → services
  test/
    e2e/                        supertest per module
    parity/                     runs actions.ts and the API side by side (07)
  docker-compose.yml
  Dockerfile
```

## 1.7 Cross-cutting choices

| Concern | Choice | Why |
|---|---|---|
| Validation | `class-validator` DTOs + global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` | Rejects unknown fields; typed input |
| Errors | `DomainError(status, message)`, mapped by a filter to `{ error: string }` | The frontend already shows `error` |
| Logging | `nestjs-pino`, JSON, with request id and tenant id; never log bodies of auth or secrets routes | Searchable logs |
| Config | `@nestjs/config` with a zod schema; the app refuses to start on bad env | Fails early |
| Time | Store `date` (business day, `DATE`) and `createdAt` (`timestamptz`). Business days use `Asia/Dhaka` | Matches `Dated { date, ts }` |
| IDs | `uuid` primary keys + human numbers from `Counter` | Safe joins, readable documents |
| API docs | `@nestjs/swagger` at `/api/docs` (off in production, or behind platform auth) | Contract for the app |
| Versioning | URI prefix `/api` (Phase 1/2 compatible) and `/api/v2/...` for new REST resources | No break for the app |
