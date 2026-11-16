# Star Bangla Trading

Books for importers, exporters and traders who order from factories: factory orders, suppliers,
LC shipments (import and export), customs clearance, stock, dealer sales and invoices, cashbook and
dues, payroll, reports, roles and custom fields. Powered by Qynesis.

Written in strict TypeScript: React and Vite in the browser, plain Node on the server.

## Run it

```
npm install
npm run dev            # frontend only: companies and books kept in this browser
npm run dev:server     # also starts the books server on :8787 (shared books, real sign-in)
```

Demo logins (`owner@demo.com`, `accountant@demo.com`, `sales@demo.com`, `warehouse@demo.com`) and the
platform owner (`admin@starbangla.local`) are listed on the sign-in page. In frontend-only mode they all
use the password `demo1234`.

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-checks browser, server and shared code |
| `npm run lint` | ESLint with typescript-eslint and the React hooks rules |
| `npm run build` | Type-checks, then builds the app into `dist/` |
| `npm run build:server` | Bundles the server into `dist-server/main.mjs` |
| `npm start` | Runs the bundled server, which also serves `dist/` |
| `npm run server` | Runs the server from source, restarting on changes |

## Folder layout

```
shared/                    code used by both the browser and the server (no React, no Node APIs)
  domain/
    types.ts               the data model: Db and every record in it
    actions.ts             every change a person can make to the books, with typed payloads
    calc/                  calculations per area (dealers, suppliers, factory, shipments, customs,
                           cashbook, payroll, reports), cached per version of the books
    catalog.ts             fixed lists and trade presets (extra fields, customs documents)
    permissions.ts         screens, access levels, default roles
    seed.ts                empty books and the demo company
    format.ts              dates, money and number formatting
  api/
    contract.ts            request and response types
    core.ts                the API itself; runs on the server and in the browser
server/                    Node: HTTP adapter, file and Postgres storage, hashing, Vercel entry
src/
  app/                     shell, navigation, error boundary, and features.ts (the screen registry)
  core/                    API client, browser-only backend, store, sessions, router
  ui/                      design system: buttons, cards, tables, forms, sheets, toasts
  components/              widgets shared by several screens
  features/<area>/         one folder per screen: index.tsx plus its sheets
  styles/                  tokens, layout, components, screens, responsive, print
  config/brand.ts          brand name, "Powered by", default logo
```

### Adding a screen

1. Add its id to `PageId` in `shared/domain/types.ts` and a label to `PAGES` in `shared/domain/permissions.ts`
   (so roles can be given access).
2. Create `src/features/<name>/index.tsx` with a default-exported component.
3. Add one entry to `FEATURES` in `src/app/features.ts`. The menu, phone tab bar, routing, permissions and
   code splitting all follow from that entry.

New data goes in `Db` (`types.ts`), changes to it in `actions.ts`, and derived numbers in `calc/`.

### Performance

- Every screen, the sign-in page, the platform page and the browser-only backend are separate chunks,
  downloaded on first use and preloaded while the browser is idle.
- Calculations are cached per version of the books, so ledgers and dues are computed once per change,
  not on every render.

## Two ways to run

- **Frontend only (default).** No server and no database: companies, logins and books are kept in the
  browser's storage on that device. This is what Vercel hosts. Data stays on one device; download backups.
- **With the server.** Shared books for many users and devices. Build with `VITE_BACKEND=server`.

## Put it on Vercel (frontend only)

Import the repository in Vercel (framework: Vite) and deploy. Nothing else is needed.

To switch to the shared server later, follow the steps at the top of `server/vercel.ts`.

## Put it on your own server

```
VITE_BACKEND=server npm run build
npm run build:server
PORT=8787 DATA_DIR=/var/lib/books PLATFORM_ADMIN_PASSWORD=... npm start   # books in files
DATABASE_URL=postgres://... npm start                                     # or in Postgres
```

Run it behind HTTPS (nginx, Caddy or similar). Back up `DATA_DIR` (or the database). Settings can go in
a `.env` file next to `package.json`; see `.env.example`.

## Platform owner

The operator has a separate sign-in that lists every company, opens any company's books and resets any
user's password. Set `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD`; without a password one is
generated on first start (written to `server/data/platform-admin.txt`, or printed in the log with
Postgres). Every use is recorded in the audit log. Passwords are stored only as hashes.
