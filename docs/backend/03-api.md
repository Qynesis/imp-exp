# 3. API

All routes live under `/api`. Bodies are JSON. The session token goes in `Authorization: Bearer
<token>`. Every error has the shape `{ "error": "Human readable message" }`. The app already shows
that text as it is, so write messages for people, not developers.

| Status | When |
|---|---|
| 400 | Bad input or a refused rule ("Only 30 cartons of Soap is left on SB-1042") |
| 401 | No session or it expired ("Please sign in again.") |
| 403 | Signed in but not allowed ("Your role is view-only.", "Only an admin can do that.") |
| 404 | Unknown route or record |
| 402 | Subscription ended: the books are read-only until a plan is paid |
| 409 | Version conflict ("Someone else changed the books.") or duplicate (email taken) |
| 429 | Too many sign-in attempts |
| 502 | The courier or SMS/WhatsApp provider failed (its message is passed on) |
| 503 | Database not reachable |

## 3.1 Phase 1: compatibility API (must match `shared/api/core.ts` exactly)

These are the routes the React app calls today (`src/core/store/StoreProvider.tsx` and
`src/core/api*`). Request and response types are in `shared/api/contract.ts`. Import that file;
don't copy it.

| Method and path | Auth | Body → Response | Rules |
|---|---|---|---|
| `GET /api/status` | public | → `StatusResponse` | `demo` lists demo logins only when `DEMO_ACCOUNTS=1` |
| `POST /api/signup` | public | `SignupRequest` → `BooksResponse` | Creates tenant, owner user, books (empty or sample), applies business types. 409 if email taken |
| `POST /api/login` | public, rate limited | `LoginRequest` → `BooksResponse` or `PlatformLoginResponse` | Platform email returns `{ platform: true, token }`. Hash even for unknown emails (no timing leak) |
| `POST /api/logout` | token | → `{ ok }` | Deletes the session |
| `GET /api/books?v=N` | user | → `BooksResponse` or `{ same: true, version, billing }` | `same` when N equals the current version (cheap polling). Every books answer carries the `billing` summary |
| `PUT /api/books` | user, any edit right | `SaveBooksRequest` → `{ version }` | 402 when the subscription has ended (not for the platform owner). 409 if `baseVersion` ≠ current. `users` are always kept from the server; non-admins can't change `roles`, `company`, `fieldDefs`, `businessTypes`; the Owner role must remain |
| `POST /api/users` | admin | `NewUserRequest` → `{ db, version }` | 409 if email taken |
| `PATCH /api/users` | admin | `EditUserRequest` → `{ db, version }` | Keep at least one Owner; a password change ends that user's other sessions |
| `DELETE /api/users?id=` | admin | → `{ db, version }` | Not yourself; not the last Owner |
| `GET /api/courier/settings` | admin | → per provider `{ hints, configured, fromServer }` | Never return a secret, only `•••• 1234` |
| `PUT /api/courier/settings` | admin | `{ provider, values, clear? }` → `{ ok }` | Empty box keeps the saved value |
| `POST /api/courier/book` | editor | `BookRequest + provider` → `{ consignmentId, trackingCode, trackingUrl, status, charge? }` | Needs name, phone, address, invoice |
| `POST /api/courier/status` | user | `{ provider, consignmentId, test? }` → `{ status }` | |
| `POST /api/courier/track` | user | `{ provider, code, test? }` → tracking result | |
| `POST /api/courier/areas` | user | `{ provider, parentId }` → `{ areas }` | Pathao city→zone, RedX areas |
| `POST /api/courier/balance` | user | `{ provider }` → `{ balance }` | |
| `POST /api/courier/test` | admin | `{ provider }` → `{ message }` | Checks the keys work |
| `GET /api/messaging/settings` | admin | → per channel `{ hints, configured, fromServer }` | |
| `PUT /api/messaging/settings` | admin | `{ channel, values, clear? }` → `{ ok }` | |
| `POST /api/messaging/send` | editor | `{ channel, to, text, test? }` → `{ id }` | Test mode (company or request) sends nothing |
| `GET /api/billing` | user | → `BillingView` | Summary, payments (newest first), whether online payment is offered, manual payment details |
| `POST /api/billing/claim` | admin | `{ plan, method: bkash\|nagad\|rocket\|bank, tranId, sender, paidOn, note }` → `BillingView` | "I paid": a `pending` payment for the platform owner. 409 if the transaction id was already sent |
| `POST /api/billing/checkout` | admin | `{ plan }` → `{ url }` or `{ test, tranId }` | Starts an SSLCommerz checkout; `test` when payments are simulated |
| `POST /api/billing/test-pay` | admin | `{ tranId, result: paid\|cancelled }` → `BillingView` | Only in test mode |
| `POST /api/billing/return` | public | gateway form `{ tran_id, val_id, status }` → 303 to `#/settings/billing?payment=…` | Validates `val_id` with SSLCommerz before marking paid; `?ipn=1` answers JSON |
| `POST /api/files` | editor, active plan | `{ name, type: image/jpeg\|png\|webp\|gif\|application/pdf, data: base64 }` → `{ id, name, type, size }` | Up to 3 MB; photos are shrunk in the browser first. Linked to a payment with the `attach` command |
| `GET /api/files?id=` | user | → `{ name, type, data }` | Only the owner company's files (404 for others) |
| `DELETE /api/files?id=` | editor | → `{ ok }` | |
| `GET /api/platform/companies` | platform | → `{ companies: CompanySummary[] }` | Includes each company's `billing` summary and pending `claims` |
| `POST /api/platform/billing` | platform | `{ tenantId, action: approve\|reject\|extend\|free\|unfree, paymentId?, reason?, days? }` | Audited |
| `POST /api/platform/open` | platform | `{ tenantId }` → `BooksResponse` | 4-hour session as the company owner; audited |
| `POST /api/platform/password` | platform | `{ email, password }` → `{ ok }` | Ends that user's sessions; audited |

