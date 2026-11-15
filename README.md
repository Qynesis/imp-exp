# QynTrading

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

The operator of QynTrading has a separate sign-in that lists every company, opens any company's books and resets any user's password.

- Email: `admin@qyntrading.local` (change with `PLATFORM_ADMIN_EMAIL`)
- Password: generated on first start and written to `server/data/platform-admin.txt`, or set your own with `PLATFORM_ADMIN_PASSWORD`

Sign in with it on the normal sign-in screen. Every use is recorded in `server/data/audit.log`.
User passwords are stored only as hashes, so nobody can read them back; reset one instead.

## Put it on a server

```
npm run build
PORT=8787 DATA_DIR=/var/lib/books npm start    # serves the app and the API together
```

Run it behind HTTPS (nginx, Caddy or similar). Back up `DATA_DIR`: it holds every company's books.

## How it is put together

- `server/index.js`: sign-up, sign-in, one books file per company, users and passwords. No dependencies.
- `src/lib/store.jsx`: every change to the books, applied on screen at once and saved to the server in the background.
- `src/lib/selectors.js`: all the arithmetic (dues, balances, landed cost, duty estimate, payroll, profit and loss).
- `src/lib/presets.js`: screens for role permissions, business types with their extra fields and customs documents.
- `src/pages`, `src/sheets`: the screens and the forms.
