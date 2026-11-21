# 4. Business rules

These rules come from `shared/domain/actions.ts` and `shared/domain/calc/*`. The server must follow
them exactly: the app shows the same numbers, and the parity tests in 07 compare the two. When this
document and the code disagree, the code wins. Then fix this document.

## 4.1 How every command runs

```ts
async record(ctx: TenantContext, dto: RecordDeliveryDto) {
  return this.prisma.withTenant(ctx.tenantId, async (tx) => {
    // 1. lock what you will change, in a fixed order (parent first, then products sorted by id)
    // 2. check every rule; throw DomainError(400, '<message for people>') on the first failure
    // 3. write rows: the record, its lines, StockMove rows, product.stock, ledger rows
    // 4. take numbers from Counter inside this transaction
    // 5. bump Tenant.booksVersion; write AuditLog
    // 6. return { id/no } — side effects (messages, courier) are queued AFTER commit
  })
}
```

**Locking.** Use `SELECT … FOR UPDATE` through raw SQL. Prisma has no `forUpdate` option.

```ts
await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`
await tx.$queryRaw`SELECT id, stock FROM "Product" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`
```

Always lock products in id order. Two deliveries that share products then queue up instead of
deadlocking.

**Counters.**

```ts
async function nextNo(tx, tenantId: string, key: string): Promise<number> {
  const [r] = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO "Counter" ("tenantId", key, next) VALUES (${tenantId}::uuid, ${key}, 2)
    ON CONFLICT ("tenantId", key) DO UPDATE SET next = "Counter".next + 1
    RETURNING next - 1 AS n`
  return r.n
}
// invoice:  `${tenant.invoicePrefix}${await nextNo(tx, t, 'inv')}`
// FO-12, IMP-007 (padStart 3), EXP-003, TR-…, EST-…, QT-…, DL-…, CL-…, RT-…
```

A rolled-back transaction also rolls back the counter. Numbers are gap-free for committed records.

**Rounding.** Round money to 2 decimals and cost per unit to 2 decimals, as `Math.round(x*100)/100`
does in the code. Quantities keep 3 decimals. Use `Decimal` throughout.

**Rows that only change with a reason.** Never update or delete a posted money or stock row
(payment, delivery, return, receipt, stock move) in place. Reverse it with a new command. The only
deletes allowed are `undoDelivery`, `removeQuote`, `removeEstimate`, the sample-data removers and
deleting a draft invoice.

## 4.2 Stock

- `Product.stock` is a cached sum. **Every** change to it writes one `StockMove` in the same
  transaction:

  | Event | Move kind | Qty |
  |---|---|---|
  | Opening (migration) | `opening` | + stock at cut-over |
  | Stock adjustment | `adjustment` | ± qty |
  | Purchase from supplier | `purchase` | + qty |
  | Import reaches warehouse (`markImportStep` key `warehouse`) | `import_in` | + shipment qty |
  | Export shipped (`markImportStep` key `shipped`, direction export) | `export_out` | − shipment qty |
  | Factory order placed (type 1: materials handed over) | `factory_material_out` | − given, per material |
  | Leftover material taken back (`settleFactoryMaterial` returned) | `factory_material_back` | + qty |
  | Factory lot received | `factory_receipt` | + received qty (damaged is recorded, not added) |
  | Workshop production | `production_in` / `production_material_out` | + made / − each material |
  | Delivery | `delivery` | − qty (not for cancelled/closed, not for sample) |
  | Undo delivery | `delivery_undo` | + qty |
  | Return in good condition | `return_in` | + qty (not damaged, not sample) |

- **A bill does not move stock.** Since the delivery section was added, a final invoice reserves
  stock and the delivery takes it out (`stockOnDelivery = true`). Old bills migrated from before
  then have `stockOnDelivery = false`: their stock already left when they were billed, and they
  never appear in the delivery queue.
- **Reserved** = what final, real, `stockOnDelivery` bills still have to deliver.
  **Available** = stock − reserved (`v_product_available`). Sales screens warn when a new bill asks
  for more than is available. They warn, they don't block: the company may be expecting goods.
- **Low stock**: `!archived && lowAt > 0 && stock <= lowAt`.
- **Nightly check**: `SUM(StockMove.qty) = Product.stock` per product. Alert on any difference.

### Cost per unit

| Event | New `Product.cost` |
|---|---|
| Purchase | `= rate` of that purchase (last price, as the app does today) |
| Import reaches warehouse | `= landed ÷ qty`, where `landed = usd × rate + Σ shipment costs` |
| Factory receipt with freight **included** in cost | moving average: `(max(stock,0) × cost + qty × (orderRate + freight ÷ qty)) ÷ (max(stock,0) + qty)` |
| Factory receipt, freight not included | unchanged; the freight is only a transport expense |
| Workshop production | `= (Σ materials given × material cost + extraCost) ÷ qty made` |
| Export shipped | `Shipment.unitCost = product.cost` at that moment (frozen) |

Final invoice lines **freeze** `name`, `unit` and `cost` from the product at the moment of billing.
Profit on old bills never changes.

## 4.3 Delivery (partial deliveries allowed)

```
still to go (per product on a bill) = billed qty − Σ delivered qty − Σ closed (cancelled) qty
```

`recordDelivery { invoiceId, date, lines, via, tripId?, parcelId?, receivedBy, note }`:

1. The bill must be `final` and `stockOnDelivery`. Otherwise: "This bill does not wait for delivery".
2. Drop lines with qty ≤ 0. If none are left: "Nothing delivered".
3. For each line:
   - The product must be on the bill: "`<name>` is not on bill `<no>`".
   - `qty ≤ still to go`: "Only `<left> <unit>` of `<name>` is left on `<no>`".
   - Unless sample: `qty ≤ product.stock`: "Only `<stock> <unit>` of `<name>` in the warehouse".
4. Unless sample, take the stock out and write a `delivery` StockMove.
5. Create `Delivery` (`no = DL-n`), with `dealerId` taken from the bill and `sample` copied from the bill.
6. After commit, if auto messages for `delivery` are on, queue a delivery message.

When `deliverNow` is set, `saveInvoice` runs this same function for the whole bill, with `via =
pickup` and the note "Handed over with the bill".

**Close the rest** (`closeRemainder { invoiceId, date, credit, note }`): the dealer no longer wants
what is left.

- Make a `Delivery` with `cancelled = true` and `no = CL-n` for everything still to go.
- No stock moves.
- `credit` (≥ 0) comes off the dealer's due.
- If nothing is left: "Nothing left to close".

**Undo a delivery** (`undoDelivery id`):

- Allowed only if returns on that bill do not exceed what would remain delivered. Otherwise:
  "Goods from this delivery were returned; undo the return first".
- Unless it was cancelled or sample, the goods go back into stock (`delivery_undo`).
- The bill waits again.

**Delivery status of a bill**: `pending` (nothing gone), `partial`, `delivered` (nothing left to go),
`closed` (rest cancelled).

**Loading list**: per product, the total still to go on real bills, with current stock and the
number of bills. Used to load the truck.

## 4.4 Returns

`recordReturn { invoiceId, dealerId, lines[{productId, qty, price}], condition, credit, reason, note, date }`:

1. Drop lines with qty ≤ 0. If none are left: "Nothing returned".
2. The bill must belong to the dealer: "That bill belongs to another dealer".
3. Per product, at most what actually went out minus what already came back:
   - `out` = Σ delivered (not cancelled) on `stockOnDelivery` bills, or the billed qty on old bills;
   - otherwise: "Only `<n>` of that item can come back on `<no>`".
4. `condition = restock` and not sample: the goods go back into stock (`return_in`).
   `damaged`: no stock movement.
5. `credit` comes off the dealer's due. Use 0 when the goods are replaced instead.
6. `no = RT-n`; `sample` is copied from the bill.

Reasons come from a fixed list in the app (`src/features/deliveries/returnReasons.ts`) plus free
text. Store the text as given.

## 4.5 Selling, quotes and bills

- **Quote (estimate) flow**: `draft → sent → approved | rejected`; an approved quote becomes an
  invoice (`invoiced`, `invoiceId` set).
  - Changing a quote that was sent or approved sends it back to `draft`. It must be approved again.
  - A quote that is `invoiced` cannot change.
- **Invoice**:
  - A draft can be saved many times and has no number.
  - Making it final gives it the next number (`invoicePrefix + inv`), freezes the line
    name/unit/cost, sets `stockOnDelivery = true` and stores `total = Σ qty×price − discount`.
  - A final bill cannot be edited. Corrections are a return or a closed remainder.
- **Credit limit**: when a credit bill would take the dealer's due above `creditLimit`, the app asks
  for confirmation. The server accepts it (the person confirmed) but writes an audit entry
  `credit-limit-exceeded`.
- **COD dealers** (`terms = cod`): the bill is due on its date.
- **Courier dealers**: when `courierSettings.autoBook` is on and the dealer has `courier = true`, queue
  a courier booking for each final bill after commit (06).

## 4.6 Dealer ledger (dues)

Follow `dealerLedger()` in `calc/dealers.ts`:

```
debts   = [ opening due (if > 0) ] + [ each final bill: total − received, due date = date + dealer.days
                                       (credit) or date (cod) ]   ordered by date
credits = collections + return credits + closed-remainder credits, ordered by date
each credit pays its chosen bill first (invoiceId), then the oldest open debts;
anything left over makes the last debt negative (an advance from the dealer)
due     = Σ debt.out;   overdue days from the oldest open debt's due date
```

- Return credits and closed-remainder credits count as payments with method "Return credit". They
  are not cash, so they never appear in the cashbook.
- Sample dealers and sample bills are left out of receivables.
- In Phase 3 compute this in SQL (window function over bills and credits) for
  `GET /dealers/:id/ledger` and receivables. Until then, build the `Db` slice for one dealer and call
  the shared `dealerLedger()`.

## 4.7 Factory orders

**Estimate → approval → order.** An estimate (`EST-n`) goes `draft → sent → approved | rejected`.
Approving can change `rate`/`qty` to what the factory agreed. `newFactoryOrder { estimateId }` marks
it `ordered` and links both ways.

**Placing an order (`FO-n`)**:

- type 1 (material supplied): each material leaves stock (`factory_material_out`);
- an `advance > 0` creates the first `FactoryPayment` with the note "Advance for FO-n".

**Amendment**:

- The new qty must be at least what has arrived. Otherwise: "Below what has arrived".
- Keep from/to qty and rate, plus the reason. The order's `qty` and `rate` take the new values.

**Lots (multiple shipments)**: each `receiveShipment` is one `FactoryReceipt` (lot) with challan, qty
and damaged.

- **Freight** (optional) creates an `Expense` with head `Transport`, kind `Freight to warehouse` and
  `factoryOrderId`.
- With `freightInCost`, the freight also goes into the product's cost (4.2).
- Stock goes up by `qty`.

**Bills and payments**:

- Factory bills (optionally per lot) and payments (advance, partial, final) are separate.
- `balance = paid − billed`. Positive: "Factory owes us"; negative: "We owe".
- `unbilled = qty × rate − billed`.
- The payment history per order can be printed and shared on WhatsApp. Serve
  `payments.pdf`, or let the app render it.

**Materials at the factory (type 1)**:

- `used = round(given × min(received, qty) ÷ qty)`.
- `left = given − used − returned − wasted`.
- `settleFactoryMaterial` returns material to stock or writes it off as wasted.

**Status**: `Ordered` (nothing received), `Partly received`, `Received in full`.

## 4.8 Suppliers, imports, exports, customs

- **Purchase**:
  - Stock goes up and cost = rate.
  - The `pb` counter is incremented.
  - `paid > 0` creates a `SupplierPayment` with the note "Paid on purchase".
- **Supplier ledger**: opening + purchases (qty × rate) − payments. Due dates come from `days`
  (`calc/suppliers.ts`).
- **Import steps** run `lc → shipped → port → customs → warehouse`.
  - Setting `warehouse` adds the qty to stock at landed cost.
  - Releasing customs (`markCustomsStage release`) also sets the `customs` step if it is empty.
- **Export steps** run `contract → ready → customs → shipped → paid`.
  - `shipped` freezes `unitCost` and takes stock out.
  - `paid` books export proceeds `usd × rate` into the cashbook.
- **Customs duty** uses the rates for CD, RD, SD, VAT, AIT and AT on the assessable value (`av`,
  or invoice + freight + insurance when 0), plus demurrage after `freeUntil`. Reuse `customsCalc()`.

## 4.9 Transport

- Vehicles are `own` or `rented` (rent per month). Driver: staff (`driverId`) or a typed name and phone.
- **Trips (`TR-n`)** go `planned → on-the-way → done | cancelled`.
  - A trip uses a fleet vehicle, or a vehicle hired for that one trip (`hire*` fields with a fare).
  - Setting `done` stores `doneOn`, `receivedBy` and `deliveryNote`.
- **Transport costs** are `Expense` rows with head `Transport` and a `transportKind`. Saving a trip
  with costs creates them in the same transaction. Details text:
  `<kind> · <vehicle name (reg no)> or transporter · <trip>`.
- **Papers** (fitness, tax token, insurance, route permit, license) warn 30 days before expiry.
- **Service due**: every `serviceKm` km and/or `serviceDays` days, counted from the last `Servicing`
  cost (odometer).
- **Per-vehicle stats**: trips, km, cost per km, cost by kind, rent.

## 4.10 Cashbook, payroll, P&L

**Cashbook** (`cashEntries()`). Money **in**:

- cash received on final, real bills;
- collections;
- export proceeds (step `paid`).

Money **out**:

- expenses;
- salary advances;
- supplier payments;
- factory payments;
- LC invoice value (import step `lc`);
- shipment costs;
- payroll (salary and commission lines).

Return credits are not cash and never appear. Each day's opening balance = `openingCash` + all
earlier in − out.

**Payroll** (`payrollFor(month)`):

- Salary to pay = salary − advances in that month − already paid.
- Commission = `round(base × rate ÷ 100)`. The base is the month's real sales (`sales`) or what was
  collected (`collection`: cash on the bill + collections by that person).

**P&L** (`profitAndLoss(month)`):

- `sales` = real final bills; `cogs` = Σ qty × frozen cost.
- Export sales and costs come from shipments marked `shipped` that month.
- Expenses = salaries + commission + Transport + other.
- `net = gross − expenses`.

## 4.11 Fixed assets

- **Number**: `FA-<purchase year>-<00001>` from `Counter('fa')`.
- **Cash**: an asset with `paidFrom` set is a cash-out line "Fixed asset" on its purchase date. A sale is a cash-in line "Asset sale". Neither is an expense.
- **Depreciation** (`calc/assets.ts`), one row per asset per month, starting with the purchase month:
  - straight line: `(cost − salvage) ÷ lifeMonths` a month;
  - reducing balance: `book value × rate ÷ 1200` a month;
  - `none` (land): never depreciated;
  - never below the scrap value; rounded to the paisa.
- **Running a month** (`runDepreciation`) books every active asset that is bought by then, has value left and is not yet booked for that month. "Nothing to depreciate" refuses an empty run. `undoDepreciation` takes a month back for one asset or all.
- **Locks**: once depreciation is booked, date, cost, scrap value, method, life and rate cannot change, and the asset cannot be deleted (dispose instead).
- **Disposal**: not before the purchase date, not with depreciation booked after the disposal month. Profit or loss = sale price − book value, shown in that month's P&L.
- **P&L**: "Depreciation of fixed assets" is an expense; profit or loss on disposal is added to net profit.

## 4.12 Investors and profit sharing

- **Capital** per investor = invest + reinvest − withdraw. **Ownership** = capital ÷ total capital of active investors with capital.
- **Profit pool** = Σ monthly net profit (P&L) from the first month with records to this month, minus everything already distributed.
- **Distribution** (`PD-n`): the amount (at most the pool) is split by ownership on that day, rounded to the paisa, and the rounding difference goes to the biggest share. Each share is an `InvestorTxn` of kind `share`. No cash moves.
- **Profit waiting** = shares − payouts − reinvested. A payout is cash out ("Profit to investor"); reinvesting turns waiting profit into capital without cash.
- **Refusals**: withdrawing more than capital; paying or reinvesting more than is waiting; removing an entry that later entries depend on; undoing a distribution that is partly paid; marking an investor as left while capital or profit is still with them.
- Capital in or out never touches P&L. It shows in the cashbook as "Investor capital", "Capital returned" and "Profit to investor".

## 4.13 Accounts and transfers

- Every cash entry belongs to an account by its payment method (`accountOf`): Cash, Bank (bank transfer, cheque, card), bKash, Nagad, Rocket.
- `openingAccounts` gives bank and wallet opening balances; the rest of `openingCash` is cash in hand.
- A transfer moves money between two different accounts and never changes the total.

## 4.14 Subscription

- A new company gets a `TRIAL_DAYS` trial (default 14). The demo company is `free`.
- Paying adds the plan's months after the current end (trial days left are kept). Plans: quarterly 3,000, half-yearly 5,400, yearly 9,600 Tk.
- **Online**: SSLCommerz (bKash, Nagad, Rocket, cards). A payment is marked paid only after the server validates `val_id` with the gateway, and the amount and transaction id match. It is idempotent.
- **Manual**: "I paid" creates a `pending` payment with the transaction id. The platform owner approves (same effect as paid) or rejects with a reason.
- **When ended**: every write route answers 402 (books save, users, courier booking, sending messages). Reading still works. The platform owner, through "Open books", can still save.
- The subscription is never part of the books, so no books save or restore can change it.

## 4.15 Country, currency, tax and VAT

- **Country presets** (`shared/domain/countries.ts`): Bangladesh, China, USA, India, Pakistan, UAE, Saudi Arabia, UK, EU and Malaysia, plus a custom option. Each preset gives the currency symbol, the digit grouping (lakh/crore or thousand/million), the name of the tax number (BIN, USCC, EIN, GSTIN…) and the usual rates. Every rate stays editable.
- **Money formatting** follows the company (`setMoney`): `Tk 12,34,567`, `¥1,234,567`, `$1,500`, `Tk 25 L`, `¥2.5M`.
- **Tax on a bill**:
  - base = subtotal − discount;
  - with inclusive taxes, net = base ÷ (1 + Σ inclusive rates); otherwise net = base;
  - each tax = net × rate;
  - what the dealer pays (`invTotal`) = base + exclusive taxes;
  - revenue (`invNet`) = base − inclusive taxes.

  Sales, P&L, sales analytics and commission use `invNet`; dues, the cashbook and courier COD use `invTotal`. A final bill keeps its own copy of each rate.
- **VAT report** (`taxReport`):
  - output = taxes on final real bills;
  - input = VAT on purchases + import VAT and AT at customs release;
  - advance tax = AIT and withholding;
  - paid = `TaxPayment` rows;
  - balance = all output − all input − all paid, up to the end date. Positive is owed to the government; negative is carried forward.
- **Update notes**: changing a rate needs a note. Notes are also written automatically for cost changes (product form, `updateCost`), regular expense amount changes and currency changes.

## 4.16 Expenses: one-time and regular

- **One-time**: an `Expense` row, paid when entered.
- **Regular** (`ExpenseAccount`): fixed accounts charge `amount` for every period from `start` to `end` or today (daily, weekly, monthly or yearly). A bill for a period replaces the automatic charge; variable accounts are charged only by bills.
- **Payments**: any number of payments, in parts, early or late. Adjustments need a reason.
- **Balance**: charges + adjustments − payments. Positive means due (বকেয়া); negative means paid ahead (অগ্রিম).
- **P&L** counts regular charges in their period, paid or not, and never a charge whose day has not come yet. The cashbook counts the payments.
- **Chart of accounts** shows the total due as "Expenses due" and the total paid ahead as "Expenses paid ahead".

## 4.17 Chart of accounts

`chartOfAccounts(db, from, to)` works everything out from the records:
- assets 1000;
- liabilities 2000;
- equity 3000 (balances as of `to`);
- income 4000, cost of sales 5000 and expenses 6000, one line per head (for the period);
- costing 7000: purchases, import LC value and each import cost type, factory goods, freight in cost, workshop making;
- VAT and tax 8000.

Income − cost − expenses equals the P&L net for the same months; the tests check this.

## 4.18 Barcodes

- Code 128 (letters and digits). Its output was checked bar for bar against JsBarcode.
- A product's barcode is `barcode`, else `code`. New internal barcodes are EAN-13 numbers in the 20–29 range.
- **Carton labels** encode `CODE*qty`, so one scan counts the whole carton. `readScan` matches the barcode or code, ignoring case and spaces.
- **Where scanning is used:**
  - delivery: counting from zero, never more than is left on the bill;
  - returns: scanning the bill or delivery challan first, never more than went out;
  - factory receiving: never more than is pending;
  - sale bills: adds a line or more of the same item.
- Invoices and delivery challans print their number as a barcode, so the returns desk can scan the challan to find the bill.

## 4.19 Attached documents

- A payment can carry up to 10 files: dealer collections, supplier, factory and tax payments, expenses, salary advances, investor money, transfers and regular expense payments.
- Photos are shrunk to 1600 px JPEG in the browser; PDFs are kept as sent, up to 3 MB.
- Files are stored per company outside the books. The books keep `{ id, name, type, size }`.
- Removing a file from a form deletes it. Detaching it from a saved payment keeps the stored copy for the audit trail.

## 4.20 Special permissions, factories, suppliers and people

- **Seeing prices:** `Role.see = { cost, profit }`, read with `canSee(db, userId, key)`.
  - The Owner always sees both. A role without a setting follows its default: the Accountant sees both, others see neither.
  - `cost` covers cost per unit, supplier and factory prices, stock value and landed cost. `profit` covers gross profit and margins.
  - Today the screens and the AI assistant hide these figures, but the whole books still reach the browser.
  - In the NestJS backend, the books projection and every v2 endpoint must leave out cost fields (`cost`, `rate` on purchases and factory orders, shipment money) and profit for roles without them. Hiding them in the UI alone is not enough.
- **Recording purchases without cost access:** a role without `cost` records goods by quantity only. The purchase uses the item's current cost, on credit, and is refused when the item has no cost yet.
- **Factories:** `saveFactory` checks the name is unique, ignoring case. `archiveFactory` takes a factory out of pickers while keeping its orders. `factoryRows` gives orders, open orders, pending quantity, billed, paid and the balance.
- **Suppliers:** `supplyRows` gives, per supplier and item, the number of purchases, total quantity, and last, average, lowest and highest price.
- **Employees:** `employeeProfile` gives six months of sales, bills, collections, commission, target, salary, advance, paid and due, plus their dealers and payments.

## 4.21 Sample data

Sample data lets people try the delivery and courier screens.

- Sample rows: `Dealer.sample` ("Sample Dealer (test)"), bills `SMP-1…6`, their deliveries and
  returns, and `Parcel.test`.
- **Never** move stock, never count in sales, P&L, payroll, cashbook, receivables, reserved stock,
  the loading list, stock history or the dashboard, and never reach a real courier or SMS gateway.
- Load is refused when sample data is already loaded. Remove deletes every sample row in one
  transaction.
- Every report query adds `AND NOT sample`. The partial indexes in 02 §2.3 keep this cheap.

## 4.22 Roles in commands

The permission guard checks the page level before the service runs (05 §5.4). Services also enforce:

- Only an admin may change roles, company details, custom fields, business types, and courier or
  messaging settings and keys.
- The Owner role cannot be removed, and the last Owner cannot be demoted or deleted.
- Users change only through the users routes, never through a books save.