In Phase 1, `BooksService` reads and writes the `BooksDoc` row (jsonb). The compare-and-save is one
statement:

```sql
UPDATE "BooksDoc" SET db = $1, version = version + 1, "updatedAt" = now()
WHERE "tenantId" = $2 AND version = $3
RETURNING version;          -- no row back = 409
```

The quickest way to get Phase 1 exactly right is to **reuse `createApi()` from `shared/api/core.ts`**
inside one NestJS controller. Give it a `KvStore` backed by Prisma and a `CryptoKit`, and send
`@All('*')` to `api.handle()`. Then move routes one by one into real NestJS controllers, keeping the
e2e tests green (07 §7.3).

## 3.2 Phase 2: the command API

In Phase 2 nobody saves the whole books any more. Every change the app makes is already a named
action in `shared/domain/actions.ts`, called through `act(name, payload)` in the store. Phase 2 sends
exactly that to the server:

```
POST /api/commands/:name
Headers: Authorization, Idempotency-Key: <uuid made by the browser per action>
Body:    { "payload": { …same payload as actions.ts… }, "baseVersion": 1042 }
200      { "ok": true, "version": 1043, "result": { "id": "SB-1043" } }
4xx      { "error": "Only 30 cartons of Soap is left on SB-1042" }
```

- `baseVersion` is informational. Commands are checked against the current rows, not the version.
  Two people can deliver against different bills at the same moment without a 409. The response
  `version` tells the app to refresh (`GET /api/books?v=`).
- `Idempotency-Key` is stored in `IdempotencyKey` for 24 hours. A retry with the same key returns
  the first answer and does nothing new. Use it on every command: networks in Bangladesh drop
  requests.
- The `CommandsController` looks the command up in a registry:
  `{ name → { page, level, dto, handler } }`. It checks the permission, validates the DTO, calls the
  service and writes the audit row.
- `GET /api/books` keeps working. In Phase 2 it is **built from the tables** by `BooksProjection` (an
  object of type `Db`), so every screen keeps working unchanged. Cache it per `(tenantId,
  booksVersion)` in Redis.

### Command registry

The page and level are the permission needed (see 05 §5.4). "Admin" means `settings: edit`.

