# Cloudflare Worker + D1 Leaderboard — Implementation Plan

## Architecture Overview

```
Cron (*/10) → Worker → fetch chutes.ai → parse HTML → upsert D1
Browser      → Worker → GET /           → serve static HTML
Browser      → Worker → GET /api/models → query D1 → JSON response
```

Scraping is batched: 25 models per cron invocation (26 subrequests total).
A `meta` table tracks batch offset so each run picks up where the last left off.
Full catalogue refresh (~56 models) completes in 3 cron cycles (~30 min).

---

## Phase 1 — Project Scaffold & D1 Schema

### Step 1.1: Initialize Wrangler project

- **Files**: `package.json`, `tsconfig.json`, `wrangler.toml`
- Run `npm init -y && npm i -D wrangler typescript @cloudflare/workers-types`
- `wrangler.toml`: set `name`, `main = "src/index.ts"`, `compatibility_date`, assets dir, D1 binding, cron trigger

```toml
name = "chutes-tps-leaderboard"
main = "src/index.ts"
compatibility_date = "2024-12-01"
assets = { directory = "./public" }

[[d1_databases]]
binding = "DB"
database_name = "chutes-leaderboard"
database_id = "" # filled after `wrangler d1 create`

[triggers]
crons = ["*/10 * * * *"]
```

### Step 1.2: Create D1 schema

- **Files**: `schema.sql`

```sql
CREATE TABLE IF NOT EXISTS models (
  chute_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latest_tps REAL DEFAULT 0,
  latest_ttft REAL DEFAULT 0,
  latest_requests INTEGER DEFAULT 0,
  avg_7d REAL DEFAULT 0,
  avg_30d REAL DEFAULT 0,
  peak_tps REAL DEFAULT 0,
  latest_date TEXT,
  scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('batch_offset', '0');
```

### Step 1.3: Create TypeScript config

- **Files**: `tsconfig.json`
- Target `ES2022`, module `ESNext`, types `@cloudflare/workers-types`

### Verification

- `wrangler d1 create chutes-leaderboard` succeeds
- `wrangler d1 execute chutes-leaderboard --file=schema.sql` creates tables
- `wrangler dev` starts without errors (empty handler OK)

---

## Phase 2 — Scraper Module

### Step 2.1: Catalogue parser (`src/scraper.ts`)

- **Files**: `src/scraper.ts`
- Port `parseCatalogue()` from index.html — regex extracts `chute_id` + `name` for vLLM models
- Export `fetchCatalogue(url: string): Promise<{chute_id: string, name: string}[]>`
- Worker fetches `https://chutes.ai/app` directly (no CORS proxy needed server-side)

### Step 2.2: Stats parser (`src/scraper.ts`)

- Port `parseStats()` + `summarize()` from index.html
- Export `fetchStats(chuteId: string): Promise<ModelSummary>`
- `ModelSummary` type: `{ latest_tps, latest_ttft, latest_requests, avg_7d, avg_30d, peak_tps, latest_date }`

### Step 2.3: Batch orchestrator (`src/scraper.ts`)

- Export `scrapeBatch(db: D1Database): Promise<{scraped: number, total: number}>`
- Logic:
  1. Fetch catalogue → get full model list
  2. Read `batch_offset` from `meta`
  3. Slice 25 models starting at offset
  4. Fetch stats for each (sequential — no need for concurrency pool, just `Promise.all` on 25 fetches)
  5. Update offset: `(offset + 25) % total` or `0` if past end
- Subrequests: 1 (catalogue) + 25 (stats) = **26** (well under 50 limit)

### Verification

- `wrangler dev` + manual cron trigger via `curl http://localhost:8787/__scheduled`
- Check D1 local DB has rows: `wrangler d1 execute chutes-leaderboard --local --command "SELECT count(*) FROM models"`

---

## Phase 3 — Worker Routes & API

### Step 3.1: D1 query helpers (`src/db.ts`)

- **Files**: `src/db.ts`
- `upsert(db, model)` — `INSERT OR REPLACE INTO models ...`
- `all(db)` — `SELECT * FROM models ORDER BY latest_tps DESC`
- `getMeta(db, key)` / `setMeta(db, key, value)` — read/write `meta` table

### Step 3.2: Worker entry point (`src/index.ts`)

