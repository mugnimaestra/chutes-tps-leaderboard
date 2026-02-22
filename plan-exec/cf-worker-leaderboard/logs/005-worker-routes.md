# Step 005 — Worker entry point with routes

## What changed
Replaced the stub `src/index.ts` with the full worker entry point that wires up the API route and scheduled handler.

## Routes implemented
| Route | Handler | Notes |
|---|---|---|
| `GET /api/models` | Queries D1 via `allModels()` | Returns `{ models, total, scraped_at }` with `Cache-Control: public, max-age=300` and CORS `*` |
| All other GET | Falls through to 404 | Static assets served automatically by Wrangler's `assets` config in `wrangler.toml` |
| `scheduled` | Calls `scrapeBatch(env.DB)` | Logs `scraped`, `total`, `errors` counts |

## Response format (`/api/models`)
```json
{
  "models": [...],
  "total": 42,
  "scraped_at": "2026-02-21T..."
}
```

## Verification
- `npx tsc --noEmit` — passes with zero errors
