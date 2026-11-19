# 8. Migration plan

Companies already have books saved as JSON: in `server/data` files, in the Postgres `docs` table
(`books:<tenantId>`, `account:<email>`, `tenant:<id>`, `courier:…`, `messaging:…`), or in browser
localStorage for frontend-only use. This plan moves them to the new backend without losing a single
record or changing a single total.

## 8.1 Step by step

| Step | What | How to check | Roll back |
|---|---|---|---|
| 0 | Freeze the current API contract: record the request/response of every route with the demo company | Saved fixtures | — |
| 1 | **Phase 1 live**: NestJS serving the same API with `BooksDoc` (jsonb). Copy KV keys across: `books:*` → `BooksDoc`, `tenant:*` → `Tenant`, `account:*` → `User` (keep the scrypt hash), `platform` → `PlatformAdmin`, `courier:*`/`messaging:*` → `IntegrationSecret` (encrypt on copy) | Fixtures replay identically; the app works with no change | Point the app back at the old server; nothing was deleted |
| 2 | Create the relational tables (`prisma migrate deploy`) next to `BooksDoc` | `prisma migrate status` | Drop the new tables |
| 3 | Run the **importer** per tenant in a dry run: JSON → rows inside a transaction that is rolled back; print the reconciliation report | Report shows zero differences | — |
| 4 | Import for real, one tenant at a time, during a quiet hour. Lock that tenant's books (read-only flag) for the minute it takes | Reconciliation = 0; projection equals the JSON (parity check) | Delete that tenant's rows; keep using `BooksDoc` |
| 5 | Switch that tenant to Phase 2 (`Tenant.storage = 'relational'` flag): `GET /books` from the projection; `PUT /books` refused with 409 "Please refresh"; commands on | Users work normally; the stock check stays at zero for a week | Flip the flag back; re-import from the last `BooksDoc` + replay the commands from the audit log |
| 6 | After every tenant has run two weeks on Phase 2: remove `PUT /books` and stop writing `BooksDoc` | — | — |
| 7 | Phase 3: screens move to paged endpoints one by one | Per-screen e2e | Per screen |

The flag means each company moves on its own. Start with the demo company, then a friendly customer,
then everyone.

## 8.2 The importer

`src/modules/books/import-books.ts`: `importBooks(tx, tenantId, db: Db)`. The same code is used for
migration, `replaceAll` (restoring a backup) and the parity tests.

1. `isDb(db)` must pass. Fill in arrays missing from older books with `[]` (`adjustments`,
   `productions`, `vehicles`, `trips`, `estimates`, `parcels`, `deliveries`, `returns`, `quotes`,
   `messages`), as the app does.
2. Build an **id map** `legacyId → uuid` for every record with a legacy id. Insert master data first,
   in this order:
   - roles
   - employees
   - users (link the employee and role)
   - categories (parents first, a topological sort)
   - suppliers
   - products, then product suppliers and recipes
   - factories
   - dealers (with `salesId` mapped to an employee)
   - vehicles and papers
3. Then documents in date order. Keep business numbers from the JSON ids:
   - invoices: `no = id` when final;
   - factory orders: `FO-n`;
   - shipments: `IMP-`/`EXP-`;
   - deliveries: `DL-`/`CL-`;
   - returns: `RT-`;
   - quotes and estimates;
   - trips.
   
   Children come from the nested arrays (receipts, bills, payments, amendments, settlements,
   materials, costs, steps, customs, lines, events).
4. Old bills without `stockOnDelivery` keep `false`. They are never in the delivery queue.
5. `ts` (order within a day) becomes `createdAt = date 00:00 Asia/Dhaka + ts milliseconds`, so lists
   keep their order.
6. **Counters**: set each `Counter.next` from `db.seq` (`inv`, `fo`, `imp`, `exp`, `pb`, `trip`, `est`,
   `qt`). Set `dl`, `cl` and `rt` to 1 + the highest number found.
7. **Stock**: do **not** replay history to rebuild stock. Write one `opening` `StockMove` per
   product, equal to the current `stock`, dated the import day. History before that stays readable
   from the documents themselves. `stockHistory()` already rebuilds moves from documents, so the
   stock history screen still shows the past.
8. Company: `company.*`, `openingCash` and `businessTypes` go to `Tenant`; `courier` and `messaging`
   go to the JSON columns; `logo` data URLs are uploaded to storage (6.6).
9. Sample rows keep `sample = true` / `test = true`.

## 8.3 Reconciliation report (must be all zeros)

Compare the JSON (using `shared/domain/calc`) with the projection built from the new rows (using the
same calc functions):

| Check | JSON | Rows |
|---|---|---|
| Count of every record type | `db.invoices.length` … | `count(*)` per table |
| Stock per product | `product.stock` | `Product.stock` and `SUM(StockMove.qty)` |
| Reserved per product | `reservedQty()` | `v_product_available.reserved` |
| Due per dealer | `dealerLedger().due` | ledger from rows |
| Due per supplier | `supplierLedger()` | from rows |
| Factory order totals | `foCalc()` received, billed, paid, balance | from rows |
| Cash balance per day for the last 90 days | `cashForDay()` | from rows |
| P&L for the last 12 months | `profitAndLoss()` | from rows |
| Sales by month | `salesSeries()` | `v_sale_facts` |

Compare money to the paisa (0.01) and quantities to 0.001. Any difference stops the import for that
tenant.

## 8.4 The books projection (Phase 2 `GET /api/books`)

`BooksProjection.build(tenantId): Db` reads every table for the tenant (one query per table, in
parallel inside a read-only transaction) and puts the `Db` shape back together:

- Ids:
  - records with business numbers use the number as `id` (`SB-1042`, `FO-12`, `DL-58`);
  - drafts and master data use the uuid;
  - line `productId`s are uuids.
- Decimals become numbers; dates become `'YYYY-MM-DD'`; `ts` = `createdAt` milliseconds.
- Nested arrays are rebuilt (factory order receipts, bills, payments…; shipment steps and customs;
  vehicle papers; trip hire; expense transport link).
- `seq` is filled from `Counter`, so local previews number things the same way.
- The response is cached in Redis per `(tenantId, booksVersion)`. `GET /books?v=` answers
  `{ same: true }` without building anything when the version has not changed.

When a company's books grow past about 5 MB of JSON, that is the signal to move its heaviest screens
(invoices, stock history, messages) to the paged Phase 3 endpoints.

## 8.5 Frontend changes, in order

1. **Phase 1**: none. Set the API URL.
2. **Phase 2**:
   - `StoreProvider.act()` sends the command (03 §3.2) instead of the debounced `PUT /books`;
   - roll back and show the server's `error` on refusal;
   - add the `Idempotency-Key` header.
   
   Everything else stays.
3. **Phase 3**, per screen: replace `useBooks()` reads with fetch hooks for the paged endpoints
   (keep `DataTable`'s `pageSize`, switching to server paging). Start with Invoices, Stock history,
   Messages and Parcels.
4. Remove the browser-side auto reminders (`AutoReminders.tsx`) once the server job (06 §6.4) is
   live for that tenant. The app should check `messagingSettings.serverReminders` and skip.

## 8.6 Done means

- [ ] Every tenant is on Phase 2, reconciliation was zero, and the stock check has stayed at zero
      for 14 days.
- [ ] No `PUT /books` calls in the logs for 14 days.
- [ ] All parity and e2e tests pass in CI on every merge.
- [ ] Backups have been restored once as a test.
- [ ] The platform owner has 2FA, and `DEMO_ACCOUNTS=0` in production.
- [ ] The old KV `docs` table is archived (dumped) and dropped.
