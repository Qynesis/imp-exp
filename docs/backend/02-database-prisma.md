# 2. Database and Prisma schema

The complete schema is in **[schema.prisma](schema.prisma)**. Copy it to `prisma/schema.prisma` in
the API project. It has been checked with `prisma validate`, `prisma format` and `prisma generate`
(Prisma 6). From an empty database it creates 73 tables and 43 enum types.

## 2.1 From the JSON books to tables

| `Db` key in `types.ts` | Table(s) | Notes |
|---|---|---|
| `company`, `openingCash`, `businessTypes` | `Tenant` | `courier` and `messaging` settings stay JSON (`courierSettings`, `messagingSettings`) |
| `users` | `User` (+ `Session`) | Email unique across the platform, as today. Password hash lives on `User` |
| `roles` | `Role` | `perms` stays JSON `{ pageId: 'view' \| 'edit' }`; `key = 'owner'` is the system role |
| `fieldDefs` | `FieldDef` | Values stay in each record's `custom` JSON |
| `seq` | `Counter` | One row per counter key: `inv`, `fo`, `imp`, `exp`, `pb`, `trip`, `est`, `qt`, `dl`, `cl`, `rt`, `fa`, `pd` |
| `categories` | `Category` | Self-relation for the tree |
| `products` (+ `sources`, `supplierIds`, `recipe`) | `Product`, `ProductSupplier`, `RecipeLine` | `stock` is a cached total; `StockMove` is the ledger |
| `adjustments`, `productions` | `StockAdjustment`, `Production`, `ProductionMaterial` | |
| `factories` | `Factory` | `PartyDetails` fields are nullable columns |
| `warehouses` | `WarehouseSite` | `CREATE UNIQUE INDEX one_main_site ON "WarehouseSite"("tenantId") WHERE main;` |
| `estimates` | `FactoryEstimate`, `EstimateMaterial` | |
| `factoryOrders` (+ nested arrays) | `FactoryOrder`, `OrderMaterial`, `FactoryReceipt`, `FactoryBill`, `FactoryPayment`, `OrderAmendment`, `MaterialSettlement` | Each nested array becomes a child table |
| `suppliers`, `purchases`, `supplierPayments` | same names | |
| `imports` (import **and** export) | `Shipment`, `ShipmentStep`, `ShipmentCost`, `CustomsInfo` | `supplier` becomes `party`. Prisma enum `Direction.inbound/outbound` is stored as `'import'/'export'` |
| `dealers` | `Dealer` | `limit` becomes `creditLimit`; `salesId` points to `Employee` |
| `quotes` | `SalesQuote`, `QuoteLine` | |
| `invoices` | `Invoice`, `InvoiceLine` | The app's `id` for a final bill is the bill number, now in `no` |
| `deliveries` | `Delivery`, `DeliveryLine` | `DL-` and `CL-` numbers in `no` |
| `returns` | `SalesReturn`, `ReturnLine` | `RT-` numbers in `no` |
| `collections` | `Collection` | |
| `messages` | `MessageLog` | Adds `providerMessageId` for delivery receipts |
| `expenses` (+ `transport` link) | `Expense` | `TransportLink` flattened into `transportKind`, `vehicleId`, `tripId`, `transporter`, `factoryOrderId`, `odometer` |
| `vehicles` (+ `papers`) | `Vehicle`, `VehiclePaper` | |
| `trips` (+ `hire`) | `Trip` | `TripHire` flattened into `hire*` columns |
| `advances`, `employees`, `payroll` | `Advance`, `Employee`, `PayrollRun`, `PayrollLine` | `Employee.role` becomes `jobTitle` (so it isn't confused with access roles) |
| `parcels` | `Parcel`, `ParcelEvent` | |
| `assets` (+ `depreciation`) | `FixedAsset`, `AssetDepreciation` | `FA-2026-00001` in `no`; one depreciation row per asset per month (`@@unique([assetId, month])`) |
| `investors`, `investorTxns`, `distributions` | `Investor`, `InvestorTxn`, `ProfitDistribution` | Shares of a distribution point to it and are deleted with it |
| `transfers`, `openingAccounts` | `AccountTransfer`, `Tenant.openingAccounts` | Money moved between cash, bank and wallets |
| `company.tax`, `taxRates`, `invoices[].taxes`, `purchases[].tax`, `taxPayments` | `Tenant.taxSettings`, `TaxRate`, `InvoiceTax`, `Purchase.tax`, `TaxPayment` | A bill keeps a copy of each rate it used |
| `changeNotes` | `ChangeNote` | Written automatically on every rate, cost, regular-amount or currency change |
| `accountHeads`, `expenseAccounts`, `expenseEntries` | `AccountHead`, `ExpenseAccount`, `ExpenseEntry` | One bill per account and period: `CREATE UNIQUE INDEX ON "ExpenseEntry" ("accountId", period) WHERE kind = 'bill'` |
| `products[].barcode`, `perCarton` | `Product.barcode`, `Product.perCarton` | `CREATE UNIQUE INDEX ON "Product" ("tenantId", barcode) WHERE barcode IS NOT NULL` |
| `attachments` on payments; KV `file:<tenant>:<id>` | `attachments` JSON + `StoredFile` | Bytes in object storage (S3/R2), never in Postgres |
| KV `billing:<id>`, `billingtx:<tran>` | `Subscription`, `SubscriptionPayment` | Owned by the platform: never in the books, never changed by a books save |
| KV `courier:<t>:<p>`, `messaging:<t>:<ch>` | `IntegrationSecret` | Encrypted |
| KV `session:*`, `account:*`, `platform` | `Session`, `User`, `PlatformAdmin` | |
| KV `audit` | `AuditLog` | |
| KV `books:<id>` (Phase 1) | `BooksDoc` | Dropped after Phase 2 |

## 2.2 Conventions

- **Keys.** Primary keys are `uuid`. Records people talk about also have a `no` (business number)
  that is unique per tenant: `@@unique([tenantId, no])`. Top-level records brought over from the JSON
  books keep a `legacyId` for the migration and for support.
- **Types.**
  - Money is `Decimal(14,2)` and quantity is `Decimal(14,3)`; exchange rates are `Decimal(10,4)`.
  - A business day is `@db.Date`; a moment in time is `@db.Timestamptz(3)`.
  - A `Dated.ts` (the order within a day) becomes `createdAt`.
- **Prisma `Decimal`.** It comes back as `Prisma.Decimal` (decimal.js). Do all arithmetic with it
  in services. Turn it into a JS number only at the edge, when building the books projection or a
  response. Use the `common/money.ts` helpers: `d(x)`, `round2()`, `sumD()`.
- **Child tables.**
  - Children of a parent (lines, receipts, payments) cascade on delete.
  - References to master data (`Product`, `Dealer`, `Factory`, `Supplier`) are `Restrict`. A product
    that has been used is archived, never deleted (the `productInUse()` rule).
- **Child rows still carry `tenantId`.** Child tables that are queried on their own (receipts,
  bills, payments, costs) carry `tenantId` so that RLS and reports work without a join.
- **Naming.** Tables and columns use Prisma's default names (PascalCase tables, camelCase columns).
  In raw SQL, quote them: `"Invoice"."dealerId"`.

## 2.3 Extra SQL that Prisma cannot express

Create an empty migration (`npx prisma migrate dev --create-only --name constraints`) and paste
this in:

```sql
-- quantities and money that must never be negative
ALTER TABLE "InvoiceLine"  ADD CONSTRAINT invoice_line_qty_pos   CHECK (qty > 0 AND price >= 0);
ALTER TABLE "QuoteLine"    ADD CONSTRAINT quote_line_qty_pos     CHECK (qty > 0 AND price >= 0);
ALTER TABLE "DeliveryLine" ADD CONSTRAINT delivery_line_qty_pos  CHECK (qty > 0);
ALTER TABLE "ReturnLine"   ADD CONSTRAINT return_line_qty_pos    CHECK (qty > 0 AND price >= 0);
ALTER TABLE "Invoice"      ADD CONSTRAINT invoice_money_ok       CHECK (discount >= 0 AND received >= 0);
ALTER TABLE "SalesReturn"  ADD CONSTRAINT return_credit_ok       CHECK (credit >= 0);
ALTER TABLE "Delivery"     ADD CONSTRAINT delivery_credit_ok     CHECK (credit IS NULL OR (cancelled AND credit >= 0));
ALTER TABLE "Collection"   ADD CONSTRAINT collection_amount_pos  CHECK (amount > 0);
ALTER TABLE "FactoryPayment"  ADD CONSTRAINT factory_payment_pos  CHECK (amount > 0);
ALTER TABLE "SupplierPayment" ADD CONSTRAINT supplier_payment_pos CHECK (amount > 0);
ALTER TABLE "FactoryReceipt"  ADD CONSTRAINT receipt_qty_ok       CHECK (qty >= 0 AND damaged >= 0);
ALTER TABLE "Expense"      ADD CONSTRAINT expense_amount_pos     CHECK (amount > 0);

-- a final bill always has a number, a draft never does
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_no_when_final
  CHECK ((status = 'final') = (no IS NOT NULL));

-- product codes unique per company, but many products may have no code
CREATE UNIQUE INDEX product_code_unique ON "Product" ("tenantId", lower(code)) WHERE code <> '';

-- fast "what is still to deliver" and "pending bills" lookups
CREATE INDEX invoice_pending ON "Invoice" ("tenantId", date)
  WHERE status = 'final' AND "stockOnDelivery" AND NOT sample;

-- money reports skip sample rows; partial indexes keep them fast
CREATE INDEX invoice_real_by_date ON "Invoice" ("tenantId", date) WHERE status = 'final' AND NOT sample;
CREATE INDEX delivery_real_by_date ON "Delivery" ("tenantId", date) WHERE NOT sample;

-- search by name/phone (needs: CREATE EXTENSION IF NOT EXISTS pg_trgm;)
CREATE INDEX dealer_name_trgm  ON "Dealer"  USING gin (name gin_trgm_ops);
CREATE INDEX product_name_trgm ON "Product" USING gin (name gin_trgm_ops);
```

Do **not** add `CHECK (stock >= 0)` on `Product`. Today's books let a stock adjustment or a
workshop run take stock below zero (it shows as a warning). Delivery refuses to go below zero in the
service instead (04 §4.3).

## 2.4 Reporting views

Put these in their own migration. Reports read from them, so services don't need to load whole tables.

```sql
-- what each final, real bill still has to deliver, per product
CREATE VIEW v_invoice_to_go AS
SELECT i."tenantId", i.id AS "invoiceId", l."productId",
       SUM(l.qty) - COALESCE((
         SELECT SUM(dl.qty) FROM "Delivery" d JOIN "DeliveryLine" dl ON dl."deliveryId" = d.id
         WHERE d."invoiceId" = i.id AND dl."productId" = l."productId"), 0) AS "toGo"
FROM "Invoice" i JOIN "InvoiceLine" l ON l."invoiceId" = i.id
WHERE i.status = 'final' AND i."stockOnDelivery"
GROUP BY i."tenantId", i.id, l."productId";

-- reserved = held for bills not yet delivered (real bills only); available = stock − reserved
CREATE VIEW v_product_available AS
SELECT p."tenantId", p.id AS "productId", p.stock,
       COALESCE(SUM(t."toGo") FILTER (WHERE NOT i.sample), 0) AS reserved,
       p.stock - COALESCE(SUM(t."toGo") FILTER (WHERE NOT i.sample), 0) AS available
FROM "Product" p
LEFT JOIN v_invoice_to_go t ON t."productId" = p.id AND t."toGo" > 0
LEFT JOIN "Invoice" i ON i.id = t."invoiceId"
GROUP BY p."tenantId", p.id, p.stock;

-- daily sales facts used by sales analytics (mirrors saleFacts() in calc/sales.ts)
CREATE VIEW v_sale_facts AS
SELECT i."tenantId", i.date, i.id AS "invoiceId", i."dealerId", i."soldById",
       l."productId", l.qty, l.price, l.qty * l.price AS amount, l.qty * COALESCE(l.cost, 0) AS cost
FROM "Invoice" i JOIN "InvoiceLine" l ON l."invoiceId" = i.id
WHERE i.status = 'final' AND NOT i.sample;
```

Views run with the rights of the person querying them, so RLS (below) still applies. On Postgres 15
and later, create them `WITH (security_invoker = true)`.

## 2.5 Tenant scoping in Prisma

The `PrismaService` extends `PrismaClient` and offers `withTenant(tenantId, fn)`. It opens an
interactive transaction, sets the RLS variable and hands back a client that adds `tenantId` itself:

```ts
// src/infra/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect() }

  /** Every tenant read and write goes through here. */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>, opts?: { timeout?: number }) {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return fn(tx as TenantTx)
    }, { isolationLevel: 'ReadCommitted', timeout: opts?.timeout ?? 10_000 })
  }
}
```

Also add a Prisma **client extension** (`$extends({ query: { $allModels: { … } } })`). For models
that have a `tenantId` column, it:

- throws if a `findMany`/`updateMany`/`deleteMany` has no `tenantId` in `where`;
- fills in `tenantId` on `create`.

It is a safety net for developer mistakes. RLS is the real lock.

## 2.6 Row-level security

```sql
-- the app connects as exin_app (not the table owner), so RLS is enforced
CREATE ROLE exin_app LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA public TO exin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO exin_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO exin_app;

-- repeat for every table that has "tenantId"
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE column_name = 'tenantId' AND table_schema = 'public' AND table_name NOT LIKE 'v\_%'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid)$p$, t);
  END LOOP;
END $$;
```

- **Child tables without `tenantId`** (`InvoiceLine`, `DeliveryLine`, `QuoteLine`, `ReturnLine`,
  `OrderMaterial`, `EstimateMaterial`, `ProductionMaterial`, `RecipeLine`, `ShipmentStep`,
  `ParcelEvent`, `PayrollLine`, `VehiclePaper`) get a policy through their parent:
  `USING (EXISTS (SELECT 1 FROM "Invoice" p WHERE p.id = "invoiceId"))`. The parent's own policy
  already filters by tenant.
- **Tables outside any one tenant** (`Tenant`, `User` for sign-in, `Session`, `PlatformAdmin`,
  `AuditLog` for the platform) are reached by the `AuthModule` and `PlatformModule` through a second
  connection as `exin_platform`, which has `BYPASSRLS`. Only those two modules may use it.
- **Migrations** run as the owner role (`DATABASE_URL_MIGRATE`), never as `exin_app`.

## 2.7 Migrations workflow

```bash
npx prisma migrate dev --name <change>          # local: make and apply a migration
npx prisma migrate dev --create-only --name x   # for raw SQL (RLS, checks, views)
npx prisma migrate deploy                       # CI/production: apply pending migrations
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $SHADOW_URL  # drift check in CI
```

- Never edit a migration that has been applied anywhere. Add a new one.
- Make backwards-compatible changes. Add a column as nullable, backfill it, then make it required in a
  later release. The old and new API versions run side by side during a deploy.
- Put the seed in `prisma/seed.ts` (`"prisma": { "seed": "tsx prisma/seed.ts" }`). It creates the
  platform owner from env and, when `DEMO_ACCOUNTS=1`, the demo company. Build the demo data with the
  same `demoDb()` from `shared/domain/seed.ts`, run through the importer from 08, so the demo matches
  the app exactly.

## 2.8 Connection and performance settings

- Put PgBouncer (transaction mode) or Neon's pooled URL in front of Postgres. Add
  `?pgbouncer=true&connection_limit=10` to `DATABASE_URL` and use `directUrl` for migrations.
- Set `statement_timeout = 15s` for `exin_app`, and `idle_in_transaction_session_timeout = 30s`.
- Use transactions for commands only. Read-only list endpoints use a plain query that still sets
  `app.tenant_id`. Use `withTenant` with a short timeout, or a read-only transaction.
- Large tenants: `Invoice`, `StockMove`, `AuditLog` and `MessageLog` grow fastest. They are indexed by
  `(tenantId, date)`. Consider partitioning `AuditLog` by month once it passes about 10 million rows.