| Command | Page / level | Service | Payload (see `actions.ts` for exact types) |
|---|---|---|---|
| `saveCompany` | admin | Tenancy | `Partial<Company>` (not courier/messaging) |
| `setBusinessTypes` | admin | Tenancy | `BusinessTypeId[]` |
| `saveRole`, `removeRole` | admin | Access | `{ id?, name, perms }`, `id` |
| `addField`, `removeField` | admin | CustomFields | `{ entity, label, type, options }`, `id` |
| `addCategory`, `saveCategory`, `removeCategory` | products edit | Catalog | |
| `saveProduct`, `archiveProduct`, `removeProduct` | products edit | Catalog | Remove only when `productInUse` is false |
| `adjustStock` | products edit | Catalog | `{ productId, qty(signed), reason, note, date }` |
| `produce` | products edit | Catalog | `{ productId, qty, materials[{productId, given}], extraCost, note, date }` |
| `addFactory` | factory-orders edit | Factory | |
| `saveEstimate`, `setEstimateStatus`, `removeEstimate` | factory-orders edit | Factory | Status `draft → sent → approved/rejected → ordered` |
| `newFactoryOrder` | factory-orders edit | Factory | `{ factoryId, type, productId, qty, rate, placed, expected, advance, method, materials, custom, estimateId? }` |
| `amendOrder` | factory-orders edit | Factory | `{ orderId, qty, rate, date, reason }` |
| `receiveShipment` | factory-orders edit | Factory | `{ orderId, date, challan, qty, damaged, note, freight?, freightInCost?, method? }` |
| `factoryBill`, `payFactory` | factory-orders edit | Factory | |
| `settleFactoryMaterial` | factory-orders edit | Factory | `{ orderId, productId, qty, kind: returned\|wasted, note, date }` |
| `addSupplier`, `newPurchase`, `paySupplier` | suppliers edit | Purchasing | |
| `newImport`, `addImportCost`, `markImportStep` | imports edit | Trade | |
| `saveCustoms`, `toggleCustomsDoc`, `markCustomsStage` | customs edit | Trade | |
| `saveDealer` | dealers edit | Sales | |
| `saveQuote`, `setQuoteStatus`, `removeQuote` | sell edit | Sales | |
| `saveInvoice` | sell edit | Sales | `{ id, data, final, deliverNow?, quoteId? }` |
| `collect` | cashbook edit **or** sell edit | Sales | `{ dealerId, invoiceId, amount, method, collectedBy, date }` |
| `recordDelivery`, `closeRemainder`, `undoDelivery` | deliveries edit | Delivery | |
| `recordReturn` | deliveries edit | Delivery | `{ invoiceId, dealerId, lines[{productId, qty, price}], condition, credit, reason, note, date }` |
| `loadSampleDelivery`, `removeSampleDelivery` | deliveries edit | Delivery | |
| `saveVehicle`, `archiveVehicle` | transport edit | Transport | |
| `saveTrip`, `setTripStatus`, `addTransportCost` | transport edit | Transport | |
| `saveCourierSettings` | admin | Courier | `CourierSettings` (no keys) |
| `saveParcel`, `setParcelStatus` | courier edit | Courier | |
| `loadSampleParcels`, `removeSampleParcels` | courier edit | Courier | |
| `saveMessaging` | admin | Messaging | `MessagingSettings` |
| `logMessage` | messages edit | Messaging | Normally written by the server itself when it sends |
| `addExpense` | cashbook edit | Money | |
| `addAdvance`, `saveEmployee`, `payPayroll`, `setSalesTargets` | employees edit | People | |
| `addTransfer`, `removeTransfer`, `setOpeningBalances` | cashbook edit | Money | |
| `saveAsset`, `removeAsset`, `runDepreciation`, `undoDepreciation`, `disposeAsset`, `undoDisposal` | fixed-assets edit | Assets | |
| `setCountry`, `saveTaxSettings`, `saveTaxRate`, `payTax`, `removeTaxPayment` | accounts edit (country: admin) | Accounts | A rate change without a note is refused |
| `addChangeNote`, `removeChangeNote`, `updateCost` | accounts edit | Accounts | |
| `saveAccountHead`, `archiveAccountHead`, `saveExpenseAccount`, `expenseEntry`, `removeExpenseEntry` | expenses edit | Expenses | |
| `attach`, `detach` | edit on the payment's screen | Files | `{ target: collection\|supplierPayment\|factoryPayment\|expense\|advance\|investorTxn\|transfer\|taxPayment\|expenseEntry, id, file }` |
| `saveInvestor`, `investorMoney`, `removeInvestorTxn`, `setInvestorStatus`, `distributeProfit`, `undoDistribution` | investors edit | Investors | |
| `replaceAll` | admin | Books | Restore a backup: runs the importer from 08 inside one transaction |

### Frontend change for Phase 2 (one place)

In `src/core/store/StoreProvider.tsx`, `act(name, payload)` currently:

1. runs the action on a copy of the books;
2. sets state;
3. saves the whole books later (debounced).

In Phase 2 it should:

1. run the action locally, as now, so the screen updates at once and local refusals still show;
2. `POST /api/commands/:name` with an idempotency key;
3. on success, keep the local state and note the new version; the next poll brings the
   server-computed books;
4. on 4xx, roll back to the books from before the action and show `error` (the sheet stays open,
   as it does today when `act` returns a reason).

Remove the debounced `PUT /api/books`. Keep it behind a flag only for the browser-only mode.

