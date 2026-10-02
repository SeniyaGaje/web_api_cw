# Prompt log (AI-disclosure appendix)

Code in this repository was generated with AI assistance and reviewed by me. Each entry records my prompts verbatim, the files that changed, and what I fixed or changed myself.

- **AI tool:** Claude Code (Anthropic, model Claude Opus 5.5) in VS Code, unless an entry says otherwise.

---

## Increment 1 – Scaffold, config, migrations, seed, backfill, health route, Swagger UI skeleton, Render config, README

**Date:** 2026-09-23

**Prompt 1 (verbatim).** Attached files: `NB6007CEM_Coursework_Brief.pdf` and `NB6007CEM_Marking_Rubric.pdf`.

> https://github.com/nirangadh/NB6007CEM-Web-API-Development.git Implement this using the below guidelines

This was followed by the guidelines below, pasted in full. They are the original of `CLAUDE.md`; since then only its Stack section and backfill line have changed.

<details>
<summary>Pasted guidelines (verbatim)</summary>

````markdown
# CLAUDE.md — SLSEA Real-Time Solar Generation Data API (NB6007CEM coursework)

## Read this first
- This is a university coursework: a **backend-only REST API**. No frontend, dashboard or client app.
- Brief and marking rubric are in `docs/`. Read them before the first increment.
- Design authority: the module's **REST API Design Guidelines** (WSO2 white paper). When a design choice follows a guideline, add a short comment citing the section (e.g. `// §7.3: POST to a collection creates a member -> 201 + Location`).
- Target: **Richardson Maturity Level 2**. No HATEOAS / hypermedia controls (pagination next/previous links are fine).
- I (the student) must explain **every line** at a viva. Keep code simple, explicit and readable. No clever abstractions, no unrequested features, no extra endpoints.

