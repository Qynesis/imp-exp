# Star Bangla Trading

Multi-company software for importers, exporters and traders who order from factories:
factory orders, suppliers, LC shipments (import and export), customs clearance, stock,
dealer sales and invoices, cashbook and dues, payroll, reports, roles and custom fields.

## Run it

```
npm install
npm run dev        # starts the app and, with it, the books server on :8787
```

Open the app, choose "New company" and sign up. Tick "sample data" to look around.

In development the sign-in screen also lists demo logins, one per role (`owner@demo.com`, `accountant@demo.com`,
`sales@demo.com`, `warehouse@demo.com`, password `demo1234`). On a real server they exist only if you set `DEMO_ACCOUNTS=1`.
Settings can go in a `.env` file; see `.env.example`.

## Platform owner (you)

The operator of Star Bangla Trading has a separate sign-in that lists every company, opens any company's books and resets any user's password.

- Email: `admin@starbangla.local` (change with `PLATFORM_ADMIN_EMAIL`)
- Password: generated on first start and written to `server/data/platform-admin.txt` (with Postgres: printed once in the server log), or set your own with `PLATFORM_ADMIN_PASSWORD`

Sign in with it on the normal sign-in screen. Every use is recorded in `server/data/audit.log` (with Postgres: the `audit` table).
User passwords are stored only as hashes, so nobody can read them back; reset one instead.

## Put it on Vercel

Vercel hosts the app as static files plus one serverless function (`api/index.js`) for the API.
Serverless functions have no disk, so the books live in Postgres.

1. Import the repository in Vercel (framework: Vite). The first deploy will show "no database yet" on the sign-in page.
2. In the Vercel project open **Storage → Create database → Neon (Postgres)** and connect it. This sets `DATABASE_URL`.
3. Under **Settings → Environment Variables** add `PLATFORM_ADMIN_PASSWORD` (your platform-owner password) and, if you want the demo logins, `DEMO_ACCOUNTS=1`.
4. Redeploy. Sign up your first company, or sign in as the platform owner.

Limits of serverless hosting: one request may carry at most 4.5 MB, so keep company logos small (the app already shrinks them) and expect very large books to need a long-running server instead.

## Put it on your own server

```
npm run build
PORT=8787 DATA_DIR=/var/lib/books npm start    # serves the app and the API together, books in files
DATABASE_URL=postgres://... npm start           # or keep the books in Postgres
```

Run it behind HTTPS (nginx, Caddy or similar). Back up `DATA_DIR` (or the database): it holds every company's books.
## How it is put together

- `server/app.js`: the API (sign-up, sign-in, books, users, platform owner), independent of where it runs.
- `server/store-file.js`, `server/store-pg.js`: where the records are kept (files, or Postgres).
- `server/index.js`: runs the API on your own machine or server; `api/index.js` runs it on Vercel.
- `src/lib/store.jsx`: every change to the books, applied on screen at once and saved to the server in the background.
- `src/lib/selectors.js`: all the arithmetic (dues, balances, landed cost, duty estimate, payroll, profit and loss).
- `src/lib/presets.js`: screens for role permissions, business types with their extra fields and customs documents.
- `src/pages`, `src/sheets`: the screens and the forms.
