# 6. Integrations and background jobs

## 6.1 Reuse the adapters

`shared/courier/index.ts` and `shared/messaging/index.ts` already talk to the real providers. Both
take an injectable `fetch`, so they run in Node unchanged. Wrap them in NestJS services; don't
rewrite them.

| Provider | What exists today | Functions |
|---|---|---|
| Steadfast (packzy API) | book, status, track, balance | `bookParcel`, `parcelStatus`, `trackParcel`, `courierBalance`, `testCourier` |
| Pathao | OAuth token, city → zone → area, book, status | + `courierAreas(k, parentId)` |
| RedX | areas, book, track | |
| demo / manual | simulated / typed by hand | `simConsignment`, `simStatus`, `SIM_STEPS` |
| WhatsApp Cloud API (graph.facebook.com v21.0) | text, or an approved template with one body variable | `sendMessage('whatsapp', keys, to, text)` |
| SMS | BulkSMSBD, or any gateway URL with `{to}{message}{apiKey}{sender}` | `sendMessage('sms', …)` |
| Helpers | | `intlPhone()` → `8801XXXXXXXXX`, `localPhone()`, `renderTemplate()`, `DEFAULT_TEMPLATES`, `PLACEHOLDERS` |

`CourierService.keys(ctx, provider)` does what `keysFor()` does today: server environment first, then
the decrypted `IntegrationSecret`. **Test mode** (`courierSettings.testMode`,
`messagingSettings.testMode`, or `test: true` on a sample parcel) always simulates and never calls out.

Outgoing HTTP:

- 15-second timeout;
- 2 retries with backoff, only for network errors and 5xx, never for 4xx;
- provider errors become `502 { error: <provider message> }`.

Use `undici` with a keep-alive agent. The Pathao token is cached in Redis until it expires (key
`pathao:token:<tenant>`).

## 6.2 Queues (BullMQ on Redis)

| Queue | Job | Enqueued by | Notes |
|---|---|---|---|
| `courier.book` | `{ tenantId, invoiceId }` | `saveInvoice` final, when auto-book is on and the dealer takes courier | Creates the `Parcel` with the result; on failure, the parcel has `status = 'failed'` with the error, and the app shows a "Book again" button |
| `courier.poll` | `{ tenantId, parcelId }` | scheduler | Updates `status`, adds `ParcelEvent` when it changed; stops at a final status (delivered, cancelled, returned) |
| `messaging.send` | `{ tenantId, logId }` | `POST messaging/send`, auto messages | Writes `MessageLog` as `queued` first, then `sent` or `failed` with `providerMessageId` |
| `messaging.auto` | `{ tenantId, kind, ref }` | after commit of saveInvoice (invoice), collect (payment), recordDelivery (delivery), setQuoteStatus sent (estimate) | Renders the company's template; sends on the channels set in `messagingSettings.auto[kind]` |
| `messaging.reminders` | `{ tenantId }` | daily scheduler | See 6.4 |
| `reports.refresh` | `{ tenantId }` | optional | Refreshes materialized report views for big tenants |

Rules:

- Every job is **idempotent**. The job id is derived from its data
  (`courier.book:<tenant>:<invoiceId>`), so a double enqueue does nothing.
- 5 attempts with exponential backoff (30 s → 8 min). After that, the job goes to the failed list,
  which you watch on a dashboard (`@bull-board/nestjs`, behind platform auth).
- Jobs run outside the HTTP request. They open their own `withTenant()` transaction and re-read the
  rows; never trust the data in the job.
- **Enqueue after commit**, never inside the transaction. Use a small outbox if you need it to be
  certain: insert an `Outbox` row in the transaction and have a poller move it to BullMQ. Start
  simple: enqueue after `withTenant()` resolves.

## 6.3 Courier flow

```
saveInvoice(final) ──commit──► courier.book job
                                 ├─ keys + test mode
                                 ├─ bookParcel(k, { invoice: no, name, phone, address, cod: due on bill, weight, area… })
                                 └─ Parcel { provider, consignmentId, trackingCode, trackingUrl, status, cod, charge, reference: no }
scheduler every 30 min ──► courier.poll for parcels not final and lastPolledAt older than 25 min
parcel delivered ──► (optional) recordDelivery via = 'courier', parcelId — only when the company turns on
                     "mark bill delivered when the courier delivers"
```

- COD: by default, the amount the courier collects is what is still due on that bill. The person
  booking can change it.
- **Webhooks**: Steadfast and Pathao can call a webhook on status change. Expose
  `POST /api/hooks/courier/:provider/:tenantKey`.
  - `tenantKey` is a random 24-byte value stored in `courierSettings`; never use the tenant id.
  - Check the provider's secret or signature header.
  - Find the parcel by `(provider, consignmentId)` and update it as the poller does.
  - Keep the poller running as a backup.

## 6.4 Messaging flow