## How to work with me
- **One increment per request.** Never start the next increment unprompted.
- Before writing code: list the files you'll create/change and any dependency you'll add (with a one-line reason). Wait for my OK.
- After writing code: summarise what changed, give me PowerShell-friendly `curl` commands to verify it, and suggest a commit message. **Do not commit** — I review the diff and commit myself.
- After each increment, append an entry to `PROMPTS.md`: date, my prompt **verbatim**, files changed, and an empty `What I fixed/changed:` line for me to fill in. (This becomes the report's AI-disclosure appendix.)
- If the Stack section below still says `<FILL IN>`, ask me before writing any code.
- Dev machine is **Windows**: all scripts must work in PowerShell (use package-manager scripts, not bash-only scripts).

## Stack
- Language / framework: `<FILL IN>`
- Database: **PostgreSQL**, free hosted instance, connected via `DATABASE_URL`. Use versioned migrations. Local dev uses a separate hosted dev database (no local Postgres install needed).
- Hosting: **Render** web service over HTTPS. Bind to the `PORT` env var.
- OpenAPI 3 spec (generated from code if the framework supports it), served live: Swagger UI at `/api-docs`, raw spec at `/api-docs/openapi.json`.
- Config via env vars only: `DATABASE_URL`, `JWT_SECRET`, `PORT`. Provide `.env.example`. Never commit secrets or `.env`.

## Domain model (implementation-independent first)
```
Province 1—* District 1—* GridSubstation 1—* SolarInstallation 1—* GenerationReading
User (role + jurisdiction) — read scope by jurisdiction
```
Two non-negotiable modelling decisions:
1. `meter_id` is an **attribute of SolarInstallation**. There is **no Device entity**.
2. GenerationReading is an **append-only time series**. There are **no last-value fields** (`last_power_kw`, etc.) on the installation.

### Tables
| Table | Columns |
|---|---|
| provinces | `province_id` (text PK, e.g. `PV-01`), `name` |
| districts | `district_id` (`DT-01`), `name`, `province_id` FK |
| substations | `substation_id` (`SS-001`), `name`, `district_id` FK |
| installations | `installation_id` (`INS-0001`), `meter_id` (unique), `substation_id` FK, `capacity_kw`, `address`, `commissioned_on`, `device_secret_hash`, `created_at`, `updated_at`, `deleted_at` (nullable, soft delete) |
| readings | `reading_id` (bigint PK), `installation_id` FK, `timestamp` (timestamptz, device time), `received_at` (timestamptz, server time), `power_kw`, `energy_kwh` (cumulative, monotonic), `voltage_v`. **UNIQUE (installation_id, timestamp)**, index on (installation_id, timestamp) |
| users | `user_id` (`USR-001`), `username` (unique), `password_hash`, `role` (`national` / `provincial` / `district` / `admin`), `jurisdiction_id` (province_id for provincial, district_id for district, null otherwise) |

`received_at` justification: `timestamp` is when the meter measured (analytics); `received_at` is when the server got it (audit, detects buffered/late uploads).

## Seed data
- A deterministic generator script (fixed RNG seed), re-runnable (truncate and reload), bulk inserts in batches.
- The **real 9 provinces and 25 districts of Sri Lanka** with the correct province mapping.
- ~30 substations so every district has at least one; ~220 installations spread across substations; realistic `capacity_kw` (3–20 kW).
- Readings every **15 minutes for 7 days**, ending at the latest 15-minute boundary before seed time.
  - Diurnal shape in Asia/Colombo time: zero from ~18:30 to ~06:00, bell curve peaking ~12:30, scaled by `capacity_kw`, with random cloud dips.
  - `energy_kwh` is cumulative and never decreases (start each installation at a random lifetime value).
  - `voltage_v` ≈ 230 V ± small noise.
- **Startup backfill:** on app start, for each non-deleted installation, generate readings from its latest stored timestamp up to now (same generator), so last-reading and today's summary are never stale.
- Seed users: 1 national, 1 provincial (Western), 2 district (Colombo, Gampaha), 1 admin. Seed a device secret per installation. Hash all passwords and secrets. Write the plain test credentials to `docs/test-credentials.md` (coursework test data only).

## API conventions
- Base path `/api/v1`. JSON only. Every response sets `Content-Type: application/json` (except 304 and Swagger UI).
- URIs: lowercase, hyphenated, plural nouns for collections, `{x-id}` templates, **no verbs**, **no global `/readings`**.
- JSON fields: **snake_case everywhere**. Timestamps ISO 8601 UTC.
- Single resources: plain object, no envelope.
- Collections (all of them, for consistency) are paginated:
  ```json
  { "count": 672, "next": "/api/v1/...&offset=100", "previous": "/api/v1/...&offset=0", "results": [ ... ] }
  ```
  `?limit=` (default 50, max 500) and `?offset=` (default 0). `count` = total matching items. `next`/`previous` keep the other query params and are `null` when there is nothing.
- `Accept` that excludes `application/json` → **406**. Request body with a non-JSON `Content-Type` → **415**.
- Unknown member id → **404** (never 200 with null). Empty collection → **200** with `results: []`.
- **Conditional requests:** GETs returning 200, and 201 responses, carry a strong `ETag` (hash of the representation) and `Last-Modified`. `If-None-Match` / `If-Modified-Since` match → **304 with an empty body**. `If-Match` mismatch on PUT/DELETE → **412**.
- **One error schema for every 4xx:**
  ```json
  { "code": "RESOURCE_NOT_FOUND", "message": "Installation INS-9999 does not exist.", "details": [], "more_info": "/api-docs" }
  ```
  `code` is a stable machine string. `details` is an array (e.g. `{ "field": "power_kw", "issue": "must be >= 0" }`). Implement it in one central error handler.

## Endpoints (all under `/api/v1`)
| Method | URI | Notes |
|---|---|---|
| POST | `/tokens` | Issues a JWT. Public. See Security. |
| GET | `/provinces`, `/provinces/{province-id}` | |
| GET | `/districts`, `/districts/{district-id}` | filter `?province-id=` |
| GET | `/substations`, `/substations/{substation-id}` | filter `?province-id=`, `?district-id=` |
| GET | `/installations` | filter `?province-id=`, `?district-id=`, `?substation-id=` |
| POST | `/installations` | admin only. 201 + Location + ETag + Last-Modified. 400 on validation errors. |
| GET | `/installations/{installation-id}` | **Composite**: installation fields + `substation`, `district`, `province` refs (`{id, name}` each) + nested `last_reading` (object or `null`). **Never embed history.** |
| PUT | `/installations/{installation-id}` | admin only. **Full replacement** (missing optional fields are cleared, not merged). Honours `If-Match` (412). |
| DELETE | `/installations/{installation-id}` | admin only. Soft delete (sets `deleted_at`). Returns 200; a second DELETE returns 404. **Readings are retained** (audit history). Deleted installations return 404 everywhere. |
| GET | `/installations/{installation-id}/readings` | Scoped sub-collection. `?from=` / `?to=` (ISO 8601), `?sort=timestamp` or `?sort=-timestamp` (default `-timestamp`), paginated. |
| POST | `/installations/{installation-id}/readings` | Device only. Body: `timestamp`, `power_kw`, `energy_kwh`, `voltage_v`. `installation_id` comes from the **path**, never the body, and must equal the token `sub`. Server sets `received_at`. 201 + `Location: /api/v1/installations/{id}/readings/{reading-id}` + ETag + Last-Modified. 400 on invalid body or a timestamp more than 5 min in the future. **409** on duplicate (installation_id, timestamp). |
| GET | `/installations/{installation-id}/readings/{reading-id}` | So the Location header resolves. |
| GET | `/installations/{installation-id}/last-reading` | **Processing function** resource: the single latest reading by `timestamp` desc. 404 if none. Reading fields only, no installation metadata. |
| GET | `/districts/{district-id}/generation-summary` | **Processing function**: `district_id`, `as_of`, `installation_count`, `reporting_installations` (latest reading within the last 30 min), `current_total_power_kw` (sum of those latest readings), `today_energy_kwh` (per installation: max − min cumulative `energy_kwh` since local midnight Asia/Colombo, summed). |
| GET | `/` (outside `/api/v1`) | Health: `{ "status": "ok" }`. |

- Provinces, districts and substations are **read-only** (seed-managed).
- Readings are **append-only**: no PUT, PATCH or DELETE on readings, ever.
- No `/users` endpoints (users are seeded). No controller resources.

## Security
- JWT bearer, HS256, `JWT_SECRET`, 1-hour expiry.
- `POST /tokens` body is one of:
  - `{ "grant_type": "device", "installation_id": "...", "device_secret": "..." }` → `sub` = installation_id, `scope` = `readings:write`
  - `{ "grant_type": "password", "username": "...", "password": "..." }` → `sub` = user_id, `role`, `jurisdiction_id`, `scope` = `generation:read` (admin additionally gets `installations:write`)
  - Returns 200 `{ "access_token", "token_type": "Bearer", "expires_in" }` (a processing function; tokens are not stored or retrievable). Bad credentials → 401.
- Missing, malformed or expired token → **401** with `WWW-Authenticate: Bearer realm="slsea-api", error="invalid_token"`.
- Valid token without the required scope → **403**. This enforces the write-read split:
  - Device tokens can only POST readings; any GET → 403.
  - User tokens can never POST readings → 403.
- Device token posting to a different installation than its `sub` → **403**.
- **Jurisdiction scoping** on every GET, including the hierarchy:
  - national/admin: everything
  - provincial: only their province's tree
  - district: their district, its parent province record, its substations/installations/readings/summary
  - Collections are **auto-filtered** to the caller's jurisdiction. An explicit member request or filter param outside the jurisdiction → **403**.
- Put the scope and jurisdiction checks in **one reusable place** (middleware/helper), not copy-pasted per route.

## Generator mistakes to avoid (the lecturer checks for these)
- Separate Device entity; last-value fields on the installation; camelCase fields; format names in the model.
- A global `/readings` route; singular collection names; verbs or camelCase in paths; a literal `id` instead of a `{id}` template.
- Wrong or missing `Content-Type`; envelope wrappers on single resources; inconsistent field casing; missing FK fields.
- Composite with flat `last_*` fields or the full history embedded.
- Latest reading picked with an ascending sort or no sort. The latest-reading logic must live in **one shared function** used by the composite, last-reading and the summary.
- POST returning 200; a missing or non-resolving `Location`; missing `ETag`/`Last-Modified`.
- 401 and 403 mixed up; a 401 without `WWW-Authenticate`; auth middleware registered after routes or applied to the wrong routes.
- PUT implemented as a merge; any update/delete route on readings; cascade-deleting readings; member GET returning 200 + null; empty collection returning 404; GET with a request body.

## Increments (build in this order, one per request)
1. Scaffold, config, migrations, seed generator, startup backfill, health route, Swagger UI skeleton, Render config, README (run + deploy steps)
2. Hierarchy GETs (provinces/districts/substations/installations list) with 404s
3. Installation composite + `last-reading`
4. POST reading (201 + headers + 409), GET single reading, installation POST/PUT/DELETE with `If-Match`/412
5. Pagination, filters, sorting, conditional GET (304)
6. Central error schema, 406, 415
7. JWT: `/tokens`, scopes, write-read split, jurisdiction scoping
8. District generation summary
9. OpenAPI completeness pass (every route, parameter, response code and schema; bearer security scheme), README polish

Definition of done for each increment: runs locally, the verification curls pass, the OpenAPI spec covers the new routes, and `PROMPTS.md` is updated.
````

</details>

**Clarifying questions from the AI, and my answers (I picked from its options):**

| Question (verbatim) | My answer |
|---|---|
| Your CLAUDE.md leaves the language/framework as `<FILL IN>`. Which stack should I use? | Node.js + Express (Recommended) |
| Which free hosted PostgreSQL should the config and README target? | Neon (Recommended) |
| Your spec backfills readings only when the app starts. While the server stays awake, the data ages, and after 30 minutes the district summary would show 0 installations generating. How should freshness work? | Startup + every 15 min (Recommended) |

The AI's follow-up plan changed the timer to a 5-minute check (the reason is in `src/server.js`). My next prompt accepted that plan.

**Prompt 2 (verbatim):**

> implement this in this workspace

**AI aids used:**
- Claude Code read the lecturer's course-notes repository (`dev` branch, Day 1–4 student notes) to match the conventions taught in class.
- It web-searched the current free-plan terms for Render Postgres and Neon.
- It tested this increment against a temporary local PostgreSQL in its own scratch folder, which is not part of this repository.

**Files changed:** `CLAUDE.md`, `PROMPTS.md`, `README.md`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `render.yaml`, `docs/NB6007CEM_Coursework_Brief.pdf`, `docs/NB6007CEM_Marking_Rubric.pdf`, `docs/test-credentials.md`, `migrations/001_create_tables.sql`, `scripts/migrate.js`, `scripts/seed.js`, `src/app.js`, `src/backfill.js`, `src/config.js`, `src/db.js`, `src/latest-readings.js`, `src/openapi.js`, `src/reading-simulator.js`, `src/server.js`

**What I fixed/changed:**

---

## Increment 1 (revision) – Deploy on Vercel instead of Render

**Date:** 2026-10-01

**Prompt (verbatim):**

> have you done everyrequirement in this CW,also i have decided to go with neon as db and vercel app as the deploment method do u think its a good choice , if so we need any changes to be done in code space do it also give me step by step processes now how to setup neon db and vercel app deployment becuz i havent done those earlier and  have no idea

**What the AI changed, and why:** Vercel runs the Express app as a serverless function, so nothing runs between requests, and Vercel ignores `express.static()`.
- The 5-minute backfill timer became middleware that runs before each `/api/v1` request. It fills in missing readings once per 15-minute slot, under a database lock, and catches up at most one day.
- Swagger UI is now a small page that loads its files from the jsDelivr CDN, replacing `swagger-ui-express`.
- The database pool is registered with `attachDatabasePool` (`@vercel/functions`).
- `vercel.json` pins the function to the Singapore region.
- `render.yaml` was removed.

**AI aids used:**
- Claude Code read Vercel's current documentation (Express on Vercel, function regions, `@vercel/functions`) and web-searched the Hobby plan limits.
- It tested the changes against a temporary local PostgreSQL in its scratch folder: two backfills running at once, a 3-day gap, and parallel requests.

**Files changed:** `PROMPTS.md`, `README.md`, `package.json`, `package-lock.json`, `.env.example`, `render.yaml` (deleted), `vercel.json` (new), `src/app.js`, `src/backfill.js`, `src/db.js`, `src/latest-readings.js`, `src/middleware/keep-readings-current.js` (new), `src/server.js`

**What I fixed/changed:**
