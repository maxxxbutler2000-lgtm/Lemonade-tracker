# Sunny Squeeze — Railway + PostgreSQL

Your phone and computer use one private stand database. All menu items, sales, notes, upsell answers, timestamps, selling sessions, voids, and optional customer photos are stored in PostgreSQL. Redeploying the web app does not erase them. The app needs an internet connection to read and save; an unsaved form is not an offline sale.

## Deploy on Railway

1. Put **the contents of this `sunny-squeeze` folder** in a GitHub repository. If it is inside a larger repository, set the Railway app service's **Root Directory** to `/sunny-squeeze`.
2. In Railway, create a project, add **PostgreSQL**, then add your app from the GitHub repository.
3. In the **app service → Variables**, add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (replace `Postgres` if you named the database service differently).
   - `APP_PASSWORD` = your private stand password, at least 12 characters and at most 256.
   - `SESSION_SECRET` = a random secret, at least 32 characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - Optionally `APP_URL` = your final public HTTPS URL, for strict request origin checks. Only set this after generating your app domain.
4. Deploy the **app service**. `railway.json` supplies `npm run build`, `npm start`, and `/api/health`. Startup runs versioned PostgreSQL migrations automatically, with a database lock so simultaneous startups are safe. A missing database or password configuration prevents a healthy deployment.
5. Under **app service → Settings → Networking**, generate a public domain. Open that **same HTTPS address** on your phone and computer and sign in with your stand password. On iPhone, Safari → Share → **Add to Home Screen** gives you a quick launcher. Other phones have a similar browser shortcut.

Do not use a static-site deployment or the old Cloudflare zip for this version. No Cloudflare bindings, local SQLite, R2 bucket, or app volume is required. Railway's PostgreSQL service owns the persistent database storage. Set up database backups in Railway for recovery. Do not place `DATABASE_URL`, passwords, customer exports, or photos in GitHub.

Official guides: [Next.js with PostgreSQL on Railway](https://docs.railway.com/guides/nextjs), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql).

## Move existing local records

The Railway database starts empty. The legacy preview keeps its own local records until you import a backup. Import preserves IDs, original timestamps and prices, deleted/archived products, voids, session associations, and photos. It is transactional and requires an empty destination stand; it will not overwrite existing records. Repeating the same successful import is harmless.

1. Stop the old preview while taking the backup. From this folder run:
   ```sh
   python3 scripts/export-legacy.py --state /path/to/old-app/.wrangler/state --output /path/to/private-backup
   ```
2. On your computer, set `DATABASE_URL` to the Railway PostgreSQL **public connection URL** (the private internal URL only works inside Railway), then run:
   ```sh
   npm ci
   npm run db:import -- --sqlite /path/to/private-backup/stand.sqlite --photos /path/to/private-backup/photos.json
   ```
3. Open your Railway app and verify your records before discarding any backup. The backup contains private customer data; keep it outside your Git repository. No existing records are sent to Railway by building or downloading this source package.

Node's built-in SQLite reader is used only by the import tool. The running app always uses PostgreSQL.

## Local development

Requires Node.js 22.13+ and npm. Copy `.env.example` to `.env.local`, replace the example password and secret, and point `DATABASE_URL` to a development PostgreSQL database. Optional: `docker compose up -d` starts a local PostgreSQL with persistent storage, bound only to localhost.

```sh
npm ci
npm run db:migrate
npm run dev
```

For a production check: `npm run build`, then set the required environment variables and run `npm start`. The server listens on `0.0.0.0` and Railway's `PORT` (default 3000). `npm start` reads variables from the environment or `.env.local`; the same local file is used by development and the migration/import/test commands. The build does not connect to PostgreSQL or require production secrets.

Add future schema changes as new ordered `.sql` files in `db/migrations`; never edit an applied migration. Migration checksums detect changes. The PostgreSQL pool uses up to 10 connections per web instance. Sales, line items, and photos commit together. A database lock serializes writes for this single stand so simultaneous taps from different devices cannot open competing sessions or duplicate an already saved sale.

## Use your stand

- Add products in **Your menu**, or use the editable starter menu. Delete/archive preserves past sale details and statistics; deleted products can be restored.
- **Open stand** and **Close stand** track actual selling hours. **Selling times** lists exact timestamps and duration. Void a session to exclude its time and associated revenue from hourly averages; its sales remain in overall totals.
- **Log a sale** uses big quantity buttons **1–5 / More**, bestsellers first, optional custom items, and an editable amount paid. The server timestamps sales automatically in America/Puerto_Rico time. Check **Did upsale** to record what you said and what you upsold.
- Payment buttons: Cash, ATH Móvil, Venmo, Cash App, Apple Pay, PayPal, Zelle, Stocks, and Other. These record payments; they do not process money.
- Sales history supports date/product/payment/upsell filters and search. Voiding a sale excludes it from reports. Photos accept JPG, PNG or WebP up to 5 MB and are available only after sign-in.
- Returning to the app refreshes saved data. Use the refresh button while looking at changes made on another device. Unsaved forms belong to the device where you opened them.
- Sign-in lasts up to 30 days on each device. Sign out from the header; changing the app password or session secret invalidates every device's sign-in. Authentication is for one stand owner, rather than separate accounts or separate stands.

Prices and revenue are USD, before expenses. Actual payments are allocated across items in exact cents. Revenue per open hour uses only nonvoided sessions and sales made during those sessions. Customer photos use database space; the 5 MB cap is per photo.

## Checks

`npm run typecheck` and `npm run build` verify the source. The integration test uses a disposable **real PostgreSQL** database and exercises authenticated access from two independent clients, photos, exact totals, transactional rollback, duplicate submission, concurrent sessions, filters, ranking, sale/session voids, and pagination.

```sh
# This explicitly resets only a database whose name ends in _test.
DATABASE_URL=postgresql://.../sunny_test ALLOW_TEST_DATABASE_RESET=true TEST_BASE_URL=http://127.0.0.1:5277 npm test
```

Run the built app separately against that same test database with `PORT=5277`, `APP_PASSWORD` and `SESSION_SECRET`. The tests must never be pointed at your production database.

Choosing **Other** for payment asks **What did they pay with?** Enter a description (up to 80 characters) before saving. It appears in sale details and history, and sales search can find it. These sales stay grouped under Other in payment filters. Existing sales are preserved.