## 3.3 Phase 3: REST resources (paged)

Add these as screens outgrow the whole-books download. Every list takes `?page=1&pageSize=50` (up to
200), plus `q` (search), `from`/`to` (dates) and `sort`. It returns:

```json
{ "items": [ … ], "page": 1, "pageSize": 50, "total": 1234 }
```

| Resource | Notes |
|---|---|
| `GET /api/v2/products?kind=raw&archived=false&lowStock=true` | includes `reserved`, `available` from `v_product_available` |
| `GET /api/v2/products/:id/stock-moves` | the stock history screen |
| `GET /api/v2/dealers/:id/ledger` | debts, open bills, due, overdue days (04 §4.6) |
| `GET /api/v2/invoices?status=final&dealerId=&pending=true` | `pending` = still has goods to deliver |
| `GET /api/v2/invoices/:no` | with lines, deliveries, returns, collections, parcels |
| `GET /api/v2/deliveries/pending` | the delivery queue with to-go lines |
| `GET /api/v2/deliveries/loading-list` | per product: still to go, stock, number of bills |
| `GET /api/v2/returns?from=&to=` | with the reason summary |
| `GET /api/v2/factory-orders/:no` | with receipts, bills, payments, amendments, settlements, `foCalc` totals |
| `GET /api/v2/factory-orders/:no/payments.pdf` | printable payment history (also shared on WhatsApp) |
| `GET /api/v2/shipments?direction=import&stage=port` | |
| `GET /api/v2/transport/vehicles/:id/stats?from=&to=` | `vehicleStats` |
| `GET /api/v2/transport/alerts` | expiring papers, service due |
| `GET /api/v2/reports/pnl?month=YYYY-MM` | `profitAndLoss` in SQL |
| `GET /api/v2/reports/sales?grain=day\|month\|year&anchor=` | series, breakdown, targets |
| `GET /api/v2/reports/receivables`, `/payables`, `/cashbook?date=` | |
| `GET /api/v2/messages?from=&to=&channel=` | message log |
| `GET /api/v2/parcels?status=` | |
| `GET /api/v2/export/books` | the whole `Db` as JSON (backup button) |

Writes stay as commands. Don't add `PUT /products/:id` style endpoints next to commands. One write
path keeps the rules in one place.

## 3.4 DTOs and validation

- One class per command payload in `modules/<area>/dto/`. Use `class-validator` with `@IsUUID()`,
  `@IsISO8601({ strict: true })` for dates, `@IsNumberString()` or `@IsNumber({ maxDecimalPlaces: 3 })`
  for quantities, `@Min(0)`, `@ValidateNested({ each: true })` with `@Type(() => LineDto)`, and
  `@ArrayMinSize(1)` for lines.
- **Ids in payloads.** The app sends the ids it sees in the books:
  - for records with business numbers, the number (`SB-1042`, `FO-12`, `DL-58`);
  - for everything else, the uuid.
  
  Resolve them with `resolveRef(tx, model, ref)`, which tries `no`, then `id`. During migration it
  also tries `legacyId`.
- Use `whitelist: true`, so unknown fields are dropped and logged. Cap lengths: names 200, notes
  2000, phone 20 (store as typed; normalise to `8801XXXXXXXXX` only when sending).
- Response mapping: convert `Decimal` to `number` and `Date` (business day) to `'YYYY-MM-DD'` in one
  serializer (`toApi()`). Never send the `Date` object; time zones would shift the day.

## 3.5 Example: one command end to end

```ts
// modules/delivery/delivery.controller.ts (inside the commands registry)
registry.add('recordDelivery', {
  page: 'deliveries', level: 'edit', dto: RecordDeliveryDto,
  run: (ctx, dto) => this.delivery.record(ctx, dto),
})

// modules/delivery/dto/record-delivery.dto.ts
export class QtyLineDto {
  @IsString() productId!: string
  @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() qty!: number
}
export class RecordDeliveryDto {
  @IsString() invoiceId!: string
  @IsISO8601({ strict: true }) date!: string
  @ValidateNested({ each: true }) @Type(() => QtyLineDto) @ArrayMinSize(1) lines!: QtyLineDto[]
  @IsIn(['own', 'courier', 'pickup', 'hired']) via!: DeliveryVia
  @IsOptional() @IsString() tripId?: string
  @IsOptional() @IsString() parcelId?: string
  @IsString() @MaxLength(200) receivedBy!: string
  @IsString() @MaxLength(2000) note!: string
}
```

The service is shown in 04 §4.3.
