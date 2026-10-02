# SLSEA Real-Time Solar Generation Data API

A backend REST API for the Sri Lanka Sustainable Energy Authority, built for the NB6007CEM Web API Development coursework. Rooftop solar meters push generation readings to it, and SLSEA analysts and operators read installations and their generation history within their jurisdiction. Every resource is represented as JSON, and the design targets Richardson Maturity Level 2. There is no front end: the Swagger UI page is the interface.

| | URL |
|---|---|
| Live API | `https://<your-project>.vercel.app` *(fill in after the first deploy)* |
| Swagger UI | `https://<your-project>.vercel.app/api-docs` |
| OpenAPI spec (JSON) | `https://<your-project>.vercel.app/api-docs/openapi.json` |

## Stack

- **Node.js 22 + Express 5**
- **PostgreSQL on Neon** (free plan, Singapore), queried with `pg` using plain parameterised SQL
- **Vercel** (free Hobby plan, Singapore region) over HTTPS: the Express app runs as a serverless function
- **OpenAPI 3** document in `src/openapi.js`, shown with Swagger UI (loaded from the jsDelivr CDN)

## Project layout

| Path | Contents |
|---|---|
| `migrations/` | Versioned SQL migrations, applied in filename order |
| `scripts/migrate.js` | Applies pending migrations and records them in `schema_migrations` |
| `scripts/seed.js` | Deterministic seed: empties every table and reloads the dataset |
| `src/app.js` | The Express app. Vercel imports this file and runs it as a serverless function |
| `src/server.js` | Local development only: runs the app on a port |
| `src/config.js` | Reads the environment variables |
| `src/db.js` | Shared PostgreSQL connection pool and batched insert helper |
| `src/openapi.js` | The OpenAPI 3 document |
| `src/middleware/keep-readings-current.js` | Before each API request, makes sure readings are filled in up to now |
| `src/backfill.js` | Generates the missing readings (one database lock, so instances never clash) |
| `src/reading-simulator.js` | Generates realistic meter readings, for the seed and the backfill |
| `src/latest-readings.js` | The single "latest reading" query |
| `vercel.json` | Vercel settings: run the function in Singapore (`sin1`), next to the database |
| `docs/` | Coursework brief, marking rubric and test credentials |

## Run locally (Windows PowerShell)

You need Node.js 22 (`node --version`) and a free [Neon](https://neon.com) account. You don't need PostgreSQL installed locally.

1. **Create the databases.** In Neon, create a project in the **AWS Asia Pacific (Singapore)** region. Its default `main` branch is the production database. Create a second branch called `dev` for local work.
2. **Configure.** Copy the example settings and open them:
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```
   - `DATABASE_URL`: the **dev** branch connection string (from Neon's **Connect** button), with `sslmode=require` changed to `sslmode=verify-full`.
   - `JWT_SECRET`: the output of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **Install, migrate, seed and run.**
   ```powershell
   npm install
   npm run migrate
   npm run seed
   npm run dev
   ```
   Seeding takes a minute or two over the network: it hashes 225 secrets and inserts about 148,000 readings.
4. **Check it.**
   ```powershell
   curl.exe -i http://localhost:3000/
   start http://localhost:3000/api-docs
   ```

Use `curl.exe`, not `curl`: in Windows PowerShell 5.1, `curl` is an alias for `Invoke-WebRequest`.

## Deploy to Vercel

1. **Prepare the production database** from your machine. A variable set in the shell takes priority over `.env`:
   ```powershell
   $env:DATABASE_URL = "<Neon main-branch connection string, with sslmode=verify-full>"
   npm run migrate
   npm run seed
   Remove-Item Env:DATABASE_URL
   ```
   Run `npm run migrate` like this again whenever a new migration file is added. Vercel does not run migrations.
2. **Push** this repository to GitHub.
3. In Vercel, choose **Add New > Project**, import the repository and keep the detected settings. Under **Environment Variables**, add `DATABASE_URL` (the Neon **main** branch string) and `JWT_SECRET` (a new random value). Then **Deploy**.
4. Every push to `main` deploys again automatically.
5. **Check the live service:**
   ```powershell
   curl.exe -i https://<your-project>.vercel.app/
   ```

### How the readings stay current on Vercel

Vercel runs the API only while a request is being handled; nothing runs in between. So before each `/api/v1` request, `keep-readings-current` checks whether a new 15-minute slot has started since the readings were last filled in. If one has, it generates the missing readings (once per slot per instance, under a database lock). After a long idle period only the last day is filled in, so the triggering request stays fast. Older missing slots remain as a gap, as if the meters had been offline. Re-run `npm run seed` against the main branch to restore an unbroken 7-day history.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the server with `.env` loaded, restarting when files change |
| `npm start` | Runs the server without loading `.env` (environment variables must already be set) |
| `npm run migrate` | Applies any migrations that have not been applied yet |
| `npm run seed` | Empties every table and reloads the seed dataset |

## Seed data

`npm run seed` loads Sri Lanka's real 9 provinces and 25 districts, 30 grid substations, 220 installations and 5 SLSEA users. Each installation gets 7 days of readings at 15-minute intervals, 147,840 in total. Output is zero overnight and peaks around midday, with occasional cloud dips. A fixed random seed makes the dataset the same on every run. Test logins and device secrets are listed in [docs/test-credentials.md](docs/test-credentials.md); they are coursework test data only.