- **Files**: `src/index.ts`
- `Env` type with `DB: D1Database`
- `fetch` handler:
  - `GET /api/models` → call `db.all()`, return `Response` with JSON + `Cache-Control: public, max-age=300`
  - All other routes → fall through to Wrangler asset serving (automatic with `assets` config)
- `scheduled` handler:
  - Call `scrapeBatch(env.DB)`
  - Log result (`scraped X of Y models`)

### Step 3.3: Error handling & edge cases

- Wrap scraper calls in try/catch — individual model failures skip that model, don't abort batch
- If catalogue fetch fails, log error and bail (don't touch offset)
- API returns `[]` if no data yet (first deploy before first cron)

### Verification

- `wrangler dev` → `curl http://localhost:8787/api/models` returns JSON array
- Trigger cron → re-query API → data appears
- `curl http://localhost:8787/` serves HTML

---

## Phase 4 — Frontend Adaptation & Deploy

### Step 4.1: Adapt `index.html` → `public/index.html`

- **Files**: `public/index.html` (copy from root `index.html`)
- Remove: CORS proxy logic, `proxyFetch()`, `fetchAll()` manual button flow, localStorage cache
- Replace with: `fetch('/api/models')` on page load → render grid
- Keep: all CSS, hero section, card rendering, search/sort, skeleton loading states
- Change "Fetch Latest Data" button → auto-loads on page open, button becomes "Refresh"
- Update `lastUpdated` from API response `scraped_at` field

### Step 4.2: Add auto-refresh

- Poll `/api/models` every 5 minutes (`setInterval`) — lightweight since Worker caches
- Show "Data updates every 10 min" in navbar instead of "LIVE" dot

### Step 4.3: Deploy

- `wrangler d1 create chutes-leaderboard` → copy database_id to `wrangler.toml`
- `wrangler d1 execute chutes-leaderboard --remote --file=schema.sql`
- `wrangler deploy`
- Verify cron runs in Cloudflare dashboard → Workers → Triggers

### Step 4.4: Smoke test production

- Visit deployed URL → HTML loads with skeleton → API returns data after first cron
- Check `/api/models` returns JSON
- Wait 30 min → all ~56 models populated

### Verification

- Production URL serves HTML
- `/api/models` returns sorted JSON with `latest_tps`, `name`, etc.
- Cloudflare dashboard shows cron executions every 10 min
- After 30 min, `SELECT count(*) FROM models` ≈ 56

---

## Risk Matrix

| Risk                                            | Likelihood | Severity | Mitigation                                                                       |
| ----------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------- |
| Chutes.ai HTML structure changes (breaks regex) | Medium     | High     | Fail gracefully per-model; log parse errors; regex is already loose              |
| Chutes.ai rate-limits Worker IP                 | Low        | High     | Sequential fetches with 200ms delay between; User-Agent header                   |
| D1 free tier row reads exceeded                 | Low        | Medium   | ~56 rows × 144 reads/day (API) = ~8K reads. Well under 5M                        |
| Catalogue grows past 50 models per batch        | Low        | Low      | Already designed for 25/batch; if >100 models, increase cron cycles              |
| First deploy has no data (cron hasn't run)      | Certain    | Low      | Frontend shows "Loading..." state; manual trigger via `wrangler d1 execute` seed |
| Worker 10ms CPU limit exceeded                  | Low        | Medium   | Regex parsing is fast; no heavy computation; fetch time is I/O not CPU           |

---

## Free Plan Budget Estimate

| Resource               | Usage/day                                    | Limit     | Headroom   |
| ---------------------- | -------------------------------------------- | --------- | ---------- |
| Worker requests (cron) | 144 (6/hr × 24)                              | 100,000   | 99.8% free |
| Worker requests (API)  | ~500 (estimated page views)                  | 100,000   | 99.4% free |
| Subrequests per cron   | 26                                           | 50        | 48% free   |
| D1 rows written/day    | ~8,064 (56 upserts × 144 runs)               | 100,000   | 91.9% free |
| D1 rows read/day       | ~8,064 (reads) + ~500 (API × 56 rows) = ~36K | 5,000,000 | 99.3% free |
| D1 storage             | ~56 rows × ~200 bytes = ~11 KB               | 5 GB      | ~0% used   |