- **Manual, one by one** (the main use; the Messages screen's "Send" tab): pick a dealer, supplier,
  staff member or typed number, then a channel and a template, edit the text, and send.
  - **WhatsApp in `link` mode never reaches the server**. The app opens `wa.me/<number>?text=…` and
    logs the message as `opened`.
  - **Cloud WhatsApp and SMS** go through `POST /api/messaging/send`, which runs the
    `messaging.send` job.
- **Automatic**: `messagingSettings.auto` maps each kind to its channels. Only channels that send by
  themselves are used (cloud WhatsApp, an SMS gateway); WhatsApp `link` is skipped.
- **Reminders**: these move from the browser (`AutoReminders.tsx`) to a daily server job at 10:00
  Asia/Dhaka.
  - For each tenant with reminders on, select dealers whose oldest open bill is at least
    `reminderDays` overdue and who have had no non-failed reminder in the last `reminderDays` days.
  - Send `renderTemplate(template.reminder, vars)`.
  - Set `lastReminderRun`.
  - Use a Postgres advisory lock (`pg_try_advisory_lock(hashtext('reminders:'||tenant))`) so two
    workers never double-send.
- **Delivery receipts**: `POST /api/hooks/whatsapp`, Meta's webhook.
  - Verify `X-Hub-Signature-256` with the app secret.
  - Update `MessageLog.status` by `providerMessageId`.
  - Answer the GET verify challenge with `WHATSAPP_VERIFY_TOKEN`.
- **Limits**:
  - SMS text over 160 GSM characters, or 70 for Bangla (UCS-2), is split into parts. Show the
    number of parts.
  - Rate-limit sending to 30 messages per minute per tenant.
  - Respect opt-out: dealers with `noMessages` in custom fields, or a stop list (Phase 3).

## 6.5 Subscription payments (SSLCommerz)

`shared/billing/index.ts` has `startCheckout()` and `validatePayment()`. They take an injectable `fetch`.

```
POST billing/checkout ──► SubscriptionPayment(status 'started', tranId) ──► SSLCommerz /gwprocess/v4/api.php
browser pays on the gateway page (bKash / Nagad / card)
gateway POSTs form ──► POST /api/billing/return  (success, fail and cancel URLs; ?ipn=1 for the IPN)
   validationserverAPI.php?val_id=… ──► VALID and the amount matches ──► paid, months added ──► 303 to #/settings/billing?payment=paid
```

- Never mark a payment paid from the browser's word. Always validate `val_id` server side.
- The return route is public, so it finds the company by `tranId`, never by anything the browser sends.
- Run sandbox (`SSLCOMMERZ_SANDBOX=1`) until the store is approved, then set `0`.
- A worker job could expire `started` payments older than a day as `cancelled`.

## 6.6 Notifications and the AI assistant

**Notifications** are worked out from the books by `notifications()` in `shared/domain/calc/notifications.ts`; nothing is stored. Each alert has a stable id for its situation and a screen (`page`); people only see alerts for screens their role can open. Read state is kept per person in the browser.

For the NestJS backend:
- add `GET /api/v2/notifications` (the same function, run over the books projection);
- move read state to a `NotificationRead(userId, noticeId, readAt)` table so it follows the person across devices;
- let the scheduler send the urgent ones (`tone: 'warn'`) as a daily WhatsApp/SMS digest to the owner, through the messaging queue.

**Assistant**: `POST /api/assistant/chat { messages: [{ role, text }] }` → `{ reply, used, ai }`.
- The tools in `shared/assistant/tools.ts` are read-only and filtered by the person's role (`toolsFor`). A tool for a screen the role cannot open is refused even if the model asks for it.
- With `ANTHROPIC_API_KEY` set, `server/assistant.ts` runs a short tool loop on `claude-opus-5-5`:
  - the official `@anthropic-ai/sdk`;
  - effort `medium`;
  - at most 8 rounds;
  - the fixed instructions are cached (`cache_control`);
  - server-side refusal fallbacks are on (`server-side-fallback-2026-07-01`, `fallbacks: "default"`).
- Without a key, `shared/assistant/local.ts` answers common questions from the same tools.
- Each company gets at most 20 questions a minute.
- In NestJS, put this in an `AssistantModule` that uses the same tool definitions over Prisma queries. Log the tool names used, never the answers or the books.

## 6.7 Scheduler (`@nestjs/schedule` in the worker only)

| When (Asia/Dhaka) | Job |
|---|---|
| every 30 min | enqueue `courier.poll` for open parcels (not test) |
| daily 10:00 | `messaging.reminders` per tenant |
| daily 02:00 | stock check `SUM(StockMove) = Product.stock`; alert on any difference |
| daily 02:30 | delete expired sessions and idempotency keys older than 24 hours |
| daily 03:00 | papers expiring and service due → summary for the dashboard (optional messages to the owner) |
| daily 09:00 | subscription ending in 3 days or ended today → message the company owner (optional) |
| weekly | `VACUUM ANALYZE` hints and table size report to the logs |

Run the scheduler in exactly one worker (`WORKER_SCHEDULER=1`), or protect each run with an advisory
lock.

## 6.8 Files and printing

- **Logos**: today the logo is a URL or a data URL inside the books. Move logos to object storage
  (S3, Cloudflare R2 or Vercel Blob) at `POST /api/v2/company/logo`, with a 512 KB limit and png,
  jpg or webp only. Store the URL in `Tenant.logoUrl`.
- **Printing**: invoices, challans, delivery challans and factory payment history are printed by the
  app (print CSS). Server PDFs (Phase 3, for WhatsApp document messages) can use Playwright to render
  the app's print view, or `pdfmake` with the same layout.
