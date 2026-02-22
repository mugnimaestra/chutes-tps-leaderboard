# Step 003+004: Scraper Module & D1 Helpers

## Files Created

### `src/db.ts` (56 lines)
D1 query helpers — four functions, zero dependencies:
- `getMeta(db, key)` — read from `meta` table, returns `string | null`
- `setMeta(db, key, value)` — `INSERT OR REPLACE` into `meta`
- `upsertModel(db, model)` — `INSERT OR REPLACE` into `models` (all 10 columns)
- `allModels(db)` — `SELECT * FROM models ORDER BY latest_tps DESC`

### `src/scraper.ts` (118 lines)
Server-side scraping logic ported from `index.html` client-side fetcher:
- `fetchCatalogue()` — fetches `https://chutes.ai/app`, parses HTML with regex for `chute_id` + `name`, filters for `standard_template:"vllm"`
- `fetchModelStats(chuteId)` — fetches per-model stats page, extracts daily rows (date, requests, tps, ttft), computes summary (latest, avg_7d, avg_30d, peak_tps)
- `scrapeBatch(db)` — orchestrates one cron invocation:
  1. Fetches full catalogue
  2. Reads `batch_offset` from D1 meta table
  3. Slices 25 models from offset (BATCH_SIZE = 25, stays within 50 subrequest free-plan limit: 1 catalogue + 25 stats = 26)
  4. Fetches stats in parallel via `Promise.all`
  5. Individual failures caught — don't abort batch
  6. Upserts successful results into D1
  7. Advances `batch_offset` (wraps to 0 at end)
  8. Returns `{ scraped, total, errors }`

### Key Design Decisions
- **No external packages** — uses only `fetch`, `AbortController`, `RegExp`, `setTimeout`
- **30s timeout** per fetch via `AbortController` + `setTimeout`
- **User-Agent header** on all requests to chutes.ai
- **Batch rotation** — each cron run processes a different slice, full catalogue covered in `ceil(total/25)` invocations
- **Error isolation** — per-model try/catch in both fetch and DB upsert phases

## Type Check
- `npx tsc --noEmit` — passes with zero errors
